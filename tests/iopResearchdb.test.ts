const test = require("node:test");
const assert = require("node:assert/strict");
import { buildIopSearchUrl, buildIopFilterUrl, buildIopArticleUrl, buildIopExportUrl, parseIopResultCount, parseIopItemsFromHtml, parseIopItemsFromVisibleText } from "../src/handlers/researchdb/legacy/iop";

test("IOPscience URL builders preserve verified /nsearch facet and export parameters", () => {
  assert.equal(
    buildIopSearchUrl({ query: "graphene AND photodetector NOT silicon", page_size: 25 }),
    "https://iopscience.iop.org/nsearch?terms=graphene+AND+photodetector+NOT+silicon&fromPage=results"
  );
  assert.equal(
    buildIopFilterUrl({ query: "graphene AND photodetector NOT silicon", pub_type: "article", search_date_period: "lastFiveYears", access_type: "open-access", journal_issn: "2053-1591", order_by: "relevance" }),
    "https://iopscience.iop.org/nsearch?terms=graphene+AND+photodetector+NOT+silicon&fromPage=results&searchDatePeriod=lastFiveYears&pubType=article&accessType=open-access&orderBy=relevance&journals=2053-1591"
  );
  assert.equal(buildIopArticleUrl("10.1088/2053-1591/ab4925"), "https://iopscience.iop.org/article/10.1088/2053-1591/ab4925");
  assert.equal(buildIopExportUrl("10.1088/2053-1591/ab4925", "ris"), "https://iopscience.iop.org/export?type=article&doi=10.1088%2F2053-1591%2Fab4925&exportFormat=iopexport_ris&exportType=abs&navsubmit=Export+abstract");
  assert.equal(buildIopExportUrl("10.1088/2053-1591/ab4925", "bibtex"), "https://iopscience.iop.org/export?type=article&doi=10.1088%2F2053-1591%2Fab4925&exportFormat=iopexport_bib&exportType=abs&navsubmit=Export+abstract");
});

test("IOPscience result count parsing handles hydrated and capped count text", () => {
  assert.equal(parseIopResultCount("Showing 1-10 of 38"), 38);
  assert.equal(parseIopResultCount("The top 500 results for graphene photodetector are:"), 500);
});

test("IOPscience deterministic fixture DOM extracts per-article items", () => {
  const html = `
    <html><body><p>Showing 1-10 of 38</p>
      <section class="search-result">
        <strong>JOURNAL ARTICLE</strong>
        <h2><a href="/article/10.1088/2053-1591/ab4925">InGaAs/graphene infrared photodetectors with enhanced responsivity</a></h2>
        <span>J Yang, Z Wang and H Li</span><span>2019</span><em>Materials Research Express</em>
        <a href="https://doi.org/10.1088/2053-1591/ab4925">https://doi.org/10.1088/2053-1591/ab4925</a>
        <a href="/article/10.1088/2053-1591/ab4925/pdf">PDF</a>
      </section>
      <section class="search-result">
        <strong>JOURNAL ARTICLE</strong>
        <h2><a href="/article/10.1088/1361-6463/ac1234">Graphene photodetector noise engineering</a></h2>
        <span>A Smith and B Jones</span><span>2024</span><em>Journal of Physics D: Applied Physics</em>
      </section>
    </body></html>`;
  const items = parseIopItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "InGaAs/graphene infrared photodetectors with enhanced responsivity");
  assert.equal(items[0].doi, "10.1088/2053-1591/ab4925");
  assert.equal(items[0].year, 2019);
  assert.equal(items[0].pdf_url, "https://iopscience.iop.org/article/10.1088/2053-1591/ab4925/pdf");
  assert.equal(items[1].doi, "10.1088/1361-6463/ac1234");
});

test("IOPscience visible-text fallback extracts DOI and year without live network", () => {
  const text = "Showing 1-10 of 16 JOURNAL ARTICLE InGaAs/graphene infrared photodetectors with enhanced responsivity J Yang and Z Wang 2019 Materials Research Express https://doi.org/10.1088/2053-1591/ab4925 PDF";
  const items = parseIopItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1088/2053-1591/ab4925");
  assert.equal(items[0].year, 2019);
});

test("IOPscience eBook ISBN export URL and validators cover RIS EBOOK and BibTeX book without regressing journal RIS", () => {
  const isbn = "978-0-7503-3343-6";
  assert.equal(buildIopExportUrl(isbn, "ris"), "https://iopscience.iop.org/exportAbstract?isbn=978-0-7503-3343-6&exportFormat=iopexport_ris&exportType=abs");
  assert.equal(buildIopExportUrl(isbn, "bibtex"), "https://iopscience.iop.org/exportAbstract?isbn=978-0-7503-3343-6&exportFormat=iopexport_bib&exportType=abs");
  const { isValidIopRisArtifact, isValidIopBibtexArtifact } = require("../src/handlers/researchdb/legacy/iop");
  const ebookRis = "TY  - EBOOK\nTI  - Semidefinite Programming in Quantum Information Science\nDO  - 10.1088/978-0-7503-3343-6\nSN  - 978-0-7503-3343-6\nER  -\n";
  const bookBib = "@book{10.1088/978-0-7503-3343-6,\ntitle = {Semidefinite Programming in Quantum Information Science},\nisbn = {978-0-7503-3343-6},\ndoi = {10.1088/978-0-7503-3343-6}\n}\n";
  const journalRis = "TY  - JOUR\nTI  - InGaAs/graphene infrared photodetectors\nDO  - 10.1088/2053-1591/ab4925\nER  -\n";
  assert.equal(isValidIopRisArtifact(ebookRis, isbn), true);
  assert.equal(isValidIopBibtexArtifact(bookBib, isbn), true);
  assert.equal(isValidIopRisArtifact(journalRis, "10.1088/2053-1591/ab4925"), true);
  assert.equal(isValidIopRisArtifact("TY  - EBOOK\nSN  - 978-0-7503-3343-6\n", isbn), false);
  assert.equal(isValidIopBibtexArtifact("@article{bad, isbn = {978-0-7503-3343-6}}", isbn), false);
});
