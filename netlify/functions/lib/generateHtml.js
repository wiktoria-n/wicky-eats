'use strict';

const RECIPES_START = '/* RECIPES_START */';
const RECIPES_END = '/* RECIPES_END */';
const JSONLD_RE = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;

function buildNutrition(macros) {
  return {
    '@type': 'NutritionInformation',
    calories: `${macros.kcal} calories`,
    proteinContent: `${macros.protein}g`,
    carbohydrateContent: `${macros.carbs}g`,
    fatContent: `${macros.fat}g`
  };
}

function buildJsonLdRecipe(recipe) {
  const seo = recipe.seo;
  return {
    '@type': 'Recipe',
    name: recipe.title,
    description: seo.description,
    image: recipe.image,
    keywords: seo.keywords,
    prepTime: seo.prepTime,
    ...(seo.cookTime ? { cookTime: seo.cookTime } : {}),
    totalTime: seo.totalTime,
    recipeYield: seo.recipeYield,
    recipeCategory: seo.recipeCategory,
    recipeCuisine: seo.recipeCuisine,
    suitableForDiet: seo.suitableForDiet,
    nutrition: buildNutrition(recipe.macros),
    recipeIngredient: seo.recipeIngredient
  };
}

function stripSeo(recipe) {
  const { seo, ...rest } = recipe;
  return rest;
}

/**
 * Prevents a literal "</script>" (or "<!--") inside recipe data from
 * closing the surrounding <script> tag early when embedded into HTML.
 */
function escapeForScriptTag(json) {
  return json.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/**
 * Regenerates the recipes[] JS block (between RECIPES_START/END markers)
 * and the Recipe entries inside the JSON-LD @graph array, from `recipes`
 * (the array stored in recipes.json). Everything else in `html` is left
 * untouched.
 */
function generateHtml(html, recipes) {
  if (!html.includes(RECIPES_START) || !html.includes(RECIPES_END)) {
    throw new Error('index.html is missing the RECIPES_START/RECIPES_END markers');
  }

  const appRecipes = recipes.map(stripSeo);
  const appJson = escapeForScriptTag(JSON.stringify(appRecipes, null, 2));
  const appInner = appJson.slice(1, -1).trim();
  const startIdx = html.indexOf(RECIPES_START) + RECIPES_START.length;
  const endIdx = html.indexOf(RECIPES_END);
  if (endIdx < startIdx) {
    throw new Error('RECIPES_END appears before RECIPES_START in index.html');
  }
  const newHtml =
    html.slice(0, startIdx) +
    '\n  ' + appInner + '\n  ' +
    html.slice(endIdx);

  const match = newHtml.match(JSONLD_RE);
  if (!match) {
    throw new Error('index.html is missing the application/ld+json script block');
  }
  const data = JSON.parse(match[2]);
  const nonRecipeEntries = data['@graph'].filter((e) => e['@type'] !== 'Recipe');
  data['@graph'] = [...nonRecipeEntries, ...recipes.map(buildJsonLdRecipe)];
  const newJsonLd = escapeForScriptTag(JSON.stringify(data, null, 2));

  return newHtml.slice(0, match.index) +
    match[1] + '\n' + newJsonLd + '\n' + match[3] +
    newHtml.slice(match.index + match[0].length);
}

module.exports = { generateHtml, buildJsonLdRecipe, buildNutrition, stripSeo };
