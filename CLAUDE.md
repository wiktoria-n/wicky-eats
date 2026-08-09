# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wicky Eats is a single-file static web app — a mobile recipe book UI. The entire application lives in `index.html` with no build tools, package manager, or external dependencies beyond Google Fonts.

## Running the App

Open `index.html` directly in a browser. No server or build step required.

## Architecture

Everything is in `index.html`:

- **CSS** (lines 9–356): Custom properties define the color palette (`--ink`, `--cream`, `--lime`, `--lavender`, `--peach`, `--berry`, `--sage`). The app renders as a 430px-wide phone frame centered on desktop; on mobile (<460px) it fills the viewport.
- **HTML** (lines 358–387): Static shell with two key containers — `#mainScreen` (list view) and `#detailScreen` (recipe detail overlay). The bottom nav is always visible.
- **JavaScript** (lines 389–738): No frameworks. All state is in plain variables. Key pieces:
  - `recipes[]` — the data array. Each recipe has `type` (`"dessert"` or `"savoury"`), `category` (`"cold"` or `"pastry"`), macros, and either `ingredients[]` (flat) or `ingredientSections[]` (grouped).
  - `renderList()` / `renderCategories()` — rebuild the main screen DOM from the filtered recipe list. Savoury recipes are always shown in a separate subtle section below, never filtered by category.
  - `openDetail(id)` / `renderDetail(r)` — show the detail overlay by injecting HTML into `#detailScreen`.
  - `adjustServings(id, delta)` — scales ingredient amounts proportionally via `scaleAmount()` and re-renders the detail view.
  - `toggleLike(id)` — toggled in-memory only (not persisted).
  - `closeDetail`, `toggleLike`, `adjustServings` are exposed on `window` because detail HTML is injected as strings with inline `onclick` handlers.

## Adding Recipes

Add an object to the `recipes` array. Use `type: "dessert"` and set `category` to `"cold"` or `"pastry"` for the category filter to work. Use `type: "savoury"` to appear in the savoury section only. Images go in the repo root and are referenced by filename in the `image` field. Use `ingredientSections` (array of `{ label, items }`) instead of `ingredients` when grouping is needed.

## SEO Checklist for Every New Recipe

Every recipe needs two things to be SEO-friendly:

### 1. Image (critical — required for Google rich results)
- Add a real food photo to the repo root (e.g. `my-recipe.jpg`)
- Reference it in the recipe object: `image: "my-recipe.jpg"`
- Without an image, Google marks the recipe as **ineligible** for rich results — it will not appear as a recipe card in search

### 2. JSON-LD structured data (in the `<head>`)
Add a new `Recipe` object inside the `@graph` array in the `<script type="application/ld+json">` block. Required fields:

```json
{
  "@type": "Recipe",
  "name": "Recipe Name",
  "description": "One sentence — include kcal and protein count. Keep it search-friendly.",
  "image": "filename.jpg",
  "keywords": "comma-separated search terms — include ingredient-specific terms (e.g. 'cottage cheese pizza'), health goal terms ('fat loss', 'high protein'), and audience terms ('busy women', 'women over 30')",
  "prepTime": "PT10M",
  "cookTime": "PT20M",
  "totalTime": "PT30M",
  "recipeYield": "1 serving",
  "recipeCategory": "Dessert or Main Course",
  "recipeCuisine": "Healthy Baking / Healthy No-Bake / Healthy",
  "suitableForDiet": ["https://schema.org/LowCalorieDiet", "https://schema.org/HighProteinDiet"],
  "nutrition": {
    "@type": "NutritionInformation",
    "calories": "X calories",
    "proteinContent": "Xg",
    "carbohydrateContent": "Xg",
    "fatContent": "Xg"
  },
  "recipeIngredient": ["list", "of", "ingredients"]
}
```

> Always use `https://schema.org/` (not `http://`) for `suitableForDiet` values.

### Validate after adding
Test at `search.google.com/test/rich-results` with the live URL. All recipes should show `check_circle` with no critical issues.
