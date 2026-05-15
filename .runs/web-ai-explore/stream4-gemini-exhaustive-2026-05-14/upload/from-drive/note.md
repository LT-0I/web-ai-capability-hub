# upload/from-drive

Status: NOT-REACHABLE (safety-skip)

Surface enumerated in upload menu (`menuitem` text: `Add from Drive. Sheets,
Docs, Slides`). Per Stream #4 doctrine §3, external-service authentication
(Drive OAuth) for new connectors is out of scope — only existing connected
state may be read. This profile does not have a Drive picker session
pre-established for the Gemini app upload flow, so exercising it would
require fresh OAuth consent. Skipped without click.
