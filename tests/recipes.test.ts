const test = require("node:test");
const assert = require("node:assert/strict");
import { loadRecipeById } from "../src/recipes/loader";
import { RecipeEngine } from "../src/recipes/engine";

test("recipe loader validates JSON-compatible YAML recipe", () => {
  const recipe = loadRecipeById("research.generic-search");
  assert.equal(recipe.id, "research.generic-search");
  assert.ok(recipe.steps.length >= 5);
});

test("recipe engine renders variables and executes action steps", async () => {
  const calls: any[] = [];
  const fakeExecutor = { execute: async (action: any) => { calls.push(action); return { ok: true, action, message: action.type }; } } as any;
  const engine = new RecipeEngine({ executor: fakeExecutor, getActivePage: () => undefined });
  const recipe = {
    id: "simple",
    name: "Simple",
    steps: [
      { action: "open", url: "{{url}}" },
      { action: "type", selector: "#q", text: "{{query}}" }
    ]
  } as any;
  const result = await engine.run(recipe, { url: "https://example.test", query: "robotics" });
  assert.equal(result.results.length, 2);
  assert.equal(calls[0].url, "https://example.test");
  assert.equal(calls[1].text, "robotics");
});
