// ai.js - the plug-in point for an OPTIONAL "real AI" mode. It is OFF.
//
// Why it's off: understanding ANY question (not just the patterns in parser.js) needs a large
// language model, which needs an API key and costs money per question. A key must NEVER be put in
// this website's code (anyone could copy it from the browser). So turning this on requires:
//   1. a tiny backend (e.g. a Cloudflare Worker or Vercel function) that holds the key, and
//   2. setting AI_ENDPOINT below to that backend's URL.
//
// The backend's job: receive { question, schema } and return an "intent" object in the SAME shape
// parser.js produces (e.g. { type: "leaders", entity: "players", stat: "PTS", ... }) or a SQL query.
// The website then answers it with the same engine, so every number still comes from /data.

export const AI_ENDPOINT = null;          // e.g. "https://your-worker.example.workers.dev/ask"
export const AI_ENABLED = Boolean(AI_ENDPOINT);

export async function askAI(question, schema) {
  if (!AI_ENABLED) throw new Error("AI mode is not set up.");
  const res = await fetch(AI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, schema }) });
  if (!res.ok) throw new Error(`AI service error ${res.status}`);
  return res.json();                       // expected: { intent } or { sql }
}
