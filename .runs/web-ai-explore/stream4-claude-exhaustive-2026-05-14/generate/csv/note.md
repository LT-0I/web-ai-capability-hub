status: PASS
artifact: world_capitals.csv
size: 172
sha256: 6ab24184fd056812b43b0b6bd4411b8533c86d72bf36aaf4935f5da8e844ad08
selector_used: button[aria-label="Download World capitals"]
observation: In-message Download button worked for .csv code artifact (similar to .py). Drift observation: .md in-message Download did NOT work but .csv DOES — selector pattern is NOT artifact-type dependent; it's content-class dependent (long-form prose vs short code). Catalog should note: code-class artifacts (.py/.csv/.sh) use in-message; document-class (.md, .docx, .xlsx) use panel chevron.
