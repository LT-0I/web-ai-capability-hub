# Path C Gemini Wave B2 — upload + media variant mapping

Source captures: `.runs/path-c-gemini-rpc/wave-a-captures/**` read on 2026-05-27.
Committed B2 fixture copies live under `fixtures/<variant>/` so the RPC drivers do not depend on untracked Wave A capture files.

## Upload — 3/3 RPC-driven

All upload variants use Gemini's resumable upload endpoint before optional chat completion:

1. `upload-start`
   - `POST https://push.clients6.google.com/upload/`
   - body: `File name: <basename>`
   - captured invariant headers: `x-goog-upload-command:start`, `x-goog-upload-protocol:resumable`, `x-tenant-id:bard-storage`, `push-id:feeds/mcudyrk2a4khkz`, `x-goog-upload-header-content-length:<file bytes>`
   - response header `x-goog-upload-url` supplies the per-file finalize URL.
2. `upload-finalize`
   - `POST <x-goog-upload-url>`
   - body: raw file bytes
   - captured invariant headers: `x-goog-upload-command:upload, finalize`, `x-goog-upload-offset:0`, `x-tenant-id:bard-storage`
   - response body is a Gemini file URI: `/contrib_service/ttl_1d/...`.
3. `StreamGenerate` completion
   - `POST https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?...`
   - `f.req=[null, JSON.stringify(inner)]`, `at=<WIZ_global_data.SNlM0e>`
   - prompt slot: `inner[0][0]`
   - attachment slot: `inner[0][3] = [[[uri, 3, null, mime], fileName, null, null, null, null, null, null, [0]], ...]`

| Variant | Capture status | Body mapping | Driver behavior |
| --- | --- | --- | --- |
| `webai_gemini_upload_and_query--upload_single` | replay_verified | one upload-start/finalize; completion uses one attachment entry | RPC default via `webAiGeminiUploadAndQueryRpc` |
| `webai_gemini_upload_and_query--upload_multi` | replay_verified | N upload-start/finalize pairs; completion uses N attachment entries | RPC default via same driver |
| `webai_gemini_upload_and_query--upload_and_query` | replay_verified | upload-start/finalize + captured StreamGenerate attachment shape | RPC default via same driver |

## Media generate — 3/3 verified variants RPC-driven

All verified media-generation captures are `StreamGenerate` POSTs with prompt in `inner[0][0]`, fresh request entropy in `inner[4]` and `inner[59]`, and the same captured `bl`/`f.sid`/`at` token pattern as B1.

Wave B2 live probing showed media tools must be put on their dedicated Gemini tool surface before the RPC submit: the driver opens a fresh Gemini composer, selects the relevant Upload & tools mode (`Create image`, `Create video`, or `Create music`) with CDP DOM navigation, then submits the captured `StreamGenerate` body directly. This is a structural DOM-nav-then-RPC prelude, not a runtime fallback after RPC failure.

Media downloads use the URLs from the `StreamGenerate` response with authenticated manual redirect following. The downloader rejects Gemini chrome/branding assets (for example product logo SVGs) and requires media MIME/magic bytes before returning an artifact path.

| Variant | Capture status | Captured mode markers | Driver behavior |
| --- | --- | --- | --- |
| `webai_gemini_generate_image--basic` | replay_verified | `inner[49] = 14` | RPC default; DOM-nav prelude selects Create image; downloads verified image bytes from response URL |
| `webai_gemini_generate_video--duration_2s` | replay_verified | `inner[0][9] = [null,null,null,null,null,null,[[null,null,null,1]]]`, `inner[49] = 11`, `inner[55] = [[16]]` | RPC default; DOM-nav prelude selects Create video; shortest-duration captured shape; video artifact URL is surfaced as canonical RPC error if unavailable |
| `webai_gemini_music_generate--instrumental` | replay_verified | `inner[49] = 21` | RPC default when `confirmed:true`; DOM-nav prelude selects Create music; downloads verified audio/video bytes from response URL |

## Media download — RPC_NOT_AVAILABLE / DOM-only by write-time decision

| Variant | Capture status | Finding | Dispatcher decision |
| --- | --- | --- | --- |
| `webai_gemini_music_download_track--mp3` | non-verified | captured only `GPRiHf` polling body `[[["GPRiHf","[]",null,"generic"]]]`; no ready track, no media download URL, no format-specific RPC | `webAiGeminiMusicDownloadTrack` remains DOM-only; no runtime RPC attempt/fallback |
| `webai_gemini_music_download_track--video` | non-verified | same `GPRiHf` polling body, no ready track and no format-specific media URL | DOM-only by write-time decision |
| `webai_gemini_music_task_status--existing_conversation` | non-verified, out of B2 dispatcher scope | same no-ready-track polling shape | unchanged in this wave |

The non-verified music-download captures did not show a dedicated Gemini sub-surface URL that would justify a DOM-nav-then-RPC recapture for this B2 scope. They require a live download-ready track before any future RPC mapping can be claimed.
