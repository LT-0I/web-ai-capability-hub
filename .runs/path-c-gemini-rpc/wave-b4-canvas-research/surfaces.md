# Path C Gemini Wave B4 canvas + deep_research surface research

Source captures read from `.runs/path-c-gemini-rpc/wave-a-captures/`:

| Variant | Capture status | Replay | Primary semantic RPC | Decision |
| --- | --- | --- | --- | --- |
| `webai_gemini_canvas_edit--open_canvas` | `CAPTURED` | `true` | `StreamGenerate` | RPC driver. DOM prelude activates Canvas first, then inner `fetch` sends captured StreamGenerate body. |
| `webai_gemini_canvas_edit--direct_edit` | `BLOCKED` | `false` | none; observed `GPRiHf`/batchexecute body is `[]` generic telemetry | `RPC_NOT_AVAILABLE`; keep DOM direct contenteditable edit. |
| `webai_gemini_canvas_edit--ai_length` | `BLOCKED` | `false` | none; observed `GPRiHf`/batchexecute body is `[]` generic telemetry | `RPC_NOT_AVAILABLE`; keep DOM Canvas AI button/instruction path. |
| `webai_gemini_canvas_edit--ai_tone` | `BLOCKED` | `false` | none; observed `GPRiHf`/batchexecute body is `[]` generic telemetry | `RPC_NOT_AVAILABLE`; keep DOM Canvas AI button/instruction path. |
| `webai_gemini_canvas_to_docs--export_docs` | `CAPTURED` | `true` for canvas generation token | `StreamGenerate` creates a Canvas artifact, but no replayed Google Docs export/create-doc roundtrip was captured | `RPC_NOT_AVAILABLE` for Docs export; keep DOM-only because a true A/B would create a real Google Doc. |
| `webai_gemini_deep_research--start` | `CAPTURED` | `true` | `StreamGenerate` | RPC driver. DOM prelude selects Deep research mode, then inner `fetch` sends captured StreamGenerate body. |

## Canvas surface

Canonical DOM trigger from `src/mcp/tools.ts`:

- Upload/tools opener: `button[aria-label="Upload & tools"]`
- Canvas menu item: `[role="menuitemcheckbox"]:has-text("Canvas")`
- Canvas mode active/mount signal before RPC: `button[aria-label="Deselect Canvas"]`
- Canvas response-ready signal after DOM generation: `[data-test-id="share-button"] button, [data-testid="share-button"] button, button[data-test-id="share-button"], button[data-testid="share-button"], button[aria-label="Share and export canvas"]`

URL pattern: `https://gemini.google.com/app` for fresh composer and `https://gemini.google.com/app/<conversation>` after generation. Generated Canvas artifacts appear in StreamGenerate response metadata as `http://googleusercontent.com/immersive_entry_chip/0` with filenames such as `*_wave_a_canvas_rpc_open_canvas.md`.

Wave B4 driver uses the structural DOM-navigate-then-RPC pattern: navigate/open Gemini, click Canvas in the tools drawer, wait for `Deselect Canvas`, then execute the captured StreamGenerate request with `page.evaluate(fetch(..., credentials:"include"))`. This is not a runtime fallback; unsupported variants are routed to DOM before RPC is attempted.

## Deep research surface

Canonical DOM trigger from `src/mcp/tools.ts`:

- Upload/tools opener: `button[aria-label="Upload & tools"]`
- Deep research menu item: `[role="menuitemcheckbox"]:has-text("Deep research")`
- Generated plan marker in replay: `http://googleusercontent.com/deep_research_confirmation_content/0` and visible `Start research` affordance.

URL pattern: `https://gemini.google.com/app` for fresh composer and `https://gemini.google.com/app/<conversation>` after StreamGenerate returns a conversation id. Wave B4 starts only the prompt/plan request, matching the pre-existing DOM-compatible `queued` envelope.

## Recapture decision

The three non-verified canvas edit variants were not reclassified as wrong-context captures. Their capture summaries and decoded request bodies show only generic/no-op telemetry (`GPRiHf`, `f.req=[[["GPRiHf","[]",null,"generic"]]]`) after the Canvas already exists; the semantic mutation is the DOM/contenteditable or UI instruction path. Re-capturing the same DOM-only operations would not produce a standalone inner API payload. `canvas_to_docs--export_docs` is also kept DOM-only because the replayed RPC creates Canvas content, not a Google Docs document; live A/B for export is destructive.
