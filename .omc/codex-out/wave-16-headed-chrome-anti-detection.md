# Wave 16 — headed Chrome + paywalled behavioral hygiene

## managedLauncher env propagation diff summary

- Added a Chrome launch env builder in `src/browser/managedLauncher.ts`.
- `childProcess.spawn(discovered.path, args, ...)` now explicitly passes `env` without changing Chrome args.
- The env preserves inherited values and supplies Linux defaults when absent:
  - `DISPLAY=:0`
  - `XDG_RUNTIME_DIR=/run/user/${uid}`
  - `XAUTHORITY=/run/user/${uid}/gdm/Xauthority`
- If no `DISPLAY` can be resolved, launch proceeds and stderr receives: `Chrome launching without DISPLAY; anti-bot detection may trigger`.

## paywalled.ts fresh-tab + jitter+noise diff summary

- `downloadPaywalledLiteraturePdfToDisk` now tracks the fresh `context.newPage()` tab and closes it in `finally` after success or failure.
- Newly opened tabs from PDF-click flows are also tracked and closed.
- Added inline `jitter(min, max)` and a small pre-click humanizing step before CDP PDF clicks:
  - random 400–900 ms wait
  - slow mouse move to a random 100–400 px point with 6 steps
  - small random scroll up to 300 px

## Re-smoke matrix per-DB

Validation before live smoke:
- `rm -rf dist && npm run build` → exit 0
- `npm test` → exit 0, 731/731 pass

Live smoke was serial with at least 10 seconds between DBs. APS and Optica used the Wave 16 spike targets.

| DB | Profile | Result | Error | Size | Duration ms | DOI / id | Message |
|---|---|---|---|---:|---:|---|---|
| aps | research-aps | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 67550 | `10.1103/PhysRevLett.132.053401` | APS Journals PDF/download link was not found and no direct PDF download started |
| asce | research-asce | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 60843 | `10.1061/JCEECD.EIENG-2136` | ASCE Library PDF/download link was not found and no direct PDF download started |
| emerald | research-emerald | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 60865 | `10.1108/OIR-08-2021-0430` | Emerald Insight PDF/download link was not found and no direct PDF download started |
| incopat | research-incopat | NO_AUTH | LOGIN_REQUIRED |  | 12391 | `CN114000001A` | IncoPat trusted IP-login did not reach the authenticated app |
| optica | research-optica | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 60833 | `oe-32-1-1` | Optica Publishing Group PDF/download link was not found and no direct PDF download started |
| opticsjournal | research-opticsjournal | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 60721 | `10.3788/CJL230001` | Opticsjournal 中国激光平台 PDF/download link was not found and no direct PDF download started |
| proquest | research-proquest | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 78041 | `central:3059838858` | ProQuest PDF/download link was not found and no direct PDF download started |
| royalsoc | research-royalsoc | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 60889 | `10.1098/rsos.230523` | Royal Society Publishing PDF/download link was not found and no direct PDF download started |

Summary: 0/8 GREEN. No two-consecutive-429 stop condition was hit.

## Cumulative paywalled-GREEN delta (25/38 → N/38)

- New GREEN this wave: 0
- Cumulative paywalled GREEN: 25/38 → 25/38
- Wave 16 target gate (≥4/8 new GREEN): not met

## Conclusion: did the headed-Chrome theory pan out

Not in this re-smoke. The env propagation and fresh-tab/behavioral hygiene changes are in place and the regression suite is green, but the 8-DB live run produced no new paywalled GREEN results. The dominant failure mode was still `ELEMENT_NOT_FOUND`/selector drift after the existing paywalled flow failed to materialize a PDF; IncoPat separately failed at the trusted-IP login gate.
