// Amit · il ponte verso l'assistente gratuito (Groq). La chiave resta qui, nascosta.
// Supabase → Edge Functions → nome: parliamone. Segreto richiesto: GROQ_API_KEY (facoltativo: GROQ_MODEL).
const KEY = Deno.env.get("GROQ_API_KEY") || "";
const MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
const MEMBERS = ["kraken", "shower"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// chi sta chiamando (Supabase ha gia' controllato la firma del token)
function memberOf(req: Request): string | null {
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const [id, domain] = String(p.email || "").split("@");
    return domain === "amit-studio.app" && MEMBERS.includes(id) ? id : null;
  } catch {
    return null;
  }
}

const BASE = (ctx: { name?: string; style?: string }) =>
  `Sei l'assistente di scrittura dell'app Amit di Amit Studio, uno studio di registrazione rap italiano. Parli con ${ctx.name || "un rapper"}.` +
  (ctx.style ? ` Il suo modo di scrivere: ${ctx.style}` : "") +
  ` Parli sempre in italiano, in modo amichevole e diretto, come un amico che fa musica. Non scrivi mai barre, rime o strofe al posto suo: il testo lo scrive lui.`;

const PROMPTS: Record<string, (c: any) => string> = {
  chat: (c) =>
    BASE(c) +
    ` Il tuo compito: aiutarlo a capire cosa vuole dire nel prossimo pezzo, soprattutto quando e' confuso o bloccato. Fai UNA domanda alla volta, concreta (fatti, persone, luoghi, momenti, sensazioni), partendo da quello che ti ha appena detto. Rimanda in poche parole quello che hai capito. Risposte corte: massimo 3-4 frasi piu' la domanda.`,
  map: (c) =>
    BASE(c) +
    ` Tira le fila della chiacchierata e rispondi SOLO con un oggetto JSON con queste chiavi: "tema" (una frase), "concetti" (3-5 frasi brevi), "immagini" (3-6), "parole" (5-10 parole chiave), "ritornello" (il concetto, non il testo), "titoli" (3). Usa le sue parole e le sue immagini.`,
  sistema: (c) =>
    BASE(c) +
    ` Ti arriva un testo buttato a caso sul beat. Rispondi SOLO con un oggetto JSON: "tema" (di cosa sta parlando, una frase), "concetti" (3-5 argomenti che emergono), "titoli" (3 titoli possibili). Non riscrivere le sue frasi.`,
  strade: (c) =>
    BASE(c) +
    ` Ha scritto l'attacco di una strofa e non sa dove andare. Rispondi SOLO con un oggetto JSON: "strade" = 3 direzioni concrete per continuare (ognuna una frase che dice COSA raccontare, non come scriverlo), coerenti con il tema e il ritornello.`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non permesso" }, 405);
  if (!memberOf(req)) return json({ error: "Solo per i soci di Amit Studio." }, 403);
  if (!KEY) return json({ error: "Manca la chiave dell'assistente (GROQ_API_KEY) su Supabase." }, 500);

  let body: { mode?: string; context?: Record<string, string>; messages?: { role: string; content: string }[]; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  const mode = PROMPTS[body.mode || "chat"] ? body.mode || "chat" : "chat";
  const ctx = body.context || {};
  let messages: { role: string; content: string }[] = [];
  if (mode === "chat" || mode === "map") {
    messages = (body.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40);
    if (!messages.length) return json({ error: "Scrivi qualcosa per iniziare." }, 400);
    if (mode === "map") messages.push({ role: "user", content: "Tira le fila di tutto quello che ci siamo detti." });
  } else {
    const t = String(body.text || "").slice(0, 6000);
    if (!t.trim()) return json({ error: "Testo vuoto." }, 400);
    messages = [{ role: "user", content: mode === "strade" ? `Tema: ${ctx.tema || "?"}\nRitornello: ${ctx.rit || "?"}\nStrofa finora:\n${t}` : t }];
  }
  if (JSON.stringify(messages).length > 60000) return json({ error: "Chiacchierata troppo lunga: iniziane una nuova." }, 400);

  const wantsJson = mode !== "chat";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: mode === "chat" ? 0.8 : 0.5,
      max_tokens: mode === "chat" ? 400 : 700,
      messages: [{ role: "system", content: PROMPTS[mode](ctx) }, ...messages],
      ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (r.status === 429) return json({ error: "Per oggi l'assistente gratuito ha finito le risposte: riprova piu' tardi." }, 429);
  if (!r.ok) return json({ error: `Assistente non disponibile (${r.status}).` }, 502);
  const data = await r.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!wantsJson) return json({ text });
  try {
    return json({ data: JSON.parse(text) });
  } catch {
    return json({ error: "Risposta non valida, riprova." }, 502);
  }
});
