/** Mette la barra nel testo: al posto della riga vuota dove sei, oppure sotto la riga dove sei. */
export function insertGhostLine(text, at, ghostText) {
  const lines = text.split('\n');
  const i = Math.max(0, Math.min(at, lines.length - 1));
  if (!lines[i]?.trim()) lines[i] = ghostText;
  else lines.splice(i + 1, 0, ghostText);
  return lines.join('\n');
}
