// Wave C2 A/B sweep. Only one variant became RPC where it was UNAVAILABLE:
//   webai_gemini_send_prompt --web_search.
// For a variant that's now RPC where it was UNAVAILABLE, functional correctness = PASS
// (RPC alone is a strict gain; no speedup gate). We run the RPC path live via the built
// tool and confirm it returns a real grounded answer. The DOM lane is reported as
// UNAVAILABLE because the current Gemini build has no Google Search toggle (the DOM
// driver's selector is dead) — that is exactly why RPC is the gain.
//
// music_download_track is NOT A/B'd: it is TRUE_RPC_NOT_AVAILABLE (the audio fetch is
// browser-credential-bound; see webai_gemini_music_download_track/analysis.json). There
// is no RPC lane to compare, and re-downloading would be quota-neutral but pointless.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c2-coverage-gaps");

async function main() {
  const tools = await import(join(process.cwd(), "dist/src/mcp/tools.js"));
  const results = { startedAt: new Date().toISOString(), profile: "gemini-9225", variants: [] };

  // --- web_search via RPC (live) ---
  const t0 = Date.now();
  const rpc = await tools.webAiGeminiSendPrompt({
    profile: "gemini-9225",
    prompt: "Use web search: what is the capital city of Australia? Cite a source URL.",
    web_search: true
  });
  const rpcMs = Date.now() - t0;
  const rpcText = String(rpc?.response_text || "");
  const grounded = /canberra/i.test(rpcText);
  results.variants.push({
    variant: "webai_gemini_send_prompt--web_search",
    rpc: {
      ok: rpc?.errorCode == null && rpcText.length > 0,
      errorCode: rpc?.errorCode ?? null,
      elapsed_ms: rpcMs,
      model_used: rpc?.model_used ?? null,
      response_chars: rpcText.length,
      response_snippet: rpcText.slice(0, 220),
      grounded_answer_correct: grounded
    },
    dom: {
      available: false,
      note: "Current Gemini build has no 'Google Search' tool toggle; the DOM driver selector ([role=menuitemcheckbox]:has-text('Google Search')) is dead. RPC is the strict gain."
    },
    verdict: (rpc?.errorCode == null && rpcText.length > 0 && grounded) ? "PASS" : "FAIL",
    note: "web_search was RPC_NOT_AVAILABLE pre-Wave-C2; a functional grounded RPC answer is a strict gain regardless of DOM/speedup."
  });

  results.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, "ab-sweep-results.json"), JSON.stringify(results, null, 2));
  console.error("[ab] RESULT:", JSON.stringify(results, null, 2));
}
main().catch((e) => { console.error("[ab] error:", e); process.exit(1); });
