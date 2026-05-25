# gemini-veo-quota-error-mgr blocker

Status: still red / skipped for time budget.

Evidence:
- `gemini-veo-quota-error-mgr.json` timed out at the workflow step timeout (120s) with no CLI stdout.
- Source was patched to use extension-safe Create video selector and open More tools before clicking Create video, but live smoke entered a long video wait instead of surfacing a quota/selector result before the workflow timeout.

Recommended manual二验:
1. Increase workflow step timeout to cover the actual Veo render/quota path, or add a bounded source-level timeout that returns a contract error (`PLAN_OR_QUOTA_REQUIRED`, `COMMAND_TIMEOUT`, or `ELEMENT_NOT_FOUND`) before workflow timeout.
2. Re-run with `WAH_BROWSER_EXECUTABLE=/bin/false` and inspect whether `Create video` activated or quota text surfaced.
