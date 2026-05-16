const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAcmSearchUrl, buildAcmFilterUrl, buildAcmDoiSearchUrl, parseAcmResultCount, parseAcmItemsFromHtml, parseAcmItemsFromVisibleText, researchAcmFilter, WebAiToolError } from "../src/mcp/researchdb/acm/flow";

test("ACM URL builders preserve verified advanced search and date refine parameters", () => {
  assert.equal(
    buildAcmSearchUrl({ query: "unmanned aerial vehicle", area: "Title", page_size: 50 }),
    "https://dl.acm.org/action/doSearch?fillQuickSearch=false&target=advanced&expand=dl&field1=Title&text1=unmanned+aerial+vehicle&pageSize=50"
  );
  assert.equal(
    buildAcmFilterUrl({ query: "unmanned aerial vehicle", area: "Title", after_year: 2023, before_year: 2025, sort_by: "downloaded" }),
    "https://dl.acm.org/action/doSearch?fillQuickSearch=false&target=advanced&expand=dl&field1=Title&text1=unmanned+aerial+vehicle&AfterYear=2023&BeforeYear=2025&sortBy=downloaded"
  );
  assert.equal(
    buildAcmDoiSearchUrl("10.1145/3746469.3746590"),
    "https://dl.acm.org/action/doSearch?fillQuickSearch=false&target=advanced&expand=dl&field1=DOI&text1=10.1145%2F3746469.3746590"
  );
});

test("ACM result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>Title: unmanned aerial vehicle : Search</title></head><body>
      <main><span>202 Results</span>
      <li class="search__item">
        <div class="issue-item">
          <h5 class="issue-item__title"><a>Development of the Unmanned Aerial Vehicle Wire Reel</a></h5>
          <ul class="rlist--inline loa"><li>Jing Liu</li><li>Lei Wang</li></ul>
          <div class="issue-item__detail">Proceedings of the 2025 International Conference on Unmanned Systems</div>
          <span>2025</span>
          <a class="issue-item__doi" href="https://doi.org/10.1145/3746469.3746590">https://doi.org/10.1145/3746469.3746590</a>
        </div>
      </li>
      <li class="search__item">
        <div class="issue-item">
          <h5 class="issue-item__title"><a>UAV Path Planning in Urban Environments</a></h5>
          <span>Mei Chen and Qiang Zhang</span><span>2024</span>
          <a class="issue-item__doi">10.1145/1234567.1234568</a>
        </div>
      </li>
      </main>
    </body></html>`;
  assert.equal(parseAcmResultCount("202 Results"), 202);
  const items = parseAcmItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Development of the Unmanned Aerial Vehicle Wire Reel");
  assert.equal(items[0].doi, "10.1145/3746469.3746590");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].doi, "10.1145/1234567.1234568");
});

test("ACM visible-text fallback extracts items without live network", () => {
  const text = "82 Results Export Citation Development of the Unmanned Aerial Vehicle Wire Reel Jing Liu and Lei Wang 2025 Proceedings of the 2025 International Conference on Unmanned Systems https://doi.org/10.1145/3746469.3746590 PDF";
  const items = parseAcmItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1145/3746469.3746590");
  assert.equal(items[0].year, 2025);
});

test("ACM premium facet request surfaces existing PLAN_OR_QUOTA_REQUIRED code", async () => {
  await assert.rejects(
    () => researchAcmFilter({ query: "unmanned aerial vehicle", area: "Title", facet: "ContentType" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "PLAN_OR_QUOTA_REQUIRED"
  );
});
