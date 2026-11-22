// ⚙️ Impostazioni dello studio: modifica qui nome, WhatsApp e messaggio.
export const STUDIO = {
  name: 'Amit Studio',
  // Numero WhatsApp con prefisso internazionale, solo cifre (es. 393331234567).
  // ⚠️ PROVVISORIO: sostituire con il numero vero dello studio.
  whatsapp: '390000000000',
  message: 'Ciao Amit Studio! Ho scritto un pezzo che mi convince e vorrei registrarlo da voi, con mix e master.',
};

export const whatsappLink = (text = STUDIO.message) => `https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent(text)}`;

/** Messaggio per prenotare una sessione partendo da una traccia precisa. */
export const bookingLink = (title, bpm) =>
  whatsappLink(
    `Ciao ${STUDIO.name}! Ho fatto il provino di "${title || 'un mio pezzo'}"${bpm ? ` (${bpm} BPM)` : ''} sull'app e mi convince. Vorrei registrarlo da voi, con mix e master.`
  );

// Il "postino" online dei soci (Supabase). Indirizzo e chiave pubblica: stanno nell'app,
// i dati sono protetti dalle regole del database (solo i soci leggono i loro messaggi).
export const CLOUD = {
  url: 'https://ldrcytilqvzssmdbolka.supabase.co',
  key: 'sb_publishable_FVSrubLoIcnVBZo5kudS4w_hCuT6W1F',
  domain: 'amit-studio.app',
  assistant: 'parliamone-', // nome della funzione dell'assistente su Supabase
  members: [
    { id: 'kraken', name: 'Kraken' },
    { id: 'shower', name: 'Shower' },
  ],
};
