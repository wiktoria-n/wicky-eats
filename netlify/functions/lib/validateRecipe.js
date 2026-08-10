'use strict';

const { z } = require('zod');

const ingredientItem = z.object({
  amount: z.number(),
  unit: z.string().nullable().optional().default(null),
  name: z.string().min(1)
});

const ingredientSection = z.object({
  label: z.string().min(1),
  items: z.array(ingredientItem).min(1)
});

const badge = z.object({
  icon: z.string().min(1),
  label: z.string().min(1)
});

const macros = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative()
});

const seo = z.object({
  description: z.string().min(1),
  keywords: z.string().min(1),
  prepTime: z.string().regex(/^PT\d+M$/, 'must look like PT10M'),
  cookTime: z.string().regex(/^PT\d+M$/).nullable().optional().default(null),
  totalTime: z.string().regex(/^PT\d+M$/),
  recipeYield: z.string().min(1).default('1 serving'),
  recipeCategory: z.enum(['Dessert', 'Main Course']),
  recipeCuisine: z.string().min(1),
  suitableForDiet: z.array(z.string().url()).min(1),
  recipeIngredient: z.array(z.string().min(1)).min(1)
});

const image = z.object({
  filename: z.string().regex(/^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i, 'lowercase, hyphenated filename with an image extension'),
  data: z.string().min(1, 'base64-encoded image data is required')
});

const recipeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, and hyphens only'),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    type: z.enum(['dessert', 'savoury']),
    category: z.enum(['cold', 'pastry', 'mains']).optional(),
    emoji: z.string().min(1),
    swatchA: z.string().regex(/^#[0-9a-f]{6}$/i),
    swatchB: z.string().regex(/^#[0-9a-f]{6}$/i),
    badge,
    attributes: z.array(badge).optional(),
    time: z.string().min(1),
    baseServings: z.number().int().positive().default(1),
    macros,
    ingredients: z.array(ingredientItem).min(1).optional(),
    ingredientSections: z.array(ingredientSection).min(1).optional(),
    steps: z.array(z.string().min(1)).min(1),
    notes: z.string().optional(),
    image,
    seo
  })
  .refine((r) => !!r.ingredients !== !!r.ingredientSections, {
    message: 'provide exactly one of ingredients or ingredientSections',
    path: ['ingredients']
  })
  .refine((r) => r.type !== 'dessert' || !!r.category, {
    message: 'category is required when type is "dessert"',
    path: ['category']
  });

/**
 * Validates a recipe payload and checks its id against existing recipes.
 * Returns { success: true, data } or { success: false, errors: string[] }.
 */
function validateRecipe(payload, existingRecipes) {
  const result = recipeSchema.safeParse(payload);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    };
  }
  const data = result.data;
  if (existingRecipes.some((r) => r.id === data.id)) {
    return { success: false, errors: [`id: "${data.id}" already exists`] };
  }
  return { success: true, data };
}

module.exports = { validateRecipe, recipeSchema };
