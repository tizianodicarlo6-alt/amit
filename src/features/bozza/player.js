// Fa suonare la bozza in loop col lettore normale dell'iPhone (suona anche col silenzioso).
import { encodeWav } from '../../lib/wav.js';
import { renderSketchWav, renderPreview } from './synth.js';
import { db } from '../../db/db.js';

export class SketchPlayer {
  constructor() {
    this.el = null;
    this.url = null;
    this.loopDur = 0;
    this.version = 0;
    this.fx = null; // lettore per i suoni singoli (anteprima)
  }

  /** Da chiamare DENTRO un tocco: sblocca il lettore. */
  prime() {
    if (!this.el) {
      this.el = new Audio();
      this.el.setAttribute('playsinline', '');
      this.silent = URL.createObjectURL(encodeWav([new Float32Array(2000)], 8000));
    }
    if (!this.fx) {
      this.fx = new Audio();
      this.fx.setAttribute('playsinline', '');
    }
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* non supportato */
    }
    if (this.el.paused) {
      this.el.src = this.silent;
      this.el.play().catch(() => {});
    }
    if (this.fx.paused && !this.fx.src) {
      this.fx.src = this.silent;
      this.fx.play().catch(() => {});
    }
  }

  get playing() {
    return !!this.el && !this.el.paused && this.el.src === this.url;
  }

  /**
   * Suoni caricati dall'utente, pronti da usare: { kick: { buffer }, …, bass: { buffer, root } }.
   * (decodificati una volta e tenuti in memoria)
   */
  async loadSamples(sketch) {
    if (!this.sampleCache) this.sampleCache = new Map();
    const out = {};
    for (const [part, info] of Object.entries(sketch.samples || {})) {
      if (!info?.audioId) continue;
      if (!this.sampleCache.has(info.audioId)) {
        const rec = await db.audio.get(info.audioId);
        if (!rec?.blob) continue;
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new Off(1, 1, 44100);
        const data = await rec.blob.arrayBuffer();
        const decoded = await new Promise((ok, ko) => {
          const pr = ctx.decodeAudioData(data, ok, ko);
          if (pr && pr.then) pr.then(ok, ko);
        });
        this.sampleCache.set(info.audioId, decoded);
      }
      out[part] = { buffer: this.sampleCache.get(info.audioId), root: info.root };
    }
    return out;
  }

  /** Posizione nel loop (secondi). */
  position() {
    if (!this.el || !this.loopDur) return 0;
    return this.el.currentTime % this.loopDur;
  }

  /** Prepara il loop e lo fa partire (o lo aggiorna mantenendo la posizione). */
  async play(sketch, { keepPosition = false } = {}) {
    const v = ++this.version;
    const at = keepPosition && this.playing ? this.position() : 0;
    const samples = await this.loadSamples(sketch);
    const { blob, loopDur } = await renderSketchWav(sketch, { samples });
    if (v !== this.version) return false; // nel frattempo è arrivata una modifica più nuova
    const old = this.url;
    this.url = URL.createObjectURL(blob);
    this.loopDur = loopDur;
    const a = this.el;
    a.loop = true;
    a.src = this.url;
    await new Promise((r) => {
      if (a.readyState >= 1) return r();
      a.onloadedmetadata = r;
      setTimeout(r, 3000);
    });
    try {
      a.currentTime = Math.min(at, loopDur - 0.01);
    } catch {
      /* ignorato */
    }
    await a.play();
    if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
    return true;
  }

  stop() {
    this.version++;
    try {
      this.el?.pause();
    } catch {
      /* ignorato */
    }
  }

  /** Suona un colpo o una nota singola (quando tocchi la griglia). */
  async preview(what, sketch) {
    if (!this.fx) return;
    try {
      const samples = sketch ? await this.loadSamples(sketch) : {};
      const part = what.drum || (what.inst === 'bass808' ? 'bass' : null);
      const blob = await renderPreview({ ...what, sample: part ? samples[part] : null });
      if (this.fxUrl) URL.revokeObjectURL(this.fxUrl);
      this.fxUrl = URL.createObjectURL(blob);
      this.fx.src = this.fxUrl;
      await this.fx.play();
    } catch {
      /* anteprima non essenziale */
    }
  }

  dispose() {
    this.stop();
    for (const u of [this.url, this.fxUrl, this.silent]) if (u) URL.revokeObjectURL(u);
    this.el = null;
    this.fx = null;
  }
}
