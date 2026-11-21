// Motore dello studio: suona il beat e registra la voce sullo STESSO orologio audio,
// così sappiamo esattamente dove cade la voce rispetto al beat.
import { decodeBlob } from '../../lib/audio.js';
import { concatChunks, encodeWav, peakOf } from '../../lib/wav.js';

const SILENCE = 0.0008; // sotto questo picco la registrazione è considerata muta
import { activeRms, buildBeatCarve, buildMaster, buildVoiceChain, levelGainFor } from './fx.js';

// Processore audio che raccoglie i campioni del microfono (gira nel thread audio).
const WORKLET = `
class AmitRec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = new Float32Array(4096);
    this.n = 0;
    this.start = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'start') { this.on = true; this.n = 0; }
      if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage({ type: 'stopped' }); }
    };
  }
  flush() {
    if (this.n) this.port.postMessage({ type: 'data', frame: this.start, data: this.buf.slice(0, this.n) });
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (this.on && ch) {
      if (this.n === 0) this.start = currentFrame;
      if (this.n + ch.length > this.buf.length) { this.flush(); this.start = currentFrame; }
      this.buf.set(ch, this.n);
      this.n += ch.length;
    }
    return true;
  }
}
registerProcessor('amit-rec', AmitRec);
`;

export class StudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.micNode = null;
    this.recNode = null;
    this.useWorklet = false;
    this.buffers = new Map(); // audioId → AudioBuffer
    this.playing = null; // { sources, startTime, from }
    this.capture = null;
  }

  /**
   * iPhone in modalità silenziosa: l'audio "da app" (Web Audio) viene ammutolito.
   * Dico a Safari che siamo un lettore musicale (Audio Session API, iOS 17+)
   * e, per i telefoni più vecchi, tengo in sottofondo un audio silenzioso
   * (un normale elemento <audio>, che suona anche col silenzioso).
   */
  setSession(type) {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type;
    } catch {
      /* non supportato */
    }
  }

  keepAlive() {
    try {
      if (!this.keep) {
        const url = URL.createObjectURL(encodeWav([new Float32Array(8000)], 8000));
        const a = new Audio();
        a.src = url;
        a.loop = true;
        a.setAttribute('playsinline', '');
        a.preload = 'auto';
        this.keep = a;
      }
      if (this.keep.paused) this.keep.play().catch(() => {});
    } catch {
      /* ignorato */
    }
  }

  dispose() {
    this.stop();
    this.releaseMic();
    try {
      this.player?.pause();
      if (this.playerUrl) URL.revokeObjectURL(this.playerUrl);
      if (this.silentUrl) URL.revokeObjectURL(this.silentUrl);
    } catch {
      /* ignorato */
    }
    this.player = null;
    this.playerUrl = null;
    try {
      this.keep?.pause();
      if (this.keep?.src) URL.revokeObjectURL(this.keep.src);
    } catch {
      /* ignorato */
    }
    this.keep = null;
    this.ctx?.close?.().catch(() => {});
    this.ctx = null;
    this.setSession('auto');
  }

  /** Va chiamato dentro un tocco dell'utente (regola di iPhone). */
  unlock() {
    if (!this.stream) this.setSession('playback');
    this.keepAlive();
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  get sampleRate() {
    return this.ctx?.sampleRate || 48000;
  }

  /** Stima del ritardo dell'uscita audio (cuffie), in secondi. */
  estimatedLatency() {
    const c = this.ctx;
    if (!c) return 0.04;
    return (c.baseLatency || 0) + (c.outputLatency || 0) || 0.04;
  }

  async loadBuffer(audioId, blob) {
    if (!this.blobs) this.blobs = new Map();
    this.blobs.set(audioId, blob);
    if (this.buffers.has(audioId)) return this.buffers.get(audioId);
    const buf = await decodeBlob(this.unlock(), blob);
    this.buffers.set(audioId, buf);
    return buf;
  }

  async ensureMic({ speaker = false } = {}) {
    const live = this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live');
    if (live && this.micNode && this.micSpeaker === speaker) return;
    if (live) this.releaseMic();
    this.setSession('play-and-record');
    // Senza cuffie: cancellazione eco, così il beat che esce dall'altoparlante non finisce nella voce
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: speaker, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.micSpeaker = speaker;
    // Safari su iPhone: se il contesto audio è nato PRIMA del microfono, a volte registra silenzio.
    // Lo ricreo adesso (i beat già caricati restano validi).
    if (this.ctx && !this.ctxAfterMic) {
      try {
        await this.ctx.close();
      } catch {
        /* ignorato */
      }
      this.ctx = null;
      this.workletLoaded = false;
    }
    const ctx = this.unlock();
    this.ctxAfterMic = true;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    this.micNode = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.micNode.connect(this.analyser);
    const sink = ctx.createGain();
    sink.gain.value = 0; // il nodo deve essere collegato all'uscita per funzionare, ma muto
    sink.connect(ctx.destination);
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      if (!this.workletLoaded) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        this.workletLoaded = true;
      }
      this.recNode = new AudioWorkletNode(ctx, 'amit-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      this.useWorklet = true;
    } catch {
      // Piano B per browser vecchi
      this.recNode = ctx.createScriptProcessor(4096, 1, 1);
      this.useWorklet = false;
    }
    this.micNode.connect(this.recNode);
    this.recNode.connect(sink);
  }

  /** Livello del microfono adesso (0–1), per l'indicatore. */
  micLevel() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    return peakOf(buf);
  }

  releaseMic() {
    try {
      this.monitor?.disconnect();
      this.micNode?.disconnect();
      this.recNode?.disconnect();
    } catch {
      /* ignorato */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.micNode = null;
    this.recNode = null;
    this.analyser = null;
  }

  /**
   * Fine registrazione: spengo il microfono e ricreo l'audio al prossimo tocco.
   * Su iPhone, col microfono acceso l'audio esce dalla capsula delle chiamate (bassissimo):
   * così il riascolto torna sull'altoparlante a volume pieno.
   */
  async endMicSession() {
    this.releaseMic();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* ignorato */
      }
    }
    this.ctx = null;
    this.ctxAfterMic = false;
    this.workletLoaded = false;
    this.setSession('playback');
  }

  click(time, accent) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.6, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    o.connect(g).connect(ctx.destination);
    o.start(time);
    o.stop(time + 0.1);
    return o;
  }

  /**
   * Suona beat (e opzionalmente una voce) da `from` secondi.
   * voice: { buffer, offset } — offset = dove cade il campione 0 della voce nel tempo del beat.
   */
  play({ beat, voice = null, from = 0, beatGain = 1, voiceGain = 1, latency = 0, countIn = 0, bpm = 0, fx = 'provino' }) {
    this.stop();
    const ctx = this.unlock();
    const master = buildMaster(ctx);
    const lead = 0.12;
    const clickDur = countIn && bpm ? (60 / bpm) * countIn : 0;
    const t0 = ctx.currentTime + lead + clickDur; // momento in cui il beat (posizione `from`) suona
    const sources = [];
    for (let i = 0; i < (clickDur ? countIn : 0); i++) sources.push(this.click(ctx.currentTime + lead + (i * 60) / bpm, i === 0));
    let beatNode = null;
    let voiceNode = null;
    if (beat) {
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = beatGain;
      s.buffer = beat;
      if (voice) {
        const carve = buildBeatCarve(ctx);
        s.connect(carve.input);
        carve.output.connect(g).connect(master);
      } else s.connect(g).connect(ctx.destination);
      if (from < beat.duration) s.start(t0, from);
      sources.push(s);
      beatNode = g;
    }
    if (voice?.buffer) {
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = voiceGain;
      s.buffer = voice.buffer;
      const chain = buildVoiceChain(ctx, fx, { bpm, level: this.voiceLevel(voice.buffer, beat) });
      s.connect(chain.input);
      chain.output.connect(g).connect(master);
      voiceNode = g;
      const pos = voice.offset - latency; // posizione della voce nel tempo del beat
      const startIn = pos - from;
      if (startIn >= 0) s.start(t0 + startIn);
      else if (-startIn < voice.buffer.duration) s.start(t0, -startIn);
      sources.push(s);
    }
    this.playing = { sources, master, beatNode, voiceNode, t0, from, length: Math.max(beat?.duration || 0, voice?.buffer ? voice.offset - latency + voice.buffer.duration : 0) };
    return this.playing;
  }

  // ---------- Riascolto col lettore "normale" dell'iPhone ----------
  // Il lettore <audio> suona sempre (anche col silenzioso), a differenza del Web Audio.

  /** Da chiamare DENTRO il tocco: "sblocca" il lettore per poterlo far partire dopo. */
  primePlayer() {
    if (!this.player) {
      const a = new Audio();
      a.setAttribute('playsinline', '');
      a.preload = 'auto';
      this.player = a;
      this.silentUrl = URL.createObjectURL(encodeWav([new Float32Array(4000)], 8000));
    }
    const a = this.player;
    if (a.paused || a.ended) {
      a.src = this.silentUrl;
      a.loop = true;
      a.play().catch(() => {});
    }
  }

  /** Suona un Blob dal lettore; `base` = secondo del beat che corrisponde all'inizio del file. */
  async playBlob(blob, { base = 0, startIn = 0, length }) {
    this.stop();
    const a = this.player || (this.primePlayer(), this.player);
    if (this.playerUrl) URL.revokeObjectURL(this.playerUrl);
    this.playerUrl = URL.createObjectURL(blob);
    a.loop = false;
    a.src = this.playerUrl;
    await new Promise((resolve) => {
      if (a.readyState >= 1) return resolve();
      a.onloadedmetadata = resolve;
      a.onerror = resolve;
      setTimeout(resolve, 4000);
    });
    try {
      a.currentTime = startIn;
    } catch {
      /* ignorato */
    }
    await a.play();
    this.playing = { media: a, base, sources: [], master: null, t0: 0, from: base + startIn, length };
    return this.playing;
  }

  /** Solo beat, da `from` secondi. */
  playBeatMedia(audioId, from, duration) {
    const blob = this.blobs?.get(audioId);
    if (!blob) throw new Error('beat non caricato');
    return this.playBlob(blob, { base: 0, startIn: from, length: duration });
  }

  /** Beat + take con effetti: preparo il mix del pezzo che serve e lo suono dal lettore. */
  async playMixMedia({ beat, voice, from, latency = 0, beatGain = 1, voiceGain = 1, fx = 'provino', bpm = 0 }) {
    const voiceEnd = voice.offset - latency + voice.buffer.duration;
    const to = Math.min(beat.duration, Math.max(from + 2, voiceEnd + 3));
    const blob = await this.renderMix({ beat, voice, latency, beatGain, voiceGain, fx, bpm, from, to });
    return this.playBlob(blob, { base: from, startIn: 0, length: to });
  }

  /** Secondi che mancano alla partenza del beat (durante il conteggio), altrimenti 0. */
  countInLeft() {
    if (!this.playing || this.playing.media || !this.ctx) return 0;
    return Math.max(0, this.playing.t0 - this.ctx.currentTime);
  }

  /** Volumi dal vivo mentre suona. */
  setGains({ beatGain, voiceGain }) {
    const p = this.playing;
    if (!p || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (beatGain != null && p.beatNode) p.beatNode.gain.setTargetAtTime(beatGain, t, 0.03);
    if (voiceGain != null && p.voiceNode) p.voiceNode.gain.setTargetAtTime(voiceGain, t, 0.03);
  }

  /** Posizione attuale nel tempo del beat (secondi; negativa durante il conteggio). */
  position() {
    if (!this.playing) return null;
    const m = this.playing.media;
    if (m) return m.ended ? this.playing.length + 1 : this.playing.base + m.currentTime;
    if (!this.ctx) return null;
    return this.playing.from + (this.ctx.currentTime - this.playing.t0);
  }

  stop() {
    if (!this.playing) return;
    if (this.playing.media) {
      try {
        this.playing.media.pause();
      } catch {
        /* ignorato */
      }
      this.playing = null;
      return;
    }
    for (const s of this.playing.sources) {
      try {
        s.stop();
      } catch {
        /* già fermo */
      }
    }
    const { master } = this.playing;
    // stacco il master poco dopo, così le code di riverbero non restano appese
    setTimeout(() => {
      try {
        master.disconnect();
      } catch {
        /* ignorato */
      }
    }, 50);
    this.playing = null;
  }

  /** Avvia beat + registrazione. Ritorna una promessa risolta allo stop con la take. */
  async record({ beat, from = 0, beatGain = 1, countIn = 0, bpm = 0, monitor = false, fx = 'pulita', speaker = false }) {
    await this.ensureMic({ speaker });
    const ctx = this.ctx;
    const chunks = [];
    let firstFrame = null;
    const node = this.recNode;

    // Registrazione di riserva (MediaRecorder): se la principale esce muta uso questa
    let mr = null;
    const mrChunks = [];
    let mrStart = null;
    try {
      if (typeof MediaRecorder !== 'undefined') {
        const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
        mr = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
        mr.ondataavailable = (e) => e.data?.size && mrChunks.push(e.data);
        mr.onstart = () => (mrStart = ctx.currentTime);
        mr.start();
      }
    } catch {
      mr = null;
    }

    // "Sentiti in cuffia": la tua voce (con l'effetto scelto) mentre registri
    if (monitor && !speaker) {
      const chain = buildVoiceChain(ctx, fx, { bpm, level: 1.6 });
      this.micNode.connect(chain.input);
      chain.output.connect(ctx.destination);
      this.monitor = chain.input;
    }

    if (this.useWorklet) {
      node.port.onmessage = (e) => {
        if (e.data.type === 'data') {
          if (firstFrame === null) firstFrame = e.data.frame;
          chunks.push(e.data.data);
        }
      };
      node.port.postMessage('start');
    } else {
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        if (firstFrame === null) firstFrame = Math.round((e.playbackTime - e.inputBuffer.duration) * ctx.sampleRate);
        chunks.push(new Float32Array(data));
      };
    }

    const playing = this.play({ beat, from, beatGain, countIn, bpm });
    const beatStartFrame = Math.round(playing.t0 * ctx.sampleRate);

    return {
      stop: async () => {
        this.stop();
        if (this.useWorklet) {
          await new Promise((resolve) => {
            const prev = node.port.onmessage;
            node.port.onmessage = (e) => {
              prev(e);
              if (e.data.type === 'stopped') resolve();
            };
            node.port.postMessage('stop');
            setTimeout(resolve, 500);
          });
          node.port.onmessage = null;
        } else node.onaudioprocess = null;
        if (this.monitor) {
          try {
            this.micNode.disconnect(this.monitor);
          } catch {
            /* ignorato */
          }
          this.monitor = null;
        }
        if (mr && mr.state !== 'inactive') {
          await new Promise((resolve) => {
            mr.onstop = resolve;
            mr.stop();
            setTimeout(resolve, 1500);
          });
        }
        let samples = concatChunks(chunks);
        let sr = ctx.sampleRate;
        // offset: posizione (nel tempo del beat) del primo campione registrato
        let offset = from + ((firstFrame ?? beatStartFrame) - beatStartFrame) / sr;
        let usedBackup = false;
        if (peakOf(samples) < SILENCE && mrChunks.length) {
          try {
            const buf = await decodeBlob(ctx, new Blob(mrChunks, { type: mr.mimeType || mrChunks[0].type }));
            const alt = new Float32Array(buf.getChannelData(0));
            if (peakOf(alt) >= SILENCE) {
              samples = alt;
              sr = buf.sampleRate;
              offset = from + ((mrStart ?? playing.t0) - playing.t0);
              usedBackup = true;
            }
          } catch {
            /* resta la principale */
          }
        }
        return { samples, sr, offset, duration: samples.length / sr, silent: peakOf(samples) < SILENCE, usedBackup };
      },
    };
  }

  /** RMS memorizzato (calcolato una volta per audio). */
  rmsOf(buffer) {
    if (!this.rms) this.rms = new WeakMap();
    if (!this.rms.has(buffer)) this.rms.set(buffer, activeRms(buffer));
    return this.rms.get(buffer);
  }

  /** Livello della voce pensato sul beat: stesso volume medio del beat (poi lo regola "Voce sul beat"). */
  voiceLevel(voiceBuf, beatBuf) {
    const beatRms = beatBuf ? this.rmsOf(beatBuf) : 0;
    const target = beatRms ? Math.max(0.05, Math.min(0.3, beatRms)) : 0.1;
    const vr = this.rmsOf(voiceBuf);
    return vr ? Math.max(0.5, Math.min(12, target / vr)) : levelGainFor(voiceBuf);
  }

  /** Mix beat + voce (con effetti) in un WAV stereo. */
  async renderMix({ beat, voice, latency = 0, beatGain = 1, voiceGain = 1, fx = 'provino', bpm = 0, from = 0, to = null }) {
    const sr = beat.sampleRate;
    const pos = voice.offset - latency - from; // posizione della voce dentro al pezzo da preparare
    const end = to != null ? to - from : Math.max(beat.duration, voice.offset - latency + voice.buffer.duration) + 1.5; // coda del riverbero
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(2, Math.ceil(end * sr), sr);
    const master = buildMaster(off);
    const b = off.createBufferSource();
    b.buffer = beat;
    const bg = off.createGain();
    bg.gain.value = beatGain;
    const carve = buildBeatCarve(off);
    b.connect(carve.input);
    carve.output.connect(bg).connect(master);
    b.start(0, from);
    const v = off.createBufferSource();
    v.buffer = voice.buffer;
    const vg = off.createGain();
    vg.gain.value = voiceGain;
    const chain = buildVoiceChain(off, fx, { bpm, level: this.voiceLevel(voice.buffer, beat) });
    v.connect(chain.input);
    chain.output.connect(vg).connect(master);
    if (pos >= 0) v.start(pos);
    else if (-pos < voice.buffer.duration) v.start(0, -pos);
    const out = await off.startRendering();
    const L = out.getChannelData(0);
    const R = out.getChannelData(1);
    // Sicurezza finale: niente distorsione, picco massimo a -1 dB
    const peak = Math.max(peakOf(L), peakOf(R));
    const ceiling = 0.89;
    if (peak > ceiling) {
      const k = ceiling / peak;
      for (let i = 0; i < L.length; i++) {
        L[i] *= k;
        R[i] *= k;
      }
    }
    return encodeWav([L, R], sr);
  }

  /** Solo voce, allineata all'inizio del beat (si mette a 0:00 nel progetto dello studio). */
  renderVoiceAligned({ voice, latency = 0 }) {
    const buf = voice.buffer;
    const sr = buf.sampleRate;
    const shift = Math.round((voice.offset - latency) * sr); // campioni di silenzio da aggiungere (o togliere)
    const src = buf.getChannelData(0);
    const len = Math.max(0, src.length + shift);
    const out = new Float32Array(len);
    if (shift >= 0) out.set(src, shift);
    else out.set(src.subarray(-shift));
    return encodeWav([out], sr);
  }
}

/** Converte i campioni registrati in WAV mono. */
export const takeToWav = (samples, sr) => encodeWav([samples], sr);
