# Path C Claude Wave B2 upload/multimodal variant mapping

Capture source: `.runs/path-c-claude-rpc/wave-a-captures/webai_claude_upload_and_query--*/`

All five variants use the upload endpoint discovered in Wave A:

`POST https://claude.ai/api/organizations/<org>/conversations/<conv>/wiggle/upload-file`

The upload request is browser `multipart/form-data` with a WebKit boundary. The captured `request-*.body.txt` files for these binary multipart requests are empty in the Wave A artifact set, but the request headers and upload responses are present under each variant's `requests/` directory. Query-sending variants then call:

`POST https://claude.ai/api/organizations/<org>/chat_conversations/<conv>/completion`

with JSON and `accept: text/event-stream`.

## Per-variant mapping

| Variant | Upload calls | Query call in capture | File shape | Completion payload mapping | Captured assistant text |
| --- | ---: | --- | --- | --- | --- |
| `upload_single` | 1 | No; upload-only capture | `claude-wave-a-upload-single.txt`, `text/plain`, blob upload response, 124 bytes | B2 sends prompt after upload with one `attachments[]` entry; `files: []` | none in capture; B2 tests use minimal SSE ` OK` |
| `upload_multi` | 2 observed (B2 supports up to 3) | No; upload-only capture | `claude-wave-a-upload-a.txt` + `claude-wave-a-upload-b.txt`, `text/plain`, blob responses, 118 bytes each | B2 sends prompt after all uploads with one `attachments[]` entry per non-image file; `files: []` | none in capture; B2 tests use minimal SSE ` OK` |
| `upload_and_query` | 1 | Yes | `claude-wave-a-query.txt`, `text/plain`, blob response, 158 bytes | one `attachments[]` object: `file_name`, `file_type`, `file_size`, `extracted_content`, `origin: user_upload`, `kind: file`, `path`; `files: []` | ` OK RPC_CLAUDE_UPLOAD_QUERY_2026-05-27` |
| `upload_image` | 1 | Yes | `claude-wave-a-image.png`, `image/png`; upload response has `file_kind: image`, `thumbnail_url`, `preview_url`, image assets | image UUID goes in `files: [<uuid>]`; `attachments: []` | ` OK` |
| `upload_markdown` | 1 | Yes | `claude-wave-a-markdown.md`, `text/markdown`, blob response, 131 bytes | one markdown `attachments[]` object; `files: []` | ` OK` |

## Multipart/FormData details

- Each file is uploaded by a separate `multipart/form-data` POST.
- `upload_multi` uses sequential upload requests to the same `<org>/<conv>` upload URL.
- Observed boundaries are browser-generated (`----WebKitFormBoundary...`) and should not be hard-coded.
- The RPC driver builds `FormData` inside the Claude page context and appends one `Blob` with the original filename for each upload request.

## Upload response shape

Blob/text responses include:

```json
{
  "success": true,
  "path": "/mnt/user-data/uploads/<file>",
  "sanitized_name": "<file>",
  "file_kind": "blob",
  "file_uuid": "<uuid>",
  "file_name": "<file>",
  "created_at": null,
  "user_uuid": null,
  "size_bytes": 123,
  "uuid": "<uuid>"
}
```

Image responses use the same base shape with `file_kind: image`, plus `thumbnail_url`, `preview_url`, `thumbnail_asset`, `preview_asset`, and a timestamped `created_at`.

## Encoding deltas

- `text/plain`: send as non-image upload; completion uses `attachments[]` with UTF-8 `extracted_content` read locally before the network call.
- `text/markdown`: same as text, but `file_type: text/markdown`.
- `image/png`: completion does not inline extracted content; it sends the uploaded UUID in `files[]`.
- Max files for Claude upload/query remains 3 at the entry boundary.
