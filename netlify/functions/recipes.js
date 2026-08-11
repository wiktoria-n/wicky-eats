'use strict';

const authLib = require('./lib/auth');
const validateRecipeLib = require('./lib/validateRecipe');
const generateHtmlLib = require('./lib/generateHtml');
const githubLib = require('./lib/github');

const MAX_ATTEMPTS = 2;

/**
 * Builds the Netlify Function handler. Dependencies are injectable so
 * tests can exercise the retry-on-conflict path without mocking modules.
 */
function makeHandler(deps = {}) {
  const {
    isAuthenticated = authLib.isAuthenticated,
    validateRecipe = validateRecipeLib.validateRecipe,
    generateHtml = generateHtmlLib.generateHtml,
    getFile = githubLib.getFile,
    commitFiles = githubLib.commitFiles,
    CommitConflictError = githubLib.CommitConflictError
  } = deps;

  /**
   * Re-fetches recipes.json + index.html fresh, validates and regenerates
   * against that current state, and commits. Called again from scratch on
   * a CommitConflictError so a concurrent submission is never silently
   * overwritten with stale content.
   */
  async function attemptAddRecipe(payload) {
    const recipesFile = await getFile('recipes.json');
    const existingRecipes = JSON.parse(recipesFile.content);

    const result = validateRecipe(payload, existingRecipes);
    if (!result.success) {
      return { statusCode: 400, body: JSON.stringify({ errors: result.errors }) };
    }
    const recipe = result.data;

    const { image, ...recipeForStorage } = recipe;
    recipeForStorage.image = image.filename;
    const updatedRecipes = [...existingRecipes, recipeForStorage];

    if (payload.dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({ dryRun: true, id: recipe.id, totalRecipes: updatedRecipes.length })
      };
    }

    const indexFile = await getFile('index.html');
    const newIndexHtml = generateHtml(indexFile.content, updatedRecipes);

    const { commitSha, commitUrl } = await commitFiles(
      [
        { path: 'recipes.json', content: JSON.stringify(updatedRecipes, null, 2) + '\n' },
        { path: 'index.html', content: newIndexHtml },
        { path: image.filename, content: image.data, encoding: 'base64' }
      ],
      `Add recipe: ${recipe.title}`
    );

    return { statusCode: 201, body: JSON.stringify({ id: recipe.id, commitSha, commitUrl }) };
  }

  return async function handler(event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!isAuthenticated(event)) {
      return { statusCode: 401, body: JSON.stringify({ error: 'not authenticated' }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON body' }) };
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await attemptAddRecipe(payload);
      } catch (err) {
        if (err instanceof CommitConflictError && attempt < MAX_ATTEMPTS) {
          continue; // re-fetch + re-validate + regenerate against the new state
        }
        if (err instanceof CommitConflictError) {
          return {
            statusCode: 409,
            body: JSON.stringify({ error: 'another change landed at the same time — please retry' })
          };
        }
        throw err;
      }
    }
  };
}

exports.makeHandler = makeHandler;
exports.handler = makeHandler();
