// Motore dello studio: suona il beat e registra la voce sullo STESSO orologio audio,
// così sappiamo esattamente dove cade la voce rispetto al beat.
import { decodeBlob } from '../../lib/audio.js';
import { concatChunks, encodeWav } from '../../lib/wav.js';

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

  /** Va chiamato dentro un tocco dell'utente (regola di iPhone). */
  unlock() {
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
    if (this.buffers.has(audioId)) return this.buffers.get(audioId);
    const buf = await decodeBlob(this.unlock(), blob);
    this.buffers.set(audioId, buf);
    return buf;
  }

  async ensureMic() {
    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) return;
    const ctx = this.unlock();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    this.micNode = ctx.createMediaStreamSource(this.stream);
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

  releaseMic() {
    try {
      this.micNode?.disconnect();
      this.recNode?.disconnect();
    } catch {
      /* ignorato */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.micNode = null;
    this.recNode = null;
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
  play({ beat, voice = null, from = 0, beatGain = 1, voiceGain = 1, latency = 0, countIn = 0, bpm = 0 }) {
    this.stop();
    const ctx = this.unlock();
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
      s.connect(g).connect(ctx.destination);
      if (from < beat.duration) s.start(t0, from);
      sources.push(s);
    }
    if (voice?.buffer) {
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = voiceGain;
      s.buffer = voice.buffer;
      s.connect(g).connect(ctx.destination);
      const pos = voice.offset - latency; // posizione della voce nel tempo del beat
      const startIn = pos - from;
      if (startIn >= 0) s.start(t0 + startIn);
      else if (-startIn < voice.buffer.duration) s.start(t0, -startIn);
      sources.push(s);
    }
    this.playing = { sources, t0, from, length: Math.max(beat?.duration || 0, voice?.buffer ? voice.offset - latency + voice.buffer.duration : 0) };
    return this.playing;
  }

  /** Posizione attuale nel tempo del beat (secondi; negativa durante il conteggio). */
  position() {
    if (!this.playing || !this.ctx) return null;
    return this.playing.from + (this.ctx.currentTime - this.playing.t0);
  }

  stop() {
    if (!this.playing) return;
    for (const s of this.playing.sources) {
      try {
        s.stop();
      } catch {
        /* già fermo */
      }
    }
    this.playing = null;
  }

  /** Avvia beat + registrazione. Ritorna una promessa risolta allo stop con la take. */
  async record({ beat, from = 0, beatGain = 1, countIn = 0, bpm = 0 }) {
    await this.ensureMic();
    const ctx = this.ctx;
    const chunks = [];
    let firstFrame = null;
    const node = this.recNode;

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
        const samples = concatChunks(chunks);
        const sr = ctx.sampleRate;
        // offset: posizione (nel tempo del beat) del primo campione registrato
        const offset = from + ((firstFrame ?? beatStartFrame) - beatStartFrame) / sr;
        return { samples, sr, offset, duration: samples.length / sr };
      },
    };
  }

  /** Mix beat + voce in un WAV stereo. */
  async renderMix({ beat, voice, latency = 0, beatGain = 1, voiceGain = 1 }) {
    const sr = beat.sampleRate;
    const pos = voice.offset - latency;
    const end = Math.max(beat.duration, pos + voice.buffer.duration);
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(2, Math.ceil(end * sr), sr);
    const b = off.createBufferSource();
    b.buffer = beat;
    const bg = off.createGain();
    bg.gain.value = beatGain;
    b.connect(bg).connect(off.destination);
    b.start(0);
    const v = off.createBufferSource();
    v.buffer = voice.buffer;
    const vg = off.createGain();
    vg.gain.value = voiceGain;
    v.connect(vg).connect(off.destination);
    if (pos >= 0) v.start(pos);
    else v.start(0, -pos);
    const out = await off.startRendering();
    return encodeWav([out.getChannelData(0), out.getChannelData(1)], sr);
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
