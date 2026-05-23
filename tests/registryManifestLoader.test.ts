import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadManifestsFrom } from "../src/registry/manifest/loader";
import { parseManifest } from "../src/registry/manifest/schema";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "ml-")); }

const VALID_DIRECT = `id: test.direct.ok
version: 1.0.0
target: { kind: generic, provider: test }
operation: ok
kind: direct
maturity: stable
safety: { class: read, requiresApproval: false }
descriptionLiteral: |
  Test direct manifest.
inputSchemaRef: ./schemas/x.ts#Input
outputSchemaRef: ./schemas/x.ts#Output
direct:
  handler: ./handlers/x.ts#run
`;

const VALID_RECIPE = `id: test.recipe.ok
version: 1.0.0
target: { kind: webai, provider: test }
operation: run
kind: recipe
maturity: stable
safety: { class: write, requiresApproval: true }
descriptionLiteral: |
  Test recipe manifest.
inputSchemaRef: ./schemas/x.ts#Input
outputSchemaRef: ./schemas/x.ts#Output
recipe:
  handler: ./handlers/x.ts#run
`;

const MISSING_REQUIRED = `id: bad.missing
version: 1.0.0
target: { kind: webai, provider: test }
operation: run
kind: recipe
`;

const RECIPE_KIND_NO_RECIPE_BODY = `id: bad.conflict
version: 1.0.0
target: { kind: webai, provider: test }
operation: run
kind: recipe
maturity: stable
safety: { class: write, requiresApproval: true }
descriptionLiteral: |
  Missing recipe block.
inputSchemaRef: ./schemas/x.ts#Input
outputSchemaRef: ./schemas/x.ts#Output
direct:
  handler: ./handlers/x.ts#run
`;

test("parseManifest accepts a valid direct manifest", () => {
  const result = parseManifest(VALID_DIRECT);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.manifest?.id, "test.direct.ok");
  assert.equal(result.manifest?.kind, "direct");
});

test("parseManifest accepts a valid recipe manifest", () => {
  const result = parseManifest(VALID_RECIPE);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.manifest?.id, "test.recipe.ok");
  assert.equal(result.manifest?.kind, "recipe");
});

test("parseManifest REJECTS manifest with missing required fields", () => {
  const result = parseManifest(MISSING_REQUIRED);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 1, "must report at least one error");
});

test("parseManifest REJECTS recipe-kind manifest with missing recipe block", () => {
  const result = parseManifest(RECIPE_KIND_NO_RECIPE_BODY);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /recipe is required/i.test(e)), `expected 'recipe is required' issue, got ${result.errors.join("; ")}`);
});

test("loadManifestsFrom walks a directory and loads valid manifests", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "a.yaml"), VALID_DIRECT);
  fs.writeFileSync(path.join(dir, "b.yaml"), VALID_RECIPE);
  fs.writeFileSync(path.join(dir, "skipped.yaml"), "# not a capability manifest\nhello: world\n");
  const result = loadManifestsFrom(dir);
  assert.equal(result.manifests.length, 2, "should load 2 valid manifests, skip the unrelated one");
  assert.equal(result.errors.length, 0);
});

test("loadManifestsFrom reports parse errors without crashing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "broken.yaml"), MISSING_REQUIRED);
  // Inject the manifest-shape sniff fields so the loader actually tries to parse it
  fs.writeFileSync(path.join(dir, "broken.yaml"),
    `${MISSING_REQUIRED}descriptionLiteral: x\n`);
  const result = loadManifestsFrom(dir);
  assert.ok(result.errors.length >= 1, "should report at least one error");
});

test("loadManifestsFrom is byte-safe for nested subdirectories", () => {
  const dir = tempDir();
  const nested = path.join(dir, "x", "y", "z");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, "deep.yaml"), VALID_DIRECT);
  const result = loadManifestsFrom(dir);
  assert.equal(result.manifests.length, 1);
  assert.equal(result.manifests[0].id, "test.direct.ok");
});
