import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateHtml } from '../netlify/functions/lib/generateHtml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8'));

function extractAppRecipes(generated) {
  const start = generated.indexOf('/* RECIPES_START */') + '/* RECIPES_START */'.length;
  const end = generated.indexOf('/* RECIPES_END */');
  const arrayInner = generated.slice(start, end);
  return new Function('return [' + arrayInner + ']')();
}

function extractJsonLd(generated) {
  const match = generated.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(match[1]);
}

describe('generateHtml', () => {
  it('round-trips the existing recipes without changing their data', () => {
    const generated = generateHtml(html, recipes);
    const appRecipes = extractAppRecipes(generated);
    const stripped = recipes.map(({ seo, ...rest }) => rest);
    expect(appRecipes).toEqual(stripped);
  });

  it('produces one JSON-LD Recipe entry per recipe, plus the non-Recipe entries untouched', () => {
    const generated = generateHtml(html, recipes);
    const data = extractJsonLd(generated);
    const recipeEntries = data['@graph'].filter((e) => e['@type'] === 'Recipe');
    const otherEntries = data['@graph'].filter((e) => e['@type'] !== 'Recipe');
    expect(recipeEntries).toHaveLength(recipes.length);
    expect(otherEntries).toEqual([{ '@type': 'WebSite', name: 'Wicky Eats', description: expect.any(String), inLanguage: 'en-GB' }]);
  });

  it('derives nutrition JSON-LD from macros', () => {
    const generated = generateHtml(html, recipes);
    const data = extractJsonLd(generated);
    const cinnamonRolls = data['@graph'].find((e) => e.name === 'High Protein Cinnamon Rolls');
    expect(cinnamonRolls.nutrition).toEqual({
      '@type': 'NutritionInformation',
      calories: '308 calories',
      proteinContent: '20g',
      carbohydrateContent: '39g',
      fatContent: '7g'
    });
  });

  it('omits cookTime from JSON-LD when the recipe has none', () => {
    const generated = generateHtml(html, recipes);
    const data = extractJsonLd(generated);
    const tiramisu = data['@graph'].find((e) => e.name === 'Lemon Tiramisu');
    expect(tiramisu.cookTime).toBeUndefined();
  });

  it('appends a new recipe to both blocks without disturbing existing ones', () => {
    const newRecipe = {
      id: 'test-treat',
      image: 'test-treat.jpg',
      type: 'dessert',
      title: 'Test Treat',
      subtitle: 'A test recipe',
      emoji: '🍮',
      swatchA: '#DCEA7B',
      swatchB: '#F5C99A',
      category: 'cold',
      badge: { icon: '🌙', label: 'No-Bake' },
      time: '5 mins',
      baseServings: 1,
      macros: { kcal: 200, protein: 20, carbs: 15, fat: 5 },
      ingredients: [{ amount: 100, unit: 'g', name: 'thing' }],
      steps: ['Do the thing.'],
      seo: {
        description: 'A test recipe. 200 kcal, 20g protein.',
        keywords: 'test',
        prepTime: 'PT5M',
        totalTime: 'PT5M',
        recipeYield: '1 serving',
        recipeCategory: 'Dessert',
        recipeCuisine: 'Healthy No-Bake',
        suitableForDiet: ['https://schema.org/HighProteinDiet'],
        recipeIngredient: ['100g thing']
      }
    };
    const updated = [...recipes, newRecipe];
    const generated = generateHtml(html, updated);

    const appRecipes = extractAppRecipes(generated);
    expect(appRecipes).toHaveLength(recipes.length + 1);
    expect(appRecipes[appRecipes.length - 1].id).toBe('test-treat');

    const data = extractJsonLd(generated);
    const recipeEntries = data['@graph'].filter((e) => e['@type'] === 'Recipe');
    expect(recipeEntries).toHaveLength(recipes.length + 1);
    expect(recipeEntries[recipeEntries.length - 1].name).toBe('Test Treat');
  });

  it('throws if the RECIPES markers are missing', () => {
    const broken = html.replace('/* RECIPES_START */', '').replace('/* RECIPES_END */', '');
    expect(() => generateHtml(broken, recipes)).toThrow(/markers/);
  });

  it('escapes </script> inside recipe data so it cannot break out of the surrounding <script> tag', () => {
    const evil = {
      ...JSON.parse(JSON.stringify(recipes[0])),
      id: 'evil-recipe',
      title: 'Evil</script><script>alert(1)</script>',
      seo: { ...recipes[0].seo, description: 'Safe.' }
    };
    const generated = generateHtml(html, [...recipes, evil]);

    // The raw HTML source must never contain an unescaped closing tag
    // sitting inside recipe data.
    expect(generated).not.toMatch(/Evil<\/script>/);
    expect(generated).toContain('Evil<\\/script><script>alert(1)<\\/script>');

    // Round-tripping through the app's JS array and the JSON-LD parser
    // must still recover the original, unescaped string value.
    const appRecipes = extractAppRecipes(generated);
    const evilAppRecipe = appRecipes.find((r) => r.id === 'evil-recipe');
    expect(evilAppRecipe.title).toBe('Evil</script><script>alert(1)</script>');

    const data = extractJsonLd(generated);
    const evilJsonLd = data['@graph'].find((e) => e.name && e.name.startsWith('Evil'));
    expect(evilJsonLd.name).toBe('Evil</script><script>alert(1)</script>');
  });
});
