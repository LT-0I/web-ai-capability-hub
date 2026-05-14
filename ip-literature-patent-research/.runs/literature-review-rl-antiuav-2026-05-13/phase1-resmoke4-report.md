# Phase 1 re-smoke 4 — clean-state end-to-end verification

## Result

PASS.

## Clean-state reset

- CDP 9223 pre-check: reachable (`Chrome/148.0.7778.167`).
- Reset script created at `scripts/phase1-resmoke4-reset.py`.
- Reset behavior performed:
  - selected tab matching `6a04a213`
  - navigated to `about:blank`
  - navigated back to `https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831`
  - closed one duplicate conversation tab
  - pressed `Escape`
  - final tab list contained one kept conversation tab

## CLI invocation

Artifacts:

- stdout: `phase1-resmoke4-command.stdout`
- stderr: `phase1-resmoke4-command.stderr`
- exit: `phase1-resmoke4-command.exit`
- DOCX: `phase1-resmoke4-downloads/phase1-resmoke4-export.docx`

Exit code: `0`.

CLI JSON summary:

```json
{
  "path": "/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke4-downloads/phase1-resmoke4-export.docx",
  "sha256": "9c1ebc65b137a1f063659e7f6d310375f1735537219bed3aa7ec94b8a2572727",
  "size": 31520,
  "suggestedFilename": "强化学习在反无人机系统中的应用.docx",
  "downloadGuid": "1007e179-6a22-42cc-bac2-9fbc6e476bb1",
  "frameUrl": "about:blank",
  "bbox": {
    "x": 1186,
    "y": 176,
    "width": 32,
    "height": 32
  },
  "elapsedMs": 2298
}
```

stderr contained only the existing Node `NO_COLOR` / `FORCE_COLOR` warning.

## DOCX verification

Verification artifact: `phase1-resmoke4-docx-verify.stdout`.

```json
{
  "paras": 171,
  "chars": 17798,
  "sha256": "9c1ebc65b137a1f063659e7f6d310375f1735537219bed3aa7ec94b8a2572727",
  "size": 31520,
  "differs_from_58b0cb05_prefix": true,
  "differs_from_a19cc043_prefix": true
}
```

## Pass criteria check

- exit 0: PASS
- DOCX >= 20 KB: PASS (`31,520` bytes)
- paragraphs >= 150: PASS (`171`)
- chars >= 15,000: PASS (`17,798`)
- sha256 differs from `58b0cb05...`: PASS
- sha256 differs from `a19cc043...`: PASS

## Notes

- No code patches were made.
- Discovery script was not run.
- CLI was run once.
