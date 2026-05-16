const test = require("node:test");
const assert = require("node:assert/strict");
import { buildRoyalSocSearchUrl, buildRoyalSocFilterUrl, buildRoyalSocCitationDownloadUrl, parseRoyalSocDerivedResultCount, parseRoyalSocItemsFromHtml, parseRoyalSocItemsFromVisibleText } from "../src/mcp/researchdb/royalsoc/flow";

test("Royal Society URL builders preserve verified Silverchair advanced search, facet, and citation contracts", () => {
  assert.equal(
    buildRoyalSocSearchUrl({ query: "unmanned aerial vehicle" }),
    "https://royalsocietypublishing.org/search-results?q=unmanned+aerial+vehicle&hd=advancedAny&searchType=advanced"
  );
  assert.equal(
    buildRoyalSocFilterUrl({ query: "unmanned aerial vehicle", journal: "Journal of The Royal Society Interface" }),
    "https://royalsocietypublishing.org/search-results?q=unmanned+aerial+vehicle&hd=advancedAny&fl_SiteID=1&page=1&f_JournalDisplayName=Journal+of+The+Royal+Society+Interface"
  );
  assert.equal(
    buildRoyalSocFilterUrl({ query: "unmanned aerial vehicle", article_type: "Research article", subject_id: 17, issue_section: "Research articles" }),
    "https://royalsocietypublishing.org/search-results?q=unmanned+aerial+vehicle&hd=advancedAny&fl_SiteID=1&page=1&f_ArticleTypeDisplayName=Research+article&f_FacetCategoryIDs_1=17&f_TocHeadingTitle=Research+articles"
  );
  assert.equal(buildRoyalSocCitationDownloadUrl("108347", "ris"), "https://royalsocietypublishing.org/Citation/Download?resourceId=108347&resourceType=3&citationFormat=0");
  assert.equal(buildRoyalSocCitationDownloadUrl("108347", "bibtex"), "https://royalsocietypublishing.org/Citation/Download?resourceId=108347&resourceType=3&citationFormat=2");
});

test("Royal Society DOM parsing ignores no-results decoy and extracts hydrated result items", () => {
  const html = `
    <html><body>
      <div class="sr-alert-noresults" style="display:block">No results</div>
      <div class="sr-list_wrap">
        <div class="sr-list al-article-box al-normal clearfix content-type-journal-articles">
          <h4><a id="aria0" href="/rsta/article/382/2281/20230314/108347/Unmanned-aerial-vehicles-equipped-with-sensor?searchresult=1">Unmanned aerial vehicles equipped with sensor packages to study spatiotemporal variations of air pollutants in industry parks</a></h4>
          <span>Jane Doe, John Roe</span>
          <span>Philosophical Transactions of the Royal Society A Published 2024</span>
          <a href="https://doi.org/10.1098/rsta.2023.0314">https://doi.org/10.1098/rsta.2023.0314</a>
        </div>
        <div class="sr-list al-article-box al-normal clearfix content-type-journal-articles">
          <h4><a id="aria1" href="/rsif/article/23/237/20250978/481494/Bridging-the-gap?searchresult=1">Bridging the gap: a review of gust mitigation in birds and small uncrewed aerial vehicles</a></h4>
          <span>A. Smith and B. Li</span>
          <span>Journal of The Royal Society Interface Published 2026</span>
          <a href="https://doi.org/10.1098/rsif.2025.0978">https://doi.org/10.1098/rsif.2025.0978</a>
        </div>
      </div>
      <a class="al-pageNumber" data-url="/search-results?q=uav&page=3">3</a>
    </body></html>`;
  assert.equal(parseRoyalSocDerivedResultCount(html), 42);
  const items = parseRoyalSocItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Unmanned aerial vehicles equipped with sensor packages to study spatiotemporal variations of air pollutants in industry parks");
  assert.equal(items[0].doi, "10.1098/rsta.2023.0314");
  assert.equal(items[0].resource_id, "108347");
  assert.equal(items[0].journal_prefix, "rsta");
  assert.equal(items[1].publication, "Journal of The Royal Society Interface");
  assert.equal(items[1].journal_prefix, "rsif");
});

test("Royal Society visible-text fallback extracts DOI records without live network", () => {
  const text = "JOURNAL ARTICLES Bridging the gap: a review of gust mitigation in birds and small uncrewed aerial vehicles A. Smith, B. Li Journal of The Royal Society Interface Published 2026 https://doi.org/10.1098/rsif.2025.0978 View Article";
  const items = parseRoyalSocItemsFromVisibleText(text);
  assert.equal(items[0].title, "Bridging the gap: a review of gust mitigation in birds and small uncrewed aerial vehicles A. Smith, B. Li");
  assert.equal(items[0].publication, "Journal of The Royal Society Interface");
  assert.equal(items[0].doi, "10.1098/rsif.2025.0978");
  assert.equal(items[0].year, 2026);
});
