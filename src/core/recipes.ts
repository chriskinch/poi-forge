import camp from "../../recipes/camp.json";
import entrance from "../../recipes/entrance.json";
import grove from "../../recipes/grove.json";
import ruin from "../../recipes/ruin.json";
import shrine from "../../recipes/shrine.json";
import type { Recipe } from "./generator";

export const RECIPES = [entrance, shrine, camp, ruin, grove] as unknown as Recipe[];

export const recipeById = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);
