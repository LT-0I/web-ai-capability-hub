# upload/from-drive

Status: NOT-REACHABLE

## Observation

Catalog row `files-connect-source` flagged availability `gated`. The Drive
attach affordance lives behind the composer `Add files and more` menu →
`Add from app`. Stream #3 did not exercise this. For Stream #4, exercising
this requires fresh OAuth on this Linux Chrome profile (account/identity
surface change, off-limits per doctrine §3 "External-service authentication
... read existing state only"). Recorded NOT-REACHABLE for this run.

Per inspection of the composer surface, `Add files and more` was the only
attach button observed in DOM (`data-testid=composer-plus-btn` family);
no pre-authorized Drive/SharePoint/GitHub connector chips were visible
without clicking through OAuth.
