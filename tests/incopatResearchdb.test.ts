const test = require("node:test");
const assert = require("node:assert/strict");
import { buildIncopatLoginUrl, buildIncopatSearchUrl, buildIncopatFacetSelector, buildIncopatNormalizedQuery, parseIncopatResultCount, parseIncopatItemsFromHtml, parseIncopatItemsFromDomRows } from "../src/handlers/researchdb/legacy/incopat";

test("IncoPat URL and selector builders preserve the verified custom-SPA surfaces", () => {
  assert.equal(buildIncopatLoginUrl(), "https://www.incopat.com/newLogin");
  assert.equal(buildIncopatSearchUrl(), "https://www.incopat.com/advancedSearch/simpleInit");
  assert.equal(buildIncopatFacetSelector("CN"), '#PNC_TYPE_CN span[onclick*="singleFilter"]');
  assert.equal(buildIncopatFacetSelector("us"), '#PNC_TYPE_US span[onclick*="singleFilter"]');
  assert.equal(buildIncopatNormalizedQuery("graphene battery"), "ALL=(GRAPHENE BATTERY)");
});

test("IncoPat result-count parser handles verified count nodes", () => {
  assert.equal(parseIncopatResultCount("共69175条"), 69175);
  assert.equal(parseIncopatResultCount(" 共 40,916 条 "), 40916);
  assert.equal(parseIncopatResultCount("40916"), 40916);
});

test("IncoPat HTML item parser extracts deterministic patent rows", () => {
  const html = `
    <html><body><table><tbody>
      <tr>
        <td><a class="pdf" onclick="downloadOnePdf('token')">CN107634110A</a></td>
        <td><span class="title">Graphene battery composite electrode</span></td>
        <td>申请人: Example Energy Co.; 发明人: Zhang Wei; Li Ming; 公开日: 2018-01-26</td>
      </tr>
      <tr>
        <td><a class="pdf" onclick="downloadOnePdf('token2')">US20200123456A1</a></td>
        <td><div class="patent-title">Battery separator with graphene coating</div></td>
        <td>Applicant: Example Labs; Inventor: Jane Smith; 2020</td>
      </tr>
    </tbody></table></body></html>`;
  const items = parseIncopatItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].publication_number, "CN107634110A");
  assert.equal(items[0].title, "Graphene battery composite electrode");
  assert.equal(items[0].year, 2018);
  assert.equal(items[1].publication_number, "US20200123456A1");
});

test("IncoPat DOM-row parser extracts rows from attach-only CDP observation dumps", () => {
  const items = parseIncopatItemsFromDomRows([{ publication_number: "CN107634110A", title: "Graphene battery composite electrode", text: "CN107634110A Graphene battery composite electrode 申请人: Example Energy Co. 发明人: Zhang Wei 公开日 2018-01-26" }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].publication_number, "CN107634110A");
  assert.equal(items[0].title, "Graphene battery composite electrode");
  assert.equal(items[0].year, 2018);
});
