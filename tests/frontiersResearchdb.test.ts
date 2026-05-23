const test = require("node:test");
const assert = require("node:assert/strict");
import { buildFrontiersSearchUrl, buildFrontiersCitationUrl, frontiersFacetSelectors, parseFrontiersResultCount, parseFrontiersItemsFromHtml, parseFrontiersItemsFromVisibleText, researchFrontiersExport, WebAiToolError } from "../src/handlers/researchdb/legacy/frontiers";

test("Frontiers URL builders preserve verified search, facet, and citation contracts", () => {
  assert.equal(
    buildFrontiersSearchUrl({ query: '"unmanned aerial vehicle" AND "deep learning"' }),
    "https://www.frontiersin.org/search?query=%22unmanned+aerial+vehicle%22+AND+%22deep+learning%22&tab=articles"
  );
  assert.deepEqual(frontiersFacetSelectors("date", 3), {
    group: "date",
    groupSelector: '[data-test-id="article_filter_date"]',
    optionSelector: '[data-test-id="article_date_filter_3"]'
  });
  assert.equal(
    buildFrontiersCitationUrl({ doi: "10.3389/frobt.2019.00042", journal_slug: "robotics-and-ai", format: "bibtex" }),
    "https://public-pages-files-2025.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00042/bibTex"
  );
  assert.equal(
    buildFrontiersCitationUrl({ doi: "10.3389/frobt.2019.00042", article_url: "https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00042/full", format: "reference" }),
    "https://public-pages-files-2025.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00042/reference"
  );
});

test("Frontiers result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div id="article-results"><div class="results-header"><div class="title"><span>2,282</span> Articles</div></div>
      <ul class="entities-list articles">
        <li>
          <a data-test-id="article_navigate_123" href="/journals/robotics-and-ai/articles/10.3389/frobt.2019.00042/full">Visual Pose Estimation of Rescue Unmanned Surface Vehicle From Unmanned Aerial System</a>
          <span>F. Dufek and R. Murphy</span><span>Frontiers in Robotics and AI</span><span>2019</span>
        </li>
        <li>
          <a data-test-id="article_navigate_456" href="/journals/aerospace-engineering/articles/10.3389/fpace.2025.1234567/full">Deep Learning for UAV Navigation</a>
          <span>Jane Smith; Wei Zhang</span><span>Frontiers in Aerospace Engineering</span><span>2025</span>
        </li>
      </ul></div>
    </body></html>`;
  assert.equal(parseFrontiersResultCount("2,282 Articles"), 2282);
  const items = parseFrontiersItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Visual Pose Estimation of Rescue Unmanned Surface Vehicle From Unmanned Aerial System");
  assert.equal(items[0].doi, "10.3389/frobt.2019.00042");
  assert.equal(items[0].year, 2019);
  assert.equal(items[0].url, "https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00042/full");
  assert.equal(items[1].journal, "Frontiers in Aerospace Engineering");
});

test("Frontiers visible-text fallback and export argument validation are deterministic", async () => {
  const text = "2,282 Articles Original Research Visual Pose Estimation of Rescue Unmanned Surface Vehicle From Unmanned Aerial System Frontiers in Robotics and AI 2019 DOI 10.3389/frobt.2019.00042";
  const items = parseFrontiersItemsFromVisibleText(text);
  assert.equal(items[0].year, 2019);
  assert.equal(items[0].journal, "Frontiers in Robotics and AI");
  await assert.rejects(
    () => researchFrontiersExport({ doi: "10.3389/frobt.2019.00042", format: "bibtex" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "INVALID_ARGS"
  );
});
