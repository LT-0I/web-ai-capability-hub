const test = require("node:test");
const assert = require("node:assert/strict");
import { buildScieloSearchUrl, buildScieloFilterUrl, buildScieloExportUrl, parseScieloResultCount, parseScieloItemsFromHtml, parseScieloItemsFromVisibleText, researchScieloExport, WebAiToolError } from "../src/handlers/researchdb/legacy/scielo";

test("SciELO URL builders preserve verified GET search, facet, and export contracts", () => {
  assert.equal(
    buildScieloSearchUrl({ query: "(unmanned aerial vehicle) AND navigation" }),
    "https://search.scielo.org/?q=%28unmanned+aerial+vehicle%29+AND+navigation&lang=pt&count=15&from=0&output=site&sort=&format=summary&fb=&page=1"
  );
  assert.equal(
    buildScieloFilterUrl({ query: "(unmanned aerial vehicle) AND navigation", collection: "scl" }),
    "https://search.scielo.org/?q=%28unmanned+aerial+vehicle%29+AND+navigation&lang=pt&count=15&from=0&output=site&sort=&format=summary&fb=&page=1&filter%5Bin%5D%5B%5D=scl"
  );
  assert.equal(
    buildScieloExportUrl({ query: "(unmanned aerial vehicle) AND navigation", collection: "scl", export_format: "ris" }),
    "https://search.scielo.org/?q=%28unmanned+aerial+vehicle%29+AND+navigation&lang=pt&count=15&from=0&output=ris&sort=&format=summary&fb=&page=1&filter%5Bin%5D%5B%5D=scl"
  );
});

test("SciELO result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div class="filterTitle">Resultados: 8</div>
      <div id="ResultArea"><div class="results">
        <div class="item" id="S2175-91462026000101002-scl">
          <div class="line"><a href="https://www.scielo.br/scielo.php?script=sci_arttext&pid=S2175-91462026000101002&lang=pt">OPsCV: A Robust Framework for Aerial Navigation under GPS Denied Conditions</a></div>
          <div>Autores: Jane Doe; Wei Zhang</div><div>Journal of Aerospace Technology and Management 2026</div><div>DOI: 10.1590/jatm.v18.1413</div>
        </div>
        <div class="item" id="S0100-00002021000100001-col">
          <div class="line"><a href="/scielo.php?script=sci_arttext&pid=S0100-00002021000100001&lang=pt">Navigation for unmanned aerial vehicles in urban environments</a></div>
          <div>Autores: Ana Silva, Rui Costa</div><div>Revista Engenharia 2021</div><div>doi:10.1590/0100-0000-2021-01</div>
        </div>
      </div></div>
    </body></html>`;
  assert.equal(parseScieloResultCount("Filtros Resultados: 1.234"), 1234);
  const items = parseScieloItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "OPsCV: A Robust Framework for Aerial Navigation under GPS Denied Conditions");
  assert.equal(items[0].doi, "10.1590/jatm.v18.1413");
  assert.equal(items[0].pid, "S2175-91462026000101002");
  assert.equal(items[0].collection, "scl");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].url, "https://www.scielo.br/scielo.php?script=sci_arttext&pid=S2175-91462026000101002&lang=pt");
});

test("SciELO visible-text fallback and invalid export format are deterministic", async () => {
  const text = "Resultados: 5 Resumo OPsCV: A Robust Framework for Aerial Navigation under GPS Denied Conditions Authors: Jane Doe DOI 10.1590/jatm.v18.1413 Journal 2026 SciELO Resumo UAV navigation DOI 10.1590/0100-0000-2021-01 2021";
  const items = parseScieloItemsFromVisibleText(text);
  assert.equal(items.length >= 1, true);
  assert.equal(items[0].doi, "10.1590/jatm.v18.1413");
  assert.equal(items[0].year, 2026);
  await assert.rejects(
    () => researchScieloExport({ query: "uav", export_format: "endnote" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "INVALID_ARGS"
  );
});
