const fetch = require("node-fetch");

const BASE_URL = process.env.LANGFLOW_BASE_URL;
const API_KEY = process.env.LANGFLOW_API_KEY;
const FLOW_ID = process.env.FLOW_ID;

function authHeaders(extra = {}) {
  return { "x-api-key": API_KEY, ...extra };
}

/**
 * Runs a question through the flow via Langflow's synchronous /run endpoint.
 *
 * This used to go through /build + its SSE event stream (to also capture
 * intermediate retrieval results as "sources"), but that path proved
 * unreliable -- it intermittently hung indefinitely with no error, even
 * though the same query via /run consistently succeeded. /run is simpler
 * (single request/response, no job queue or long-lived stream to manage)
 * and doesn't have this failure mode. The tradeoff: /run only returns the
 * final Chat Output message, not per-component intermediate outputs, so
 * "sources" (the retrieved chunks) aren't available this way.
 */
async function askQuestion(question, sessionId) {
  const res = await fetch(`${BASE_URL}/api/v1/run/${FLOW_ID}?stream=false`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      output_type: "chat",
      input_type: "chat",
      input_value: question,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Langflow run failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const msg = data?.outputs?.[0]?.outputs?.[0]?.results?.message;

  if (!msg) {
    throw new Error("Langflow returned no message in response");
  }

  return {
    answer: msg.text || msg.data?.text || "",
    model: msg.properties?.source?.source || msg.properties?.source?.display_name || null,
    usage: msg.properties?.usage || null,
    sources: [], // not available via /run -- see note above
  };
}

async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}

module.exports = { askQuestion, checkHealth };
