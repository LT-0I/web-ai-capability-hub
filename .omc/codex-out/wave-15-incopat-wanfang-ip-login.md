# Wave 15 — IncoPat + Wanfang IP-login/auth preflight

## IncoPat IP-login wiring summary + re-smoke result

- Added `src/mcp/submcp/literature/incopat-auth.ts` with the shared IP-login pre-step:
  - navigates to `https://www.incopat.com/newLogin`
  - clicks `#ipLoginBtn` by trusted CDP mouse events
  - polls for `JSESSIONID`/`SESSION` cookie plus visible `#searchValue`
  - returns existing contract errors (`LOGIN_REQUIRED`, `PROFILE_NOT_FOUND`, `COMMAND_TIMEOUT`, `ELEMENT_NOT_FOUND`) instead of adding new codes
- Updated `src/mcp/submcp/literature/incopat.ts` to run the IP-login preflight before the paywalled PDF download path and to prefer the article page first before direct PDF fallback.
- Preserved quota queuing behavior before auth preflight so quota tests still return `LITERATURE_QUEUED`.

Re-smoke (final build, existing CDP 9222):

```json
{
  "tool": "webai_incopat_download_pdf",
  "doc_id": "CN114000001A",
  "pdf_url": "https://www.incopat.com/patent/CN114000001A/pdf",
  "result": {
    "ok": false,
    "errorCode": "LOGIN_REQUIRED",
    "message": "IncoPat trusted IP-login did not reach the authenticated app"
  },
  "magic": null
}
```

Result: no `%PDF-` artifact in this unauthenticated/current-CDP session; driver now surfaces the auth failure honestly as `LOGIN_REQUIRED` instead of the Wave 14 `ELEMENT_NOT_FOUND` redirect symptom.

## Wanfang auth-detection summary + re-smoke result

- Updated `src/mcp/submcp/literature/wanfang.ts` with a preflight auth check before download:
  - resolves real Wanfang article IDs such as `Periodical_zgkx-cd202401001` to `https://d.wanfangdata.com.cn/periodical/zgkx-cd202401001`
  - navigates to the article page using the selected browser profile/CDP session
  - detects `/login` redirects, password inputs, visible login forms, and login-wall text
  - surfaces existing `LOGIN_REQUIRED` with the requested manual-login instruction
- Did not automate credential entry or bypass the Wanfang login form.
- Preserved unresolved generic doc-id behavior (`ELEMENT_NOT_FOUND`/`pass pdf_url`) and quota queue behavior.

Re-smoke (final build, existing CDP 9222):

```json
{
  "tool": "webai_wanfang_download_pdf",
  "doc_id": "Periodical_zgkx-cd202401001",
  "pdf_url": "https://d.wanfangdata.com.cn/periodical/zgkx-cd202401001",
  "result": {
    "ok": false,
    "errorCode": "LOGIN_REQUIRED",
    "message": "Wanfang profile \"research-wanfang\" is not authenticated. Run `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority PROFILES=research-wanfang scripts/launch-web-ais.sh launch`, log in manually, then re-run."
  },
  "magic": null
}
```

Result: no `%PDF-` artifact because the available session is not Wanfang-authenticated; this is the intended Case B behavior.

## Cumulative paywalled GREEN delta

- Wave 15 live PDF GREEN delta in the current session: `+0` (`0/2` produced `%PDF-`).
- Wave 15 contract/behavior delta: both W14 residuals now move from misleading `ELEMENT_NOT_FOUND` login redirects to explicit auth preflight behavior:
  - IncoPat: IP-login flow wired; current session still reports `LOGIN_REQUIRED` when the marker is not reached.
  - Wanfang: persisted-profile auth check wired; unauthenticated/expired profile reports actionable `LOGIN_REQUIRED`.
- Ship gate status: acceptable under the Wave 15 gate because both DBs return existing contract auth errors honestly; Wanfang includes the requested manual-login action.

## Validation

- `rm -rf dist && npm run build` — exit 0
- `node --test dist/tests/phase8-bucket-e/aggregator-misc-literature-downloads.test.js` — 10/10 pass
- `npm test` — 731/731 pass, exit 0
- Final smoke artifacts saved under `.runs/wave-15/*.final-cdp9222.json` (not committed).
