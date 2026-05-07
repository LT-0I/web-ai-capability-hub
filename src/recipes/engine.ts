import { BrowserAction } from "../shared/types";
import { readPageSnapshot } from "../reader/snapshot";
import { ActionExecutor } from "../actions/executor";
import { Recipe, RecipeRunResult, RecipeStep } from "./types";
import { captureSiteMapForSnapshot } from "../maintenance/captureSiteMap";

export interface RecipeEngineContext {
  executor: ActionExecutor;
  getActivePage(): any | undefined;
}

export class RecipeEngine {
  constructor(private context: RecipeEngineContext) {}

  async run(recipe: Recipe, variables: Record<string, string> = {}): Promise<RecipeRunResult> {
    const startedAt = new Date().toISOString();
    const results: RecipeRunResult["results"] = [];
    for (const step of recipe.steps) {
      const rendered = this.renderStep(step, variables);
      try {
        if (rendered.action === "read") {
          const page = this.context.getActivePage();
          if (!page) throw new Error("No active page to read");
          const snapshot = await readPageSnapshot(page, { includeAccessibility: true });
          results.push({ stepId: step.id, action: rendered.action, ok: true, message: "Read page snapshot", data: snapshot });
        } else if (rendered.action === "screenshot") {
          const page = this.context.getActivePage();
          if (!page) throw new Error("No active page to screenshot");
          const snapshot = await readPageSnapshot(page, { screenshot: true });
          results.push({ stepId: step.id, action: rendered.action, ok: true, message: "Captured screenshot", data: snapshot.screenshotPath });
        } else if (rendered.action === "capture_site_map") {
          const page = this.context.getActivePage();
          if (!page) throw new Error("No active page to capture");
          const snapshot = await readPageSnapshot(page, { includeAccessibility: true });
          const siteMap = captureSiteMapForSnapshot(rendered.site || recipe.adapter || recipe.id, snapshot);
          results.push({ stepId: step.id, action: rendered.action, ok: true, message: "Captured site map", data: siteMap });
        } else if (rendered.action === "note") {
          results.push({ stepId: step.id, action: rendered.action, ok: true, message: rendered.message || "Recipe note" });
        } else {
          const result = await this.context.executor.execute(this.toBrowserAction(rendered));
          results.push({ stepId: step.id, action: rendered.action, ok: result.ok, message: result.message, data: result.data });
        }
      } catch (error) {
        results.push({ stepId: step.id, action: rendered.action, ok: false, message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    return { recipeId: recipe.id, startedAt, finishedAt: new Date().toISOString(), results };
  }

  private toBrowserAction(step: RecipeStep): BrowserAction {
    return { ...step, type: step.action as BrowserAction["type"] } as BrowserAction;
  }

  private renderStep(step: RecipeStep, variables: Record<string, string>): RecipeStep {
    const render = (value: unknown): unknown => {
      if (typeof value === "string") {
        return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)(?:\|([^}]+))?\s*\}\}/g, (_match, key, fallback) => {
          const raw = variables[key];
          return raw !== undefined && raw !== "" ? raw : (fallback || "").trim();
        });
      }
      if (Array.isArray(value)) return value.map(render);
      if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value)) out[key] = render(child);
        return out;
      }
      return value;
    };
    return render(step) as RecipeStep;
  }
}
