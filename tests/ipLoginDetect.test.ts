const test = require("node:test");
const assert = require("node:assert/strict");
import { detectIpLoginCandidates } from "../src/observe/ip-login-detect";

test("detectIpLoginCandidates ranks visible IP and institutional access controls", async () => {
  const page = {
    evaluate: async () => [
      { selector: "#search", text: "Search", visible: true },
      { selector: "#hidden-ip", text: "IP access", visible: false },
      { selector: "#ip-login", text: "IP登录", visible: true },
      { selector: "#institution", text: "Access through your institution", visible: true },
      { selector: "#openathens", text: "OpenAthens", visible: true },
      { selector: "#weak", text: "Institutional options", visible: true }
    ]
  };

  const candidates = await detectIpLoginCandidates(page as any);

  assert.deepEqual(candidates.map((candidate) => candidate.selector), ["#ip-login", "#institution", "#openathens", "#weak"]);
  assert.deepEqual(candidates.map((candidate) => candidate.confidence), ["high", "high", "high", "medium"]);
});
