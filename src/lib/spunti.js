// Intenzioni, generi e atmosfere del pezzo + spunti creativi per ognuno. Tutto offline.

export const MOODS = [
  { id: 'aggressiva', label: 'Aggressiva', q: ['Chi ti ha sottovalutato e cosa gli diresti oggi in faccia?', 'Cosa ti fa salire il sangue alla testa appena ci pensi?', 'Se questa barra fosse un pugno, dove colpirebbe?', 'Cosa non accetti più, da oggi?'] },
  { id: 'triste', label: 'Triste', q: ["Qual è l'ultima volta che hai fatto finta di stare bene?", 'Cosa ti manca che non tornerà?', 'A chi scriveresti un messaggio stanotte, senza mandarlo?', 'Che cosa ti pesa ma non lo dici a nessuno?'] },
  { id: 'nostalgica', label: 'Nostalgica', q: ['Un posto della tua infanzia: com\'era l\'odore?', 'Chi eri a 15 anni e cosa gli diresti?', 'Una canzone che ti riporta a un momento preciso: quale?', 'Cosa facevate tu e i tuoi amici quando non avevate niente?'] },
  { id: 'amore', label: "D'amore", q: ['Un dettaglio di lei/lui che nessun altro nota', 'La frase che non sei mai riuscito a dirle/dirgli', 'Com\'è il silenzio quando siete insieme?', 'Cosa cambieresti di te per non perderla/perderlo?'] },
  { id: 'rabbiosa', label: 'Rabbiosa', q: ['Cosa ti hanno tolto che era tuo?', 'Contro chi o cosa stai combattendo davvero?', 'Cosa urleresti se nessuno potesse sentirti?', 'Quale ingiustizia vedi ogni giorno sotto casa?'] },
  { id: 'malinconica', label: 'Malinconica', q: ['Quale momento felice oggi ti fa male ricordare?', 'Cosa vedi dalla finestra quando non dormi?', 'Una persona che è cambiata: com\'era prima?', 'Cosa ti lascia addosso la domenica sera?'] },
  { id: 'introspettiva', label: 'Introspettiva', q: ['Di cosa hai paura davvero, sotto tutto il resto?', 'In cosa assomigli a tuo padre o tua madre, anche se non vuoi?', 'Cosa ti racconti per andare avanti?', 'Chi sei quando sei da solo in macchina?'] },
  { id: 'motivazionale', label: 'Motivazionale', q: ['Qual è stato il momento più basso, e cosa ti ha fatto rialzare?', 'Cosa diresti a chi parte da dove sei partito tu?', 'Qual è il tuo obiettivo tra un anno, detto senza vergogna?', 'Cosa hai fatto quando nessuno credeva in te?'] },
  { id: 'festa', label: 'Festa', q: ['La serata migliore di sempre: cosa è successo?', 'Chi c\'è con te quando la notte non finisce?', 'Cosa si beve, cosa si balla, cosa si dimentica?', 'Il momento in cui parte il pezzo e il locale esplode'] },
  { id: 'dark', label: 'Dark', q: ['Cosa vedi quando chiudi gli occhi e non vorresti?', 'Il lato di te che non fai vedere a nessuno', 'Un posto dove non torneresti mai, e perché', 'Cosa succede alle 4 di notte nella tua testa?'] },
  { id: 'riscatto', label: 'Riscatto', q: ['Da dove sei partito, in una sola immagine?', 'Chi ti ha detto che non ce l\'avresti fatta?', 'Cosa compreresti per primo a tua madre?', 'Quale porta ti hanno chiuso in faccia?'] },
  { id: 'spensierata', label: 'Spensierata', q: ['Cosa ti fa ridere anche nei giorni brutti?', 'Il tuo giorno perfetto, dalla mattina alla sera', 'Una cosa stupida che ami fare', 'Dove andresti adesso se potessi partire subito?'] },
];

