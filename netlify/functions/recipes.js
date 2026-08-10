'use strict';

const { isAuthenticated } = require('./lib/auth');
const { validateRecipe } = require('./lib/validateRecipe');
const { generateHtml } = require('./lib/generateHtml');
const { getFile, commitFiles } = require('./lib/github');

exports.handler = async (event) => {
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

  return {
    statusCode: 201,
    body: JSON.stringify({ id: recipe.id, commitSha, commitUrl })
  };
};
