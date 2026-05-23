const test = require("node:test");
const assert = require("node:assert/strict");
import { buildPubscholarHomeUrl, buildPubscholarExploreUrl, buildPubscholarAdvancedQueryLabel, normalizePubscholarConditions, parsePubscholarResultCount, parsePubscholarResultCountParts, parsePubscholarItemsFromHtml, parsePubscholarItemsFromDomRows } from "../src/handlers/researchdb/legacy/pubscholar";

test("PubScholar builders preserve route-only SPA and breadcrumb query state", () => {
  assert.equal(buildPubscholarHomeUrl(), "https://pubscholar.cn");
  assert.equal(buildPubscholarExploreUrl(), "https://pubscholar.cn/explore");
  assert.equal(
    buildPubscholarAdvancedQueryLabel({ query: "深度学习", keyword: "图像识别" }),
    "高级检索: 标题=深度学习 AND 关键词=图像识别"
  );
  const conditions = normalizePubscholarConditions({ query: "无人机", conditions: [{ field: "摘要", value: "无人机", match_mode: "精确", op: "AND" }, { field: "作者", value: "张", op: "OR" }] });
  assert.equal(conditions[0].field, "摘要");
  assert.equal(conditions[0].match_mode, "精确");
  assert.equal(conditions[1].op, "OR");
});

test("PubScholar result-count parser handles verified selected/total format", () => {
  assert.deepEqual(parsePubscholarResultCountParts("0 / 404 条"), { selected: 0, total: 404 });
  assert.equal(parsePubscholarResultCount("0 / 59 条"), 59);
  assert.equal(parsePubscholarResultCount("404 条"), 404);
});

test("PubScholar HTML item parser extracts deterministic Vue result rows", () => {
  const html = `
    <html><body><div class="List">
      <div class="List__item">
        <div class="ContentItem__title">基于深度学习的水果图像识别</div>
        <div class="ContentItem__meta">中国农机化学报 2025;46(1):198-203 DOI 10.13733/j.jcam.issn.2095-5553.2025.01.030</div>
        <div>作者：王强；李明</div>
      </div>
      <div class="List__item">
        <a class="ContentItem__title">图像识别中的深度特征研究</a>
        <div class="ContentItem__meta">计算机学报 2024 DOI 10.1000/example</div>
      </div>
    </div></body></html>`;
  const items = parsePubscholarItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "基于深度学习的水果图像识别");
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].doi, "10.13733/j.jcam.issn.2095-5553.2025.01.030");
});

test("PubScholar DOM-row parser extracts title, year, DOI, and author evidence", () => {
  const items = parsePubscholarItemsFromDomRows([{ title: "基于深度学习的水果图像识别", meta: "中国农机化学报 2025;46(1):198-203", text: "基于深度学习的水果图像识别 作者：王强；李明 中国农机化学报 2025 DOI 10.13733/j.jcam.issn.2095-5553.2025.01.030" }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].authors[0], "王强");
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].doi, "10.13733/j.jcam.issn.2095-5553.2025.01.030");
});
