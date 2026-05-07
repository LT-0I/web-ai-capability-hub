const fs = require("node:fs");
const path = require("node:path");
import { readConfigFile } from "../utils/yaml";
import { Recipe } from "./types";

export function validateRecipe(recipe: any): Recipe {
  if (!recipe || typeof recipe !== "object") throw new Error("Recipe must be an object");
  if (!recipe.id || typeof recipe.id !== "string") throw new Error("Recipe id is required");
  if (!recipe.name || typeof recipe.name !== "string") throw new Error(`Recipe ${recipe.id} requires a name`);
  if (!Array.isArray(recipe.steps)) throw new Error(`Recipe ${recipe.id} requires steps[]`);
  return recipe as Recipe;
}

export function loadRecipe(filePath: string): Recipe {
  return validateRecipe(readConfigFile(filePath));
}

export function findRecipeFile(recipeId: string, recipeDir = path.resolve(process.cwd(), "configs/recipes")): string {
  const candidates = [
    path.join(recipeDir, `${recipeId}.yaml`),
    path.join(recipeDir, `${recipeId}.yml`),
    path.join(recipeDir, `${recipeId}.json`)
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Recipe not found: ${recipeId} in ${recipeDir}`);
  return found;
}

export function loadRecipeById(recipeId: string, recipeDir?: string): Recipe {
  return loadRecipe(findRecipeFile(recipeId, recipeDir));
}

export function listRecipes(recipeDir = path.resolve(process.cwd(), "configs/recipes")): Recipe[] {
  if (!fs.existsSync(recipeDir)) return [];
  return fs.readdirSync(recipeDir)
    .filter((name: string) => /\.(ya?ml|json)$/i.test(name))
    .map((name: string) => loadRecipe(path.join(recipeDir, name)));
}
