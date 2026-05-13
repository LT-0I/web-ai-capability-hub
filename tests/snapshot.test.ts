const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
import { readHtmlSnapshotFromFile } from "../src/reader/snapshot";
import { findElementBySemanticTarget } from "../src/actions/semanticTargets";

test("page snapshot extraction reads mock web AI controls", () => {
  const snapshot = readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-web-ai.html"));
  assert.equal(snapshot.title, "Mock Web AI Console");
  assert.ok(snapshot.visibleText.includes("Assistant response"));
  assert.ok(findElementBySemanticTarget(snapshot, { role: "textbox", name: "message prompt" }));
  assert.ok(findElementBySemanticTarget(snapshot, { role: "button", name: "send" }));
  assert.ok(snapshot.elements.some((element) => element.role === "download" && /download response/i.test(element.name)));
});

test("lite page snapshot keeps interactive labels while dropping non-interactive text bloat", () => {
  const snapshot = readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-web-ai.html"), undefined, { mode: "lite" });
  const text = JSON.stringify(snapshot);
  assert.ok(text.includes("Message prompt"));
  assert.ok(text.includes("Send message"));
  assert.ok(text.includes("Tools menu"));
  assert.ok(!snapshot.visibleText.includes("This mock response demonstrates how generated output is read from the page."));
  assert.equal(snapshot.accessibility, undefined);
  assert.ok(snapshot.elements.every((element) => !element.attributes));
});

test("page snapshot extraction reads mock research database tables and filters", () => {
  const snapshot = readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-research-database.html"));
  assert.ok(snapshot.forms.length >= 1);
  assert.ok(snapshot.tables.length === 1);
  assert.deepEqual(snapshot.tables[0].headers, ["Title", "Authors", "Year", "Links"]);
  assert.equal(snapshot.tables[0].rows.length, 3);
  assert.ok(snapshot.elements.some((element) => element.role === "checkbox" && /2024/.test(element.name + element.text)));
});
