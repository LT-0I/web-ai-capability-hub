# B7 — share-chat + export menu (share-chat, export-docs, export-gmail
#       catalog rows + sharing manager surface)

**Status:** PASS

Opened existing A4 conversation `https://gemini.google.com/app/6790bbb4ecdf234a`
and exercised both export surfaces.

## `Show more options` per-response menu (catalog rows `export-docs`,
##   `export-gmail`, `share-chat`)

Clicked `button[aria-label="Show more options"]` next to the model response.
Menu items observed verbatim:

- `Listen`
- `Export to Docs`
- `Draft in Gmail`
- `Report legal issue`
- (separator) `Model: 3 Flash`

**Catalog cross-check:**
- `export-docs` (id) — `Export to Docs` present, matches catalog.
- `export-gmail` (id) — `Draft in Gmail` present, matches catalog.
- `export-sheets` / `export-colab` / `export-replit` — NOT in this menu for
  a simple text reply. Catalog notes these appear conditionally (on tables /
  code). Did not exercise (no qualifying response).
- New label: `Model: 3 Flash` — labels the underlying model name. The model
  picker label is `Fast` but the actual model is `3 Flash` (i.e. Gemini 3
  Flash). This is a **catalog addition / clarification** for the
  `model-select-fast` catalog row.

## `Share conversation` top-bar surface (catalog row `share-chat`)

Clicked `button[aria-label="Share conversation"]`. A dialog appeared
auto-creating a public link:

- `Shareable public link gemini.google.com/share/20cd02457489 — Link copied`
- Plus `Copy link`, `Share to LinkedIn`, `Share to Facebook`, `Share to X`,
  `Share to Reddit` buttons.
- Inline link `delete Opens in a new window` — that's a help-center anchor,
  NOT a delete control.

The act of opening the share dialog **immediately produced and copied a
public URL**. This implicitly publishes the chat. Per lane doctrine ban on
public publishing, I navigated to the sharing manager and deleted the link.

## `/sharing` manager surface (catalog row implicit; not enumerated in v2)

URL: `https://gemini.google.com/sharing`. Page header `Your public links`.

Layout: list of share rows, each showing chat title + URL + creation
timestamp. Bulk control: `Delete all links` (`[data-test-id="remove-all-button"]`).
Confirm dialog uses `[data-test-id="confirm-button"]`.

**Cleanup:** clicked `Delete all links` → `Delete all` confirm; re-read DOM
no longer contains `20cd02457489`. Public link removed.

**Catalog ADDITIONS:**
- `Your public links` manager page at `/sharing` with `Delete all links`
  and `[data-test-id="confirm-button"]` selector pattern — not enumerated
  as a v2 catalog row.
- Note: catalog row `share-chat` says `click Share, Share conversation,
  then copy or distribute the public link`. The observed flow is actually
  one-step (clicking the avatar `Share conversation` button auto-creates
  the link and opens the share dialog) — **catalog drift** on click path.