export const GENRES = [
  { id: 'rap', label: 'Rap', tip: 'Punta su incastri e contenuto: ogni barra deve dire qualcosa.' },
  { id: 'trap', label: 'Trap', tip: 'Frasi brevi, ripetizioni che restano in testa, ad-lib tra una barra e l\'altra.' },
  { id: 'conscious', label: 'Conscious', tip: 'Racconta un fatto vero e poi cosa ne pensi: dal particolare al generale.' },
  { id: 'ego', label: 'Ego', tip: 'Elenca cose concrete che hai fatto tu e gli altri no. Esagera con stile.' },
  { id: 'drill', label: 'Drill', tip: 'Flow spezzato sulle terzine, immagini crude, poche parole ma pesanti.' },
  { id: 'melodico', label: 'Melodico', tip: 'Prima trova la melodia col nanana, poi le parole che ci stanno dentro.' },
  { id: 'storytelling', label: 'Storytelling', tip: 'Un personaggio, un luogo, un problema. Ogni strofa un capitolo.' },
  { id: 'love', label: 'Love / R&B', tip: 'Dettagli piccoli e veri valgono più di mille "ti amo".' },
  { id: 'boombap', label: 'Boom bap', tip: 'Multisillabiche fitte e punchline: gioca coi doppi sensi.' },
  { id: 'freestyle', label: 'Freestyle', tip: 'Parti da quello che vedi intorno a te adesso e lascia andare.' },
];

// Atmosfere: colore della sfera, parole e immagini da cui partire
export const ATMOS = [
  { id: 'notte', label: 'Notte in città', color: ['#3b2a8f', '#0a1a4a'], words: ['lampioni', 'sirene', 'asfalto', 'neon', 'insonnia', 'taxi', 'finestrini', 'fumo', 'tangenziale', 'citofono'], img: ['il vapore che esce dai tombini alle 4', 'la luce blu della volante sui palazzi', 'il bar che chiude e le sedie sopra i tavoli', 'la città vista dal tetto, tutta accesa', 'le cuffie nelle orecchie sul notturno'] },
  { id: 'pioggia', label: 'Pioggia sul vetro', color: ['#4d6a85', '#1c2733'], words: ['gocce', 'vetro', 'grigio', 'ombrello', 'pozzanghere', 'tuoni', 'umido', 'nuvole', 'riflessi', 'silenzio'], img: ['le gocce che fanno a gara sul finestrino', 'una pozzanghera che riflette i semafori', 'i vestiti bagnati appesi in camera', 'il rumore della pioggia sulla lamiera', 'una fermata del bus vuota'] },
  { id: 'tramonto', label: 'Tramonto al mare', color: ['#ff7a3d', '#7a1f5c'], words: ['sale', 'orizzonte', 'sabbia', 'onde', 'arancione', 'scogli', 'gabbiani', 'pelle', 'vento', 'estate'], img: ['il sole che si spegne nel mare', 'le infradito lasciate sugli scogli', 'il sale sulla pelle dopo il bagno', 'l\'ultimo bagno della stagione', 'una canna accesa sul molo'] },
  { id: 'periferia', label: 'Periferia d\'inverno', color: ['#6b6f78', '#22252b'], words: ['cemento', 'scale', 'palazzine', 'freddo', 'muretto', 'cortile', 'ascensore', 'panchine', 'nebbia', 'ringhiera'], img: ['il muretto dove vi vedevate tutti i giorni', 'l\'ascensore rotto da mesi', 'il fiato che fa il fumo al freddo', 'i panni stesi tra i palazzi', 'il campetto con la rete bucata'] },
  { id: 'fuoco', label: 'Fuoco', color: ['#ff3b1f', '#5a0b0b'], words: ['fiamme', 'brace', 'cenere', 'benzina', 'scintille', 'fumo', 'bruciare', 'rosso', 'esplodere', 'calore'], img: ['un accendino che non si accende', 'la carta che brucia dagli angoli', 'occhi rossi dopo una notte sveglio', 'il motore che ruggisce al semaforo', 'ponti bruciati alle spalle'] },
  { id: 'oro', label: 'Lusso e oro', color: ['#f2c14e', '#6b4a12'], words: ['oro', 'diamanti', 'champagne', 'vetrine', 'privè', 'cifre', 'firmato', 'brillare', 'jet', 'corona'], img: ['la vetrina dove guardavi da piccolo', 'il primo stipendio contato sul letto', 'la catena che brilla sotto le luci', 'la bottiglia aperta per chi c\'era', 'la macchina che sognavi in cameretta'] },
  { id: 'nebbia', label: 'Nebbia', color: ['#9aa3ad', '#3d434a'], words: ['nebbia', 'confuso', 'fari', 'perso', 'bianco', 'freddo', 'strada', 'sagome', 'lontano', 'eco'], img: ['i fari che non bucano la nebbia', 'una sagoma che si avvicina e non capisci chi è', 'la strada che sparisce dopo tre metri', 'il respiro sul vetro', 'una voce che chiama da lontano'] },
  { id: 'ricordi', label: 'Ricordi d\'infanzia', color: ['#c9a27e', '#4a3526'], words: ['cameretta', 'poster', 'bicicletta', 'merenda', 'cortile', 'nonna', 'figurine', 'videocassette', 'quaderno', 'estate'], img: ['la cucina di tua nonna la domenica', 'il poster attaccato sopra il letto', 'le ginocchia sbucciate sul cortile', 'il walkman con le pile scariche', 'la foto di classe delle elementari'] },
  { id: 'estate', label: 'Estate', color: ['#ffd23f', '#ff6f59'], words: ['sole', 'ghiacciolo', 'motorino', 'spiaggia', 'notte', 'falò', 'cicale', 'abbronzatura', 'festa', 'libertà'], img: ['il motorino in due senza casco', 'il falò in spiaggia fino all\'alba', 'il ghiacciolo che si scioglie sulle dita', 'le cicale che non smettono mai', 'le finestre aperte e la musica fuori'] },
  { id: 'tempesta', label: 'Tempesta', color: ['#2b2d42', '#000000'], words: ['fulmini', 'vento', 'caos', 'onde', 'crollare', 'buio', 'tuono', 'urlo', 'scossa', 'naufragio'], img: ['il fulmine che illumina la stanza per un secondo', 'gli alberi piegati dal vento', 'la barca che imbarca acqua', 'la corrente che salta in tutto il palazzo', 'il mare che si mangia la strada'] },
  { id: 'spazio', label: 'Spazio', color: ['#6a3cff', '#05010f'], words: ['stelle', 'orbita', 'gravità', 'galassia', 'astronave', 'silenzio', 'luna', 'infinito', 'satellite', 'buio'], img: ['la terra vista da lassù, piccolissima', 'fluttuare senza peso', 'una stella che forse è già morta', 'il segnale che arriva dopo anni', 'la luna piena sopra il quartiere'] },
  { id: 'deserto', label: 'Deserto', color: ['#e0a458', '#5c3a1e'], words: ['sabbia', 'sete', 'miraggio', 'sole', 'vuoto', 'orme', 'vento', 'cammino', 'silenzio', 'oasi'], img: ['le orme che il vento cancella', 'un miraggio che sembra casa', 'la sete di qualcosa che non è acqua', 'camminare senza sapere dove', 'una pianta che cresce nella roccia'] },
];

