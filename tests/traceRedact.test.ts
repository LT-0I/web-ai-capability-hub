const test = require("node:test");
const assert = require("node:assert/strict");
import { redactValue } from "../src/trace/redact";

test("redacts profile ids only under profile keys", () => {
  assert.deepEqual(redactValue({ profileId: "chatgpt", other: "chatgpt" }, { mode: "default" }), { profileId: "<profile>", other: "chatgpt" });
});

test("redacts conversation ids in URLs", () => {
  assert.equal(redactValue("https://chatgpt.com/c/abcdef1234567890abcdef12?x=1", { mode: "default" }), "https://chatgpt.com/c/<conversation-id>?x=1");
});

test("redacts absolute home paths", () => {
  assert.equal(redactValue("saved at /home/alice/project/data/file.docx", { mode: "default" }), "saved at <home>/project/data/file.docx");
});

test("redacts cookie-shaped values", () => {
  assert.equal(redactValue("a=1; b=two; c=three", { mode: "default" }), "<redacted>");
});

test("redacts csrf/session/bearer keys", () => {
  assert.deepEqual(redactValue({ csrfHeader: "abc", Authorization: "Bearer token" }, { mode: "default" }), { csrfHeader: "<redacted>", Authorization: "<redacted>" });
});

test("redacts nested objects and arrays", () => {
  const value = { items: [{ profile: "claude", url: "https://chatgpt.com/c/abcdef1234567890abcdef12" }] };
  assert.deepEqual(redactValue(value, { mode: "default" }), { items: [{ profile: "<profile>", url: "https://chatgpt.com/c/<conversation-id>" }] });
});

test("mode off returns the original input object", () => {
  const value = { profile: "chatgpt" };
  assert.equal(redactValue(value, { mode: "off" }), value);
});

test("extraKeyRegex applies", () => {
  assert.deepEqual(redactValue({ apiKey: "abc", normal: "abc" }, { mode: "default", extraKeyRegex: [/apiKey/i] }), { apiKey: "<redacted>", normal: "abc" });
});
