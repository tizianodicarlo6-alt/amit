// Amit · "Parliamone": il ponte tra l'app e l'assistente (Claude). La chiave resta qui, nascosta.
// Supabase → Edge Functions → nome: parliamone. Segreto richiesto: ANTHROPIC_API_KEY.
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MEMBERS = ["kraken", "shower"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// chi sta chiamando (Supabase ha già controllato la firma del token)
function memberOf(req: Request): string | null {
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const [id, domain] = String(payload.email || "").split("@");
    return domain === "amit-studio.app" && MEMBERS.includes(id) ? id : null;
  } catch {
    return null;
  }
}

// Il prompt di sistema dipende solo da chi sei e dal "colore" scelto all'inizio: resta identico per tutta la chiacchierata.
function systemPrompt(ctx: { name?: string; style?: string; vibe?: string }) {
  return `Sei "Parliamone", l'assistente di scrittura dell'app Amit di Amit Studio, uno studio di registrazione rap.
Parli con ${ctx.name || "un rapper"}, che sta cercando di capire cosa vuole dire nel suo prossimo pezzo.${ctx.style ? `\nIl suo modo di scrivere: ${ctx.style}` : ""}${ctx.vibe ? `\nPer questo pezzo ha scelto: ${ctx.vibe}.` : ""}

Il tuo compito: aiutarlo a tirare fuori i concetti, gli argomenti e le immagini di quello che sente, soprattutto quando è confuso o bloccato.
- Parla in italiano, in modo amichevole e diretto, come un amico che fa musica. Frasi brevi.
- Fai UNA domanda alla volta, concreta (fatti, persone, luoghi, momenti, sensazioni fisiche), partendo da quello che ti ha appena detto.
- Rimanda indietro in poche parole quello che hai capito, così lui si sente capito e va più a fondo.
- Non scrivere barre, rime o strofe al posto suo: il testo lo scrive lui. Puoi suggerire un'immagine o una parola chiave se aiuta.
- Se ti chiede di scrivere il testo, ricordagli con leggerezza che qui lavorate sul "cosa dire", e fagli una domanda che lo aiuti a trovarlo.
- Risposte corte: al massimo 3-4 frasi più la domanda.`;
}

const MAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tema", "concetti", "immagini", "parole", "ritornello", "titoli"],
  properties: {
    tema: { type: "string", description: "Il tema centrale del pezzo in una frase" },
    concetti: { type: "array", items: { type: "string" }, description: "3-5 concetti o argomenti da sviluppare nelle strofe" },
    immagini: { type: "array", items: { type: "string" }, description: "Immagini e metafore uscite dai suoi discorsi" },
    parole: { type: "array", items: { type: "string" }, description: "Parole chiave" },
    ritornello: { type: "string", description: "Il concetto del ritornello (non il testo)" },
    titoli: { type: "array", items: { type: "string" }, description: "3 titoli possibili" },
  },
};

const MAP_ASK =
  "Tira le fila di tutto quello che ci siamo detti: tema centrale, concetti per le strofe, immagini e metafore, parole chiave, il concetto del ritornello e 3 titoli. Usa le mie parole e le mie immagini quando puoi. Non scrivere barre.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non permesso" }, 405);
  const who = memberOf(req);
  if (!who) return json({ error: "Solo per i soci di Amit Studio." }, 403);

  let body: { context?: { name?: string; style?: string; vibe?: string }; messages?: Anthropic.Beta.BetaMessageParam[]; mode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length || messages.length > 80) return json({ error: "Chiacchierata troppo lunga: iniziane una nuova." }, 400);
  if (JSON.stringify(messages).length > 200_000) return json({ error: "Chiacchierata troppo lunga: iniziane una nuova." }, 400);

  const map = body.mode === "map";
  const all: Anthropic.Beta.BetaMessageParam[] = map ? [...messages, { role: "user", content: MAP_ASK }] : messages;

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: map ? 8000 : 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: systemPrompt(body.context || {}),
      output_config: map ? { effort: "medium", format: { type: "json_schema", schema: MAP_SCHEMA } } : { effort: "low" },
      messages: all,
    });
    if (response.stop_reason === "refusal") return json({ refusal: true, text: "Su questo non riesco ad aiutarti. Proviamo da un'altra parte?" });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    // content va rimandato com'è al prossimo giro (insieme ai blocchi di ragionamento)
    return json({ content: response.content, text, appended: map ? MAP_ASK : null, usage: response.usage });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Troppe richieste: riprova tra un minuto." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Chiave dell'assistente non valida o mancante." }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `Assistente non disponibile (${e.status}).` }, 502);
    return json({ error: "Assistente non raggiungibile." }, 502);
  }
});