export const moodOf = (id) => MOODS.find((m) => m.id === id) || null;
export const genreOf = (id) => GENRES.find((g) => g.id === id) || null;
export const atmoOf = (id) => ATMOS.find((a) => a.id === id) || null;

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
const GENERIC_Q = ['Cosa ti è successo questa settimana che non hai ancora raccontato?', 'Qual è la cosa più vera che potresti dire adesso?', 'Se il pezzo fosse una foto, cosa ci sarebbe dentro?'];
const ALL_WORDS = ATMOS.flatMap((a) => a.words);
const ALL_IMG = ATMOS.flatMap((a) => a.img);

/** Uno spunto: { domanda, parole (3), immagine, consiglio }. vibe = { mood, genre, atmo } (tutti facoltativi). */
export function makeSpunto(vibe = {}, rnd = Math.random) {
  const m = moodOf(vibe.mood);
  const g = genreOf(vibe.genre);
  const a = atmoOf(vibe.atmo);
  const pool = a ? a.words : ALL_WORDS;
  const words = [];
  while (words.length < 3 && words.length < pool.length) {
    const w = pick(pool, rnd);
    if (!words.includes(w)) words.push(w);
  }
  return {
    domanda: pick(m ? m.q : GENERIC_Q, rnd),
    parole: words,
    immagine: pick(a ? a.img : ALL_IMG, rnd),
    consiglio: g ? g.tip : null,
  };
}

/** "Triste · Trap · Notte in città" */
export function vibeLabel(vibe = {}) {
  return [moodOf(vibe.mood)?.label, genreOf(vibe.genre)?.label, atmoOf(vibe.atmo)?.label].filter(Boolean).join(' · ');
}
