const test = require("node:test");
const assert = require("node:assert/strict");
import { buildWanfangSearchUrl, buildWanfangFacetParam, buildWanfangFilterUrl, parseWanfangResultCount, parseWanfangItemsFromDomRows, parseWanfangItemsFromHtml } from "../src/handlers/researchdb/legacy/wanfang";

test("Wanfang URL builders preserve the verified replayable search and facet surfaces", () => {
  assert.equal(buildWanfangSearchUrl("无人机路径规划"), "https://s.wanfangdata.com.cn/paper?q=%E6%97%A0%E4%BA%BA%E6%9C%BA%E8%B7%AF%E5%BE%84%E8%A7%84%E5%88%92");
  assert.equal(buildWanfangFacetParam("Thesis"), JSON.stringify([{ Type: { label: ["学位论文"], title: "资源类型", value: ["Thesis"] } }]));
  assert.equal(
    buildWanfangFilterUrl({ query: "无人机路径规划", resource_type: "Thesis" }),
    "https://s.wanfangdata.com.cn/paper?q=%E6%97%A0%E4%BA%BA%E6%9C%BA%E8%B7%AF%E5%BE%84%E8%A7%84%E5%88%92&p=1&facet=%5B%7B%22Type%22%3A%7B%22label%22%3A%5B%22%E5%AD%A6%E4%BD%8D%E8%AE%BA%E6%96%87%22%5D%2C%22title%22%3A%22%E8%B5%84%E6%BA%90%E7%B1%BB%E5%9E%8B%22%2C%22value%22%3A%5B%22Thesis%22%5D%7D%7D%5D"
  );
});

test("Wanfang result-count parser handles verified body text", () => {
  assert.equal(parseWanfangResultCount("找到12,447条文献"), 12447);
  assert.equal(parseWanfangResultCount("获取范围 找到2，253条文献 资源类型"), 2253);
});

test("Wanfang DOM-row parser extracts deterministic SPA result rows", () => {
  const rows = [{ text: "1.目录基于三维重建的无人机路径规划研究 [硕士论文]王潇物流工程与管理太原科技大学2025 摘要：结果表明 无人机路径规划三维重建技术 在线阅读整篇下载分章下载引用 收藏 下载：6" }];
  const items = parseWanfangItemsFromDomRows(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "基于三维重建的无人机路径规划研究");
  assert.equal(items[0].type, "硕士论文");
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].authors[0], "王潇物流工程与管理太原科技大学");
});

test("Wanfang HTML parser remains fixture-only and network-free", () => {
  const html = `
    <div class="normal-list">
      <div class="title-area"><a class="title">无人机路径规划算法研究</a></div>
      <div>[硕士论文]李杰计算机技术四川大学2024 摘要：Particle Swarm Optimization 在线阅读下载引用 收藏</div>
    </div>`;
  const items = parseWanfangItemsFromHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "无人机路径规划算法研究");
  assert.equal(items[0].year, 2024);
});
