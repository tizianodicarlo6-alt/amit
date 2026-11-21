// Motore dello studio: suona il beat e registra la voce sullo STESSO orologio audio,
// così sappiamo esattamente dove cade la voce rispetto al beat.
import { decodeBlob } from '../../lib/audio.js';
import { concatChunks, encodeWav, peakOf } from '../../lib/wav.js';

const SILENCE = 0.0008; // sotto questo picco la registrazione è considerata muta
import { activeRms, buildBeatCarve, buildMaster, buildVoiceChain, levelGainFor } from './fx.js';
import { pitchShift } from '../../lib/pitch.js';

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
   * Collega una voce: sorgente → (cancello punch-in) → effetti → volume → pan → master.
   * v = { buffer, pos (secondo del beat del 1° campione), gain, pan, active: [[s,e]…] | null }
   * t0 = istante (nel contesto) in cui suona il secondo `from` del beat.
   */
  connectVoice(ctx, master, v, { from, t0, fx, bpm, beat }) {
    const s = ctx.createBufferSource();
    s.buffer = v.buffer;
    let head = s;
    if (v.active) {
      const gate = ctx.createGain();
      gate.gain.value = 0;
      for (const [a, b] of v.active) {
        const ta = t0 + (a - from);
        const tb = t0 + (b - from);
        if (tb <= t0) continue;
        gate.gain.setTargetAtTime(1, Math.max(t0, ta), 0.012);
        gate.gain.setTargetAtTime(0, tb, 0.012);
      }
      s.connect(gate);
      head = gate;
    }
    const chain = buildVoiceChain(ctx, v.fx || fx, { bpm, level: this.voiceLevel(v.buffer, beat) });
    head.connect(chain.input);
    const g = ctx.createGain();
    g.gain.value = v.gain ?? 1;
    chain.output.connect(g);
    let out = g;
    if (v.pan && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = v.pan;
      g.connect(pn);
      out = pn;
    }
    out.connect(master);
    // taglio: suona solo da trimStart a trimEnd della take
    const ts = Math.max(0, v.trimStart || 0);
    const te = Math.min(v.buffer.duration, v.trimEnd ?? v.buffer.duration);
    if (te - ts <= 0.01) return s;
    const startIn = v.pos + ts - from;
    if (startIn >= 0) s.start(t0 + startIn, ts, te - ts);
    else if (-startIn < te - ts) s.start(t0, ts - startIn, te - ts + startIn);
    return s;
  }

  /**
   * Suona (Web Audio) beat e voci da `from` secondi. Usato durante la registrazione:
   * col microfono acceso l'iPhone lo fa sentire sempre.
   */
  play({ beat, voices = [], from = 0, beatGain = 1, countIn = 0, bpm = 0, fx = 'provino' }) {
    this.stop();
    const ctx = this.unlock();
    const master = buildMaster(ctx);
    const lead = 0.12;
    const clickDur = countIn && bpm ? (60 / bpm) * countIn : 0;
    const t0 = ctx.currentTime + lead + clickDur; // momento in cui il beat (posizione `from`) suona
    const sources = [];
    for (let i = 0; i < (clickDur ? countIn : 0); i++) sources.push(this.click(ctx.currentTime + lead + (i * 60) / bpm, i === 0));
    if (beat) {
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = beatGain;
      s.buffer = beat;
      if (voices.length) {
        const carve = buildBeatCarve(ctx);
        s.connect(carve.input);
        carve.output.connect(g).connect(master);
      } else s.connect(g).connect(ctx.destination);
      if (from < beat.duration) s.start(t0, from);
      sources.push(s);
    }
    for (const v of voices) sources.push(this.connectVoice(ctx, master, v, { from, t0, fx, bpm, beat }));
    this.playing = { sources, master, t0, from, length: beat?.duration || 0 };
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

  /** Beat + voci con effetti: preparo il mix del pezzo che serve e lo suono dal lettore. */
  async playMixMedia({ beat, voices, from, beatGain = 1, fx = 'provino', bpm = 0 }) {
    const voiceEnd = Math.max(0, ...voices.map((v) => v.pos + (v.trimEnd ?? v.buffer.duration)));
    const to = Math.min(beat.duration, Math.max(from + 2, voiceEnd + 3));
    const blob = await this.renderMix({ beat, voices, beatGain, fx, bpm, from, to });
    return this.playBlob(blob, { base: from, startIn: 0, length: to });
  }

  /** Secondi che mancano alla partenza del beat (durante il conteggio), altrimenti 0. */
  countInLeft() {
    if (!this.playing || this.playing.media || !this.ctx) return 0;
    return Math.max(0, this.playing.t0 - this.ctx.currentTime);
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
  async record({ beat, from = 0, beatGain = 1, countIn = 0, bpm = 0, monitor = false, fx = 'pulita', speaker = false, guide = [] }) {
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

    const playing = this.play({ beat, voices: guide, from, beatGain, countIn, bpm, fx });
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

  /**
   * Misura il ritardo reale altoparlante → microfono: suona 8 click e li riascolta.
   * Ritorna i secondi da compensare, oppure null se la misura non è affidabile.
   */
  async calibrate() {
    await this.ensureMic({ speaker: false }); // niente cancellazione eco: i click devono entrare
    const ctx = this.ctx;
    const node = this.recNode;
    const chunks = [];
    let firstFrame = null;
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
        if (firstFrame === null) firstFrame = Math.round((e.playbackTime - e.inputBuffer.duration) * ctx.sampleRate);
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
    }
    const sr = ctx.sampleRate;
    const t0 = ctx.currentTime + 0.4;
    const gap = 0.45;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * gap;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 2000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.05);
    }
    await new Promise((r) => setTimeout(r, (0.4 + n * gap + 0.6) * 1000));
    if (this.useWorklet) node.port.postMessage('stop');
    else node.onaudioprocess = null;
    await new Promise((r) => setTimeout(r, 200));
    if (this.useWorklet) node.port.onmessage = null;
    const x = concatChunks(chunks);
    if (firstFrame === null || !x.length) return null;
    const delays = [];
    for (let i = 0; i < n; i++) {
      const expected = Math.round((t0 + i * gap) * sr) - firstFrame;
      const lo = Math.max(0, expected);
      const hi = Math.min(x.length, expected + Math.round(0.4 * sr));
      let peak = 0;
      for (let j = lo; j < hi; j++) peak = Math.max(peak, Math.abs(x[j]));
      if (peak < 0.02) continue;
      const thr = peak * 0.35;
      for (let j = lo; j < hi; j++) {
        if (Math.abs(x[j]) >= thr) {
          delays.push((j - expected) / sr);
          break;
        }
      }
    }
    if (delays.length < 4) return null;
    delays.sort((a, b) => a - b);
    const med = delays[Math.floor(delays.length / 2)];
    const spread = delays[Math.floor(delays.length * 0.75)] - delays[Math.floor(delays.length * 0.25)];
    if (spread > 0.03 || med < 0 || med > 0.6) return null;
    return med;
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

  /** Mix beat + voci (con effetti) in un WAV stereo, dal secondo `from` al secondo `to`. */
  async renderMix({ beat, voices, beatGain = 1, fx = 'provino', bpm = 0, from = 0, to = null }) {
    const sr = beat.sampleRate;
    const lastVoice = Math.max(0, ...voices.map((v) => v.pos + (v.trimEnd ?? v.buffer.duration)));
    const end = (to ?? Math.max(beat.duration, lastVoice) + 1.5) - from; // +1.5 s: coda del riverbero
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(2, Math.max(1, Math.ceil(end * sr)), sr);
    const master = buildMaster(off);
    const b = off.createBufferSource();
    b.buffer = beat;
    const bg = off.createGain();
    bg.gain.value = beatGain;
    const carve = buildBeatCarve(off);
    b.connect(carve.input);
    carve.output.connect(bg).connect(master);
    if (from < beat.duration) b.start(0, from);
    for (const v of voices) this.connectVoice(off, master, v, { from, t0: 0, fx, bpm, beat });
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

  /** Solo voce (col taglio e il pitch), allineata all'inizio del beat: si mette a 0:00. */
  renderVoiceAligned({ voice }) {
    const buf = voice.buffer;
    const sr = buf.sampleRate;
    const src = buf.getChannelData(0);
    const ts = Math.max(0, voice.trimStart || 0);
    const te = Math.min(buf.duration, voice.trimEnd ?? buf.duration);
    const startAt = Math.round((voice.pos + ts) * sr); // dove inizia il pezzo nel tempo del beat
    const len = Math.max(0, startAt + Math.round((te - ts) * sr));
    const out = new Float32Array(len);
    const from = Math.round(ts * sr);
    for (let i = 0; i < len - Math.max(0, startAt); i++) {
      const o = startAt + i;
      const j = from + i;
      if (o >= 0 && o < len && j < src.length) out[o] = src[j];
    }
    return encodeWav([out], sr);
  }

  /** Versione con pitch di una take (calcolata una volta e tenuta in memoria). */
  pitched(audioId, buffer, semitones) {
    if (!semitones) return buffer;
    if (!this.pitchCache) this.pitchCache = new Map();
    const key = `${audioId}:${semitones}`;
    if (this.pitchCache.has(key)) return this.pitchCache.get(key);
    const data = pitchShift(buffer.getChannelData(0), buffer.sampleRate, semitones);
    let out;
    try {
      out = new AudioBuffer({ length: data.length, sampleRate: buffer.sampleRate, numberOfChannels: 1 });
    } catch {
      out = this.unlock().createBuffer(1, data.length, buffer.sampleRate);
    }
    out.copyToChannel(data, 0);
    this.pitchCache.set(key, out);
    return out;
  }
}

/** Converte i campioni registrati in WAV mono. */
export const takeToWav = (samples, sr) => encodeWav([samples], sr);
