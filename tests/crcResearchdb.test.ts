const test = require("node:test");
const assert = require("node:assert/strict");
import { buildCrcAdvancedSearchUrl, buildCrcSearchUrl, parseCrcResultCount, parseCrcItemsFromHtml, parseCrcItemsFromVisibleText } from "../src/mcp/researchdb/crc/flow";

test("CRC/T&F eBooks URL builders preserve the distinct UBX advanced-search surface", () => {
  assert.equal(buildCrcAdvancedSearchUrl(), "https://www.taylorfrancis.com/search/advance-search?context=ubx");
  assert.equal(buildCrcSearchUrl({ query: "machine learning" }), "https://www.taylorfrancis.com/search?advanceKeywords=machine+learning");
  assert.equal(
    buildCrcSearchUrl({ title: "machine learning", author: "bishop", keyword: "neural networks" }),
    "https://www.taylorfrancis.com/search?advanceTitle=machine+learning&advanceAuthor=bishop&advanceKeywords=neural+networks"
  );
});

test("CRC/T&F eBooks result-count parsing recognizes the canonical reader count", () => {
  assert.equal(parseCrcResultCount("Books (15,098) Showing 15,098 results page 1"), 15098);
  assert.equal(parseCrcResultCount("Filter By Showing 1,962 results CRC Press"), 1962);
});

test("CRC/T&F eBooks item parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div>Showing 2 results</div>
      <a class="search-flex-container" data-gtm="gtm-search-result" href="/books/mono/10.1201/9781003402848/applied-machine-learning-using-mlr3-r-bernd-bischl">
        <h3 class="search-result-title">Applied Machine Learning Using mlr3 in R</h3>
        <span>Book by Bernd Bischl, Raphael Sonabend First Published 2024 DOI 10.1201/9781003402848</span>
      </a>
      <a class="search-flex-container" data-gtm="gtm-search-result" href="/chapters/edit/10.1201/9781003333333-4/machine-learning-uav-systems">
        <span class="title">Machine Learning for UAV Systems</span>
        <span>Chapter by Mei Wang Copyright 2023 DOI 10.1201/9781003333333-4</span>
      </a>
    </body></html>`;
  const items = parseCrcItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Applied Machine Learning Using mlr3 in R");
  assert.equal(items[0].doi, "10.1201/9781003402848");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].content_type, "Chapter");
});

test("CRC/T&F eBooks visible-text fallback extracts DOI-bearing rows without live network", () => {
  const text = "Showing 2 results Book Applied Machine Learning Using mlr3 in R by Bernd Bischl First Published 2024 DOI 10.1201/9781003402848 Chapter Machine Learning for UAV Systems by Mei Wang Copyright 2023 DOI 10.1201/9781003333333-4";
  const items = parseCrcItemsFromVisibleText(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].doi, "10.1201/9781003402848");
  assert.equal(items[1].year, 2023);
});
