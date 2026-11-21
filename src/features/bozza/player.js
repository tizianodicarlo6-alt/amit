// Fa suonare la bozza in loop col lettore normale dell'iPhone (suona anche col silenzioso).
import { encodeWav } from '../../lib/wav.js';
import { renderSketchWav, renderPreview } from './synth.js';

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

  /** Posizione nel loop (secondi). */
  position() {
    if (!this.el || !this.loopDur) return 0;
    return this.el.currentTime % this.loopDur;
  }

  /** Prepara il loop e lo fa partire (o lo aggiorna mantenendo la posizione). */
  async play(sketch, { keepPosition = false } = {}) {
    const v = ++this.version;
    const at = keepPosition && this.playing ? this.position() : 0;
    const { blob, loopDur } = await renderSketchWav(sketch);
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
  async preview(what) {
    if (!this.fx) return;
    try {
      const blob = await renderPreview(what);
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
