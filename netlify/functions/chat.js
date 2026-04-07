/**
 * CodeQuest — Netlify Serverless Function
 * Proxies requests from the browser to the Anthropic Claude API.
 * The API key never leaves this server-side function.
 *
 * Route:  POST /api/chat
 * Caller: CodeQuest HTML page (inquisitive-babka-ce920a.netlify.app)
 */

const ALLOWED_ORIGIN = "https://inquisitive-babka-ce920a.netlify.app";
const ANTHROPIC_API   = "https://api.anthropic.com/v1/messages";
const MODEL           = "claude-haiku-4-5-20251001";
const MAX_TOKENS      = 600;

// CORS headers — only your Netlify domain can call this function
const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (request) => {

  // ── Handle CORS preflight (browser sends this before every POST) ──
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Only allow POST ──
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Read and validate the incoming body ──
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { system, messages } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "Missing or empty messages array" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Sanitise messages — only keep role + content strings ──
  const safeMessages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);          // hard cap: last 20 messages to control cost

  if (safeMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "No valid messages after sanitisation" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Pull the API key from Netlify environment variables ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is not set.");
    return new Response(
      JSON.stringify({ error: "Server configuration error — API key missing." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Forward to Anthropic ──
  let anthropicResponse;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     typeof system === "string" ? system.substring(0, 4000) : "",
        messages:   safeMessages,
      }),
    });
  } catch (networkError) {
    console.error("Network error reaching Anthropic:", networkError);
    return new Response(
      JSON.stringify({ error: "Could not reach Anthropic API — network error." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Stream the Anthropic response straight back to the browser ──
  const data = await anthropicResponse.json();

  return new Response(JSON.stringify(data), {
    status:  anthropicResponse.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

// Tell Netlify this function lives at /api/chat
export const config = { path: "/api/chat" };
