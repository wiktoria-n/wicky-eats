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
