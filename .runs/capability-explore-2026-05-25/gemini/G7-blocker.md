# G7 blocker — Gemini canvas_to_docs unsupported in current profile

The managed-CDP CLI reached Gemini Canvas and the Share/export menu, but the Docs export gate did not produce a docs.google.com URL. Gemini displayed a Google Workspace connection requirement ("First, you'll need to connect Google Workspace to turn on this app"), and manual export probing opened only an about:blank popup.

Per the bucket rule, this is fail-closed as UNSUPPORTED_FEATURE rather than clicking the credential/permission-gated Connect flow.

Evidence: .runs/capability-explore-2026-05-25/gemini/gemini-canvas-to-docs-mgr.json
Workflow: examples/workflows/gemini-canvas-to-docs.yaml
