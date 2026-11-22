// Sfide di scrittura: una al giorno (uguale per tutto il giorno), brevi, da rapper.
export const SFIDE = [
  '4 barre che finiscono tutte con la stessa multisillabica',
  'Un ritornello dove ogni riga ha 8 sillabe',
  'Racconta la tua strada in 8 barre senza dire "strada"',
  '4 barre con la parola "specchio"',
  'Una strofa tutta al presente, come se stesse succedendo ora',
  '4 barre con almeno due rime interne per riga',
  'Scrivi a te stesso di 10 anni fa, in 8 barre',
  'Un ritornello di 4 righe che si possa cantare dopo un solo ascolto',
  '4 barre con un doppio senso',
  '8 barre partendo da un odore che ti ricorda casa',
  'Una strofa senza la parola "io"',
  '4 barre su un oggetto che hai in tasca adesso',
  'Rima "sotto casa" in 4 modi diversi',
  'Un incastro che regge per 4 barre di fila',
  '8 barre su una notte che non dimentichi',
  'Ritornello con una sola frase ripetuta, cambiando solo l\'ultima parola',
  '4 barre con un paragone che nessuno ha mai usato',
  'Una punchline che si capisce solo alla fine della seconda barra',
  '8 barre su quello che non hai mai detto a tua madre',
  '4 barre con parole da 3 sillabe o più',
  'Scrivi il ritornello prima del titolo, poi trova il titolo dentro il ritornello',
  '4 barre su un colore, senza mai nominarlo',
  'Una strofa che inizia con "ricordo"',
  '8 barre in rima baciata (AABB) senza ripetere mai un suono',
  '4 barre su soldi, ma senza dire soldi, cash o euro',
  'Una barra lunga che riempie tutta la battuta, poi una cortissima',
  '4 barre con l\'anafora: ogni riga inizia uguale',
  '8 barre su un posto dove non torneresti mai',
  'Un ritornello con una domanda dentro',
  '4 barre dove l\'ultima parola di ogni riga è la prima della riga dopo',
  'Scrivi 4 barre ego senza esagerare: solo fatti veri',
  '8 barre sulla prima volta che hai sentito un beat che ti ha cambiato',
  '4 barre in cui ogni riga ha almeno un\'immagine che si vede',
  'Un ritornello melodico con le vocali aperte (a, o) a fine riga',
  '4 barre usando solo frasi brevi, massimo 6 parole',
  '8 barre su chi c\'era quando non avevi niente',
];

/** La sfida di oggi (cambia a mezzanotte); offset per "un'altra". */
export function sfidaDelGiorno(offset = 0, d = new Date()) {
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return SFIDE[(((day + offset) % SFIDE.length) + SFIDE.length) % SFIDE.length];
}
