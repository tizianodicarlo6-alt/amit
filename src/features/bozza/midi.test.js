import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySignature, sketchToMidi } from './midi.js';
import { drumsFromStyle, newSketchData } from './music.js';

// lettore MIDI minimo per controllare il file
function parse(bytes) {
  const dv = new DataView(bytes.buffer);
  const txt = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
  assert.equal(txt(0, 4), 'MThd');
  const ntr = dv.getUint16(10);
  const ppq = dv.getUint16(12);
  let o = 14;
  const tracks = [];
  for (let k = 0; k < ntr; k++) {
    assert.equal(txt(o, 4), 'MTrk');
    const len = dv.getUint32(o + 4);
    const end = o + 8 + len;
    let p = o + 8;
    let tick = 0;
    const ev = { name: '', notesOn: [], tempo: null, key: null };
    while (p < end) {
      let d = 0;
      let b;
      do {
        b = bytes[p++];
        d = (d << 7) | (b & 0x7f);
      } while (b & 0x80);
      tick += d;
      const st = bytes[p++];
      if (st === 0xff) {
        const type = bytes[p++];
        const l = bytes[p++];
        const data = bytes.slice(p, p + l);
        p += l;
        if (type === 0x03) ev.name = new TextDecoder().decode(data);
        if (type === 0x51) ev.tempo = (data[0] << 16) | (data[1] << 8) | data[2];
        if (type === 0x59) ev.key = [((data[0] << 24) >> 24), data[1]];
      } else {
        const a = bytes[p++];
        const v = bytes[p++];
        if ((st & 0xf0) === 0x90 && v > 0) ev.notesOn.push({ tick, ch: st & 15, pitch: a });
      }
    }
    tracks.push(ev);
    o = end;
  }
  return { ppq, tracks };
}

test('MIDI: tracce, tempo, tonalità e note', () => {
  const sk = { ...newSketchData({ bpm: 120, key: 'Am', bars: 2 }), title: 'Prova', drums: drumsFromStyle('boombap'), chords: [0, 5], notes: { melody: [{ pitch: 69, start: 0, len: 4 }, { pitch: 72, start: 4, len: 4 }], bass: [{ pitch: 33, start: 0, len: 16 }] } };
  const m = parse(sketchToMidi(sk, { loops: 1 }));
  assert.equal(m.ppq, 96);
  assert.deepEqual(m.tracks.map((t) => t.name.split(' ·')[0]), ['Prova', 'Batteria', 'Melodia', 'Accordi', '808']);
  assert.equal(m.tracks[0].tempo, 500000); // 120 BPM
  assert.deepEqual(m.tracks[0].key, [0, 1]); // La minore: nessuna alterazione, modo minore
  const kicks = m.tracks[1].notesOn.filter((n) => n.pitch === 36);
  assert.equal(kicks.length, 6); // boom bap: 3 casse per battuta × 2
  assert.ok(m.tracks[1].notesOn.every((n) => n.ch === 9)); // batteria sul canale 10
  assert.deepEqual(m.tracks[2].notesOn.map((n) => [n.pitch, n.tick]), [[69, 0], [72, 96]]);
  assert.equal(m.tracks[3].notesOn.length, 6); // 2 accordi × 3 note
  assert.equal(m.tracks[4].notesOn[0].pitch, 33);
});

test('alterazioni in chiave', () => {
  assert.deepEqual(keySignature('C'), { sf: 0, minor: false });
  assert.deepEqual(keySignature('F#m'), { sf: 3, minor: true });
  assert.deepEqual(keySignature('Ebm'), { sf: 6, minor: true });
  assert.deepEqual(keySignature('Bb'), { sf: -2, minor: false });
});
