// ⚙️ Impostazioni dello studio: modifica qui nome, WhatsApp e messaggio.
export const STUDIO = {
  name: 'Amit Studio',
  // Numero WhatsApp con prefisso internazionale, solo cifre (es. 393331234567).
  // ⚠️ PROVVISORIO: sostituire con il numero vero dello studio.
  whatsapp: '390000000000',
  message: 'Ciao Amit Studio! Ho un brano pronto e vorrei info su rec, mix e master.',
};

export const whatsappLink = (text = STUDIO.message) => `https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent(text)}`;
