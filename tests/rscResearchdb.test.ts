const test = require("node:test");
const assert = require("node:assert/strict");
import { buildRscSearchUrl, buildRscFilterUrl, buildRscDoiSearchUrl, parseRscResultCount, parseRscItemsFromHtml, parseRscItemsFromVisibleText } from "../src/handlers/researchdb/legacy/rsc";

test("RSC URL builders preserve verified advanced-search and Open Access refine parameters", () => {
  assert.equal(
    buildRscSearchUrl({ query: "graphene AND oxide NOT membrane" }),
    "https://pubs.rsc.org/en/results/journals?Category=Journal&AllText=graphene+AND+oxide+NOT+membrane&IncludeReference=false&SelectJournal=false&DateRange=false&SelectDate=false&Type=Months&PriceCode=False&OpenAccess=false"
  );
  const filter = buildRscFilterUrl({ query: "graphene AND oxide NOT membrane", access: "Open Access", page_size: 25 });
  assert.equal(filter, "https://pubs.rsc.org/en/results/journals?Category=Journal&AllText=graphene+AND+oxide+NOT+membrane&IncludeReference=false&SelectJournal=false&DateRange=false&SelectDate=false&Type=Months&PriceCode=False&OpenAccess=false&PageSize=25&Article+Access=Open+Access&SortBy=Relevance&tab=journal&fcategory=journal&filter=journal");
  assert.equal(buildRscDoiSearchUrl("10.1039/C6RA28392F"), "https://pubs.rsc.org/en/results/journals?Category=Journal&DOI=10.1039%2FC6RA28392F&IncludeReference=false&SelectJournal=false&DateRange=false&SelectDate=false&Type=Months&PriceCode=False&OpenAccess=false");
});

test("RSC result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body><main><div id="pnlArticles" class="tab__panel">
      35,304 results - Showing page 1 of 1413
      <div class="capsule capsule--article">
        <a href="/en/content/articlelanding/2017/ra/c6ra28392f">Polyolefin/graphene nanocomposites: a review</a>
        <span>Open Access</span><span>Seyed M. and Lei Wang</span>
        <span>RSC Adv.</span><span>2017</span><span>10.1039/C6RA28392F</span>
      </div>
      <div class="capsule capsule--article">
        <a href="/en/content/articlelanding/2020/na/c9na00789a">Graphene oxide chemistry</a>
        <span>Jane Roe and John Public</span><span>Nanoscale</span><span>2020</span><span>10.1039/C9NA00789A</span>
      </div>
    </div></main></body></html>`;
  assert.equal(parseRscResultCount("35,304 results - Showing page 1 of 1413"), 35304);
  const items = parseRscItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Polyolefin/graphene nanocomposites: a review");
  assert.equal(items[0].doi, "10.1039/C6RA28392F");
  assert.equal(items[0].journal, "RSC Adv.");
  assert.equal(items[0].year, 2017);
  assert.equal(items[0].article_url, "https://pubs.rsc.org/en/content/articlelanding/2017/ra/c6ra28392f");
});

test("RSC visible-text fallback extracts count-adjacent items without live network", () => {
  const text = "6,959 results - Showing page 1 of 279 Open Access Polyolefin/graphene nanocomposites: a review Seyed M. and Lei Wang RSC Adv. 2017 10.1039/C6RA28392F";
  const items = parseRscItemsFromVisibleText(text);
  assert.match(items[0].title, /^Polyolefin\/graphene nanocomposites: a review/);
  assert.equal(items[0].doi, "10.1039/C6RA28392F");
  assert.equal(items[0].year, 2017);
});
