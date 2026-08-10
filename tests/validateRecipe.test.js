import { describe, it, expect } from 'vitest';
import { validateRecipe } from '../netlify/functions/lib/validateRecipe.js';

const existingRecipes = [{ id: 'existing-recipe' }];

function baseRecipe(overrides = {}) {
  return {
    id: 'test-recipe',
    title: 'Test Recipe',
    subtitle: 'A test',
    type: 'dessert',
    category: 'cold',
    emoji: '🍰',
    swatchA: '#DCEA7B',
    swatchB: '#F5C99A',
    badge: { icon: '🌙', label: 'No-Bake' },
    time: '5 mins',
    baseServings: 1,
    macros: { kcal: 200, protein: 20, carbs: 20, fat: 5 },
    ingredients: [{ amount: 100, unit: 'g', name: 'thing' }],
    steps: ['Do the thing.'],
    image: { filename: 'test-recipe.jpg', data: 'ZmFrZQ==' },
    seo: {
      description: 'A test recipe. 200 kcal, 20g protein.',
      keywords: 'test recipe, high protein',
      prepTime: 'PT5M',
      totalTime: 'PT5M',
      recipeYield: '1 serving',
      recipeCategory: 'Dessert',
      recipeCuisine: 'Healthy No-Bake',
      suitableForDiet: ['https://schema.org/HighProteinDiet'],
      recipeIngredient: ['100g thing']
    },
    ...overrides
  };
}

describe('validateRecipe', () => {
  it('accepts a well-formed recipe', () => {
    const result = validateRecipe(baseRecipe(), existingRecipes);
    expect(result.success).toBe(true);
  });

  it('rejects a duplicate id', () => {
    const result = validateRecipe(baseRecipe({ id: 'existing-recipe' }), existingRecipes);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/already exists/);
  });

  it('requires category when type is dessert', () => {
    const result = validateRecipe(baseRecipe({ category: undefined }), existingRecipes);
    expect(result.success).toBe(false);
    expect(result.errors.join()).toMatch(/category is required/);
  });

  it('allows a savoury recipe without a category', () => {
    const result = validateRecipe(baseRecipe({ type: 'savoury', category: undefined }), existingRecipes);
    expect(result.success).toBe(true);
  });

  it('rejects providing both ingredients and ingredientSections', () => {
    const result = validateRecipe(
      baseRecipe({ ingredientSections: [{ label: 'Main', items: [{ amount: 1, unit: null, name: 'egg' }] }] }),
      existingRecipes
    );
    expect(result.success).toBe(false);
    expect(result.errors.join()).toMatch(/exactly one/);
  });

  it('rejects an invalid swatch color', () => {
    const result = validateRecipe(baseRecipe({ swatchA: 'not-a-color' }), existingRecipes);
    expect(result.success).toBe(false);
  });

  it('rejects an id with uppercase or spaces', () => {
    const result = validateRecipe(baseRecipe({ id: 'Not A Slug' }), existingRecipes);
    expect(result.success).toBe(false);
  });

  it('rejects a malformed ISO 8601 duration', () => {
    const result = validateRecipe(baseRecipe({ seo: { ...baseRecipe().seo, prepTime: '10 minutes' } }), existingRecipes);
    expect(result.success).toBe(false);
  });

  it('rejects an image filename with uppercase or spaces', () => {
    const result = validateRecipe(baseRecipe({ image: { filename: 'My Recipe.jpg', data: 'ZmFrZQ==' } }), existingRecipes);
    expect(result.success).toBe(false);
  });
});
