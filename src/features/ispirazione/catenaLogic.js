// Catena di rime: logica pura.
import { assonanceKey, rhymeKey, tokenizeLine, vowelSeq } from '../../lib/italiano.js';

/** Come chiude la riga rispetto alla parola: 'rima' | 'multi' | 'assonanza' | null */
export function closesOn(line, word) {
  const words = tokenizeLine(line).filter((p) => p.key);
  const last = words[words.length - 1];
  if (!last) return null;
  if (last.text.toLowerCase() === word.toLowerCase()) return 'stessa';
  if (last.key === rhymeKey(word)) return 'rima';
  const target = vowelSeq(word).slice(-3).join('');
  const lineV = tokenizeLine(line).flatMap((p) => (/[a-zàèéìòù]/i.test(p.text) ? vowelSeq(p.text) : []));
  if (target.length === 3 && lineV.slice(-3).join('') === target) return 'multi';
  if (last.akey && last.akey === assonanceKey(word)) return 'assonanza';
  return null;
}

