const test = require("node:test");
const assert = require("node:assert/strict");
import { buildIestSearchUrl, buildIestFilterUrl, buildIestArticleUrl, parseIestResultCount, parseIestItemsFromHtml, parseIestItemsFromDomRows } from "../src/handlers/researchdb/legacy/iest";

test("IEST URL builders preserve verified q[0] search surface and article host", () => {
  assert.equal(buildIestSearchUrl({ query: "cleanroom" }), "https://jiest.kglmeridian.com/search?q%5B0%5D=cleanroom");
  assert.equal(buildIestSearchUrl({ query: "ISO cleanroom standards" }), "https://jiest.kglmeridian.com/search?q%5B0%5D=ISO+cleanroom+standards");
  assert.equal(
    buildIestFilterUrl({ query: "cleanroom", from_year: 2006, to_year: 2006, access: "Free", refine_query: "ISO", refine_field: "title" }),
    "https://jiest.kglmeridian.com/search?q%5B0%5D=cleanroom&fromDate=2006&toDate=2006&access=Free&q%5B1%5D=ISO&field%5B1%5D=title"
  );
  assert.equal(buildIestArticleUrl({ article_path: "/view/journals/jiet/49/1/article-p21.xml?isSearch=true" }), "https://jiest.kglmeridian.com/view/journals/jiet/49/1/article-p21.xml?isSearch=true");
});

test("IEST result count and fixture HTML parsing use PubFactory result anchors", () => {
  const html = `
    <html><body><main id="main">
      <p class="css-lnymq1"><span class="css-13vy50p">You are looking at</span> 1-10 of 155 items</p>
      <article>
        <a href="/view/journals/jiet/49/1/article-p21.xml?isSearch=true">Practical Application of ISO Cleanroom Standards</a>
        <p>Author: Anne Dixon Journal of the IEST 2006 DOI 10.17764/jiet.49.1.y6v045540378n315</p>
      </article>
      <article>
        <a href="/view/journals/jiet/58/2/article-p1.xml?isSearch=true">Cleanroom Operations and Monitoring</a>
        <p>Authors: Jane Smith and John Doe Journal of the IEST 2015 DOI 10.17764/jiet.58.2.abc123</p>
      </article>
    </main></body></html>`;
  assert.equal(parseIestResultCount("You are looking at 1-10 of 1,234 items"), 1234);
  const items = parseIestItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Practical Application of ISO Cleanroom Standards");
  assert.equal(items[0].article_path, "/view/journals/jiet/49/1/article-p21.xml");
  assert.equal(items[0].doi, "10.17764/jiet.49.1.y6v045540378n315");
  assert.equal(items[0].journal, "Journal of the IEST");
  assert.equal(items[0].year, 2006);
});

test("IEST DOM row fallback extracts deterministic visible results", () => {
  const rows = [{ href: "/view/journals/jiet/49/1/article-p21.xml?isSearch=true", title: "Practical Application of ISO Cleanroom Standards", text: "Practical Application of ISO Cleanroom Standards Author: Anne Dixon Journal of the IEST 2006 DOI 10.17764/jiet.49.1.y6v045540378n315" }];
  const items = parseIestItemsFromDomRows(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].authors[0], "Anne Dixon");
  assert.equal(items[0].doi, "10.17764/jiet.49.1.y6v045540378n315");
});
