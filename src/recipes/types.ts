import { BrowserAction, SemanticTarget } from "../shared/types";

export interface RecipeInput {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface RecipeStep extends Partial<BrowserAction> {
  id?: string;
  action: BrowserAction["type"] | "read" | "screenshot" | "capture_site_map" | "note";
  site?: string;
  message?: string;
  target?: SemanticTarget;
  saveAs?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  adapter?: string;
  inputs?: RecipeInput[];
  steps: RecipeStep[];
  confirmationMode?: "always" | "confirm-risky" | "never";
}

export interface RecipeRunResult {
  recipeId: string;
  startedAt: string;
  finishedAt: string;
  results: Array<{ stepId?: string; action: string; ok: boolean; message: string; data?: unknown }>;
}
