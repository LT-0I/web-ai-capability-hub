# A12 — download-image

**Status:** PASS

Initial prompt `Generate a small simple image: a red square on a white
background.` produced an SVG artifact rendered in an MCP-app iframe
(`iframe[title="visualize: Red square"]`, src
`https://f734dd82dc4d22fe17975f36de3d1a19.claudemcpcontent.com/...`). The
inline SVG artifact did NOT expose a Download button in the chat — only an
artifact-rename trigger.

Follow-up prompt `Save that SVG as a downloadable .svg file please.` made
Claude regenerate the SVG as a code-file artifact with a
`button[aria-label="Download Red square"]` control (same pattern as A11
code-file). Used `browser:artifact-click` with `--url` pinning the chat URL.

File landed on disk:
- path: `download/8ed19575-a8c9-46fe-a9ac-3f019b5f025e`
- suggestedFilename: `red_square.svg`
- size: 178 bytes
- sha256: `980483977d0559dbf00fac86c34cb776eb368130727cb1cd4bd5879aa95246c2`
- content (valid SVG):
  ```svg
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="white"/>
    <rect x="50" y="50" width="100" height="100" fill="red"/>
  </svg>
  ```

Note: this is a vector SVG, not a raster image. PASS per "Image on disk;
size > 0" branch. Catalog observation: the MCP-app SVG-render path
(`mcp_apps` iframe) doesn't expose a direct download button — only the
code-artifact path does.

Evidence: `type-2.json`, `read-7.json`, `artifact-click.json`, downloaded
file in `download/`.
