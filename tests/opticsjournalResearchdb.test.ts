const test = require("node:test");
const assert = require("node:assert/strict");
import { buildOpticsjournalSearchUrl, buildOpticsjournalSearchForm, parseOpticsjournalResultCount, parseOpticsjournalItemsFromHtml, parseOpticsjournalItemsFromVisibleText } from "../src/handlers/researchdb/legacy/opticsjournal";

test("Opticsjournal builders preserve verified advanced-search form contract", () => {
  assert.equal(buildOpticsjournalSearchUrl(), "https://www.opticsjournal.net/Search");
  assert.deepEqual(buildOpticsjournalSearchForm({ query: "metasurface", field_type: "title", year_from: 2023, year_to: 2026, page_size: 20 }), {
    _title: "metasurface",
    _ktype: "标题",
    year_from: "2023",
    year_to: "2026",
    pageSize: "20"
  });
});

test("Opticsjournal result count parsing handles total and refined count text", () => {
  assert.equal(parseOpticsjournalResultCount("共找到 375 个内容。共 38 页"), 375);
  assert.equal(parseOpticsjournalResultCount("共找到 375 个内容。在限定出版年为【2025】后，本次查询到 116 条符合条件的记录"), 116);
});

test("Opticsjournal fixture DOM parser extracts result items", () => {
  const html = `
    <div class="item article">
      <a class="art-title h4-tit" data-aid="OJ3e5648a1c4cbc970" href="/Articles/OJ3e5648a1c4cbc970/Abstract">Spectro-polarimetric detection enabled by multidimensional metasurface</a>
      <span>Haoyang He, Fangxing Lai</span>
      <span>Abstract spectro-polarimetric detection multidimensional metasurface</span>
      <a>PDF全文</a> <span>Opto-Electronic Advances 2025, 8(10): 250015</span>
      <span>doi: 10.29026/oea.2025.250015</span>
    </div>
    <div class="item article">
      <a class="h4-tit" data-aid="OJabc" href="/Articles/OJabc/Abstract">基于介质超表面的编码宽带涡旋波束</a>
      <span>汪建锋 魏强 史若楠</span>
      <a>PDF全文</a> <span>压电与声光 2025, 47(6): 1106</span>
    </div>`;
  const items = parseOpticsjournalItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Spectro-polarimetric detection enabled by multidimensional metasurface");
  assert.equal(items[0].article_id, "OJ3e5648a1c4cbc970");
  assert.equal(items[0].article_path, "/Articles/OJ3e5648a1c4cbc970/Abstract");
  assert.equal(items[0].journal, "Opto-Electronic Advances");
  assert.equal(items[0].year, 2025);
});

test("Opticsjournal visible-text fallback extracts page records without network", () => {
  const text = "论文查询结果 科研论文 EBI-DNN驱动的多通道超表面设计与优化 AI高清视频导读 AI语音播报 赵方旭 李娜 作者单位 摘要 metasurfaces PDF全文 Full Text 光电工程 2025, 52(11): 250219 综述 超表面逆向设计 AI高清视频导读 AI语音播报 杨帅 欧春晖 作者单位 摘要 inverse design metasurface PDF全文 Full Text 光电工程 2025, 52(11): 250199";
  const items = parseOpticsjournalItemsFromVisibleText(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].journal, "光电工程");
});
