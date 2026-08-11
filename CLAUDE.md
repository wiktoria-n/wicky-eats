# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wicky Eats is a mobile recipe book UI. The front end is still a single static `index.html` (no build tools, no frameworks, no dependencies beyond Google Fonts), but recipe data now has a source of truth (`recipes.json`) and there's a small Netlify Functions API + password-protected admin form for adding recipes without hand-editing HTML.

## Running the App

Open `index.html` directly in a browser — still no server or build step required for viewing the site.

To work on the API/admin form locally: `npm install`, then `npm test` to run the unit tests, or `netlify dev` (Netlify CLI) to run the site and functions together.

## Architecture

### Front end (`index.html`)
- **CSS** (lines 9–356): Custom properties define the color palette (`--ink`, `--cream`, `--lime`, `--lavender`, `--peach`, `--berry`, `--sage`). The app renders as a 430px-wide phone frame centered on desktop; on mobile (<460px) it fills the viewport.
- **HTML**: Static shell with two key containers — `#mainScreen` (list view) and `#detailScreen` (recipe detail overlay). The bottom nav is always visible.
- **JavaScript**: No frameworks. All state is in plain variables. Key pieces:
  - `recipes[]` — a JS array between the `/* RECIPES_START */` / `/* RECIPES_END */` markers. **This block is generated — don't hand-edit it or the JSON-LD `@graph` array; edit `recipes.json` instead and regenerate (see below).** Each recipe has `type` (`"dessert"` or `"savoury"`), `category` (`"cold"` or `"pastry"`), macros, and either `ingredients[]` (flat) or `ingredientSections[]` (grouped).
  - `renderList()` / `renderCategories()` — rebuild the main screen DOM from the filtered recipe list. Savoury recipes are always shown in a separate subtle section below, never filtered by category.
  - `openDetail(id)` / `renderDetail(r)` — show the detail overlay by injecting HTML into `#detailScreen`.
  - `adjustServings(id, delta)` — scales ingredient amounts proportionally via `scaleAmount()` and re-renders the detail view.
  - `toggleLike(id)` — toggled in-memory only (not persisted).
  - `closeDetail`, `toggleLike`, `adjustServings` are exposed on `window` because detail HTML is injected as strings with inline `onclick` handlers.

### Recipe data (`recipes.json`)
The source of truth for every recipe — both the display fields used by the app and the `seo` fields (description, keywords, prep/cook/total time, diet types, search-friendly ingredient list) used for JSON-LD structured data. `index.html`'s `recipes[]` block and its JSON-LD `Recipe` entries are both *generated* from this file — see `netlify/functions/lib/generateHtml.js`. The JSON-LD `nutrition` block is derived automatically from each recipe's `macros`, so it isn't stored separately.

### Adding recipes API (`netlify/functions/`)
- `recipes.js` — `POST /api/recipes` (behind the admin session cookie). Validates the payload (`lib/validateRecipe.js`), appends it to `recipes.json`, regenerates `index.html`, writes the recipe image, and commits all three files to `main` in one atomic commit via the GitHub API (`lib/github.js`). Supports `dryRun: true` to validate without committing.
- `login.js` / `logout.js` / `session.js` — password login (`ADMIN_PASSWORD` env var) that issues a signed session cookie (`SESSION_SECRET` env var); `session.js` lets the admin page check whether it's logged in.
- `lib/generateHtml.js` — regenerates the `recipes[]` block (marker-based text replacement — this is real JS, not JSON) and the JSON-LD `@graph` Recipe entries (plain `JSON.parse`/`stringify`, since that block is valid JSON) from a `recipes.json`-shaped array. Pure function, no I/O — this is what the tests in `tests/generateHtml.test.js` exercise directly.
- `lib/github.js` — thin GitHub API wrapper (read a file + its sha, commit multiple files atomically via the Git Data API, retry once on a non-fast-forward conflict). Accepts an injectable `client` for testing.

### Admin form (`admin/`)
`admin/login.html` (password form) and `admin/index.html` (the "add a recipe" form) — a normal password-protected web UI, not an API you script against. See `README.md` for the required Netlify environment variables.

## Adding Recipes

**Preferred**: log in at `/admin` and use the form — it handles the image, `recipes.json`, and `index.html`/JSON-LD regeneration for you.

**Manual fallback**: add an object to `recipes.json` (matching the shape of existing entries, including its `seo` sub-object), add the image to the repo root, then regenerate `index.html` by running the generator against it (`generateHtml(fs.readFileSync('index.html', 'utf8'), recipesArray)`) rather than hand-editing the `recipes[]`/JSON-LD blocks directly — hand edits will just get overwritten the next time the API commits.

Use `type: "dessert"` and set `category` to `"cold"` or `"pastry"` for the category filter to work. Use `type: "savoury"` to appear in the savoury section only. Use `ingredientSections` (array of `{ label, items }`) instead of `ingredients` when grouping is needed.

## SEO

Every recipe's `seo` object in `recipes.json` needs: `description` (one sentence, include kcal + protein), `keywords`, `prepTime`/`cookTime`/`totalTime` (ISO 8601 durations like `PT10M`), `recipeYield`, `recipeCategory` (`Dessert` or `Main Course`), `recipeCuisine`, `suitableForDiet` (array of `https://schema.org/...` diet URLs), and `recipeIngredient` (search-friendly ingredient strings). The API/generator turns this into valid JSON-LD automatically — you no longer hand-write the `Recipe` block in the `<head>`.

### Validate after adding
Test at `search.google.com/test/rich-results` with the live URL. All recipes should show `check_circle` with no critical issues.
