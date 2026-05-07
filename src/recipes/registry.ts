import { listRecipes, loadRecipeById } from "./loader";

export class RecipeRegistry {
  list() { return listRecipes(); }
  get(id: string) { return loadRecipeById(id); }
}
