import { describe, it, expect, vi } from 'vitest';
import { makeHandler } from '../netlify/functions/recipes.js';
import { CommitConflictError } from '../netlify/functions/lib/github.js';

function validRecipe(overrides = {}) {
  return {
    id: 'new-recipe',
    title: 'New Recipe',
    subtitle: 'A recipe',
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
    image: { filename: 'new-recipe.jpg', data: 'ZmFrZQ==' },
    seo: {
      description: 'A recipe. 200 kcal, 20g protein.',
      keywords: 'recipe',
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

function makeDeps(overrides = {}) {
  return {
    isAuthenticated: () => true,
    validateRecipe: (payload, existing) => {
      if (existing.some((r) => r.id === payload.id)) {
        return { success: false, errors: [`id: "${payload.id}" already exists`] };
      }
      return { success: true, data: payload };
    },
    generateHtml: (html) => html + '<!-- regenerated -->',
    getFile: vi.fn(),
    commitFiles: vi.fn(),
    CommitConflictError,
    ...overrides
  };
}

describe('recipes handler', () => {
  it('rejects non-POST methods', async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler({ httpMethod: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests', async () => {
    const handler = makeHandler(makeDeps({ isAuthenticated: () => false }));
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(validRecipe()) });
    expect(res.statusCode).toBe(401);
  });

  it('commits successfully on the first attempt', async () => {
    const getFile = vi.fn().mockResolvedValue({ content: '[]', sha: 'sha' });
    const commitFiles = vi.fn().mockResolvedValue({ commitSha: 'sha1', commitUrl: 'https://example.com/sha1' });
    const handler = makeHandler(makeDeps({ getFile, commitFiles }));

    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(validRecipe()) });

    expect(res.statusCode).toBe(201);
    expect(commitFiles).toHaveBeenCalledTimes(1);
    expect(getFile).toHaveBeenCalledTimes(2); // recipes.json + index.html, once
  });

  it('on a conflict, re-fetches fresh state and retries once with regenerated content', async () => {
    let call = 0;
    const getFile = vi.fn().mockImplementation(async (path) => {
      call++;
      // First attempt sees one existing recipe; after the "conflict", a
      // second recipe has landed concurrently.
      if (path === 'recipes.json') {
        const recipes = call <= 2 ? [{ id: 'existing-1' }] : [{ id: 'existing-1' }, { id: 'existing-2' }];
        return { content: JSON.stringify(recipes), sha: 'sha' };
      }
      return { content: '<html></html>', sha: 'sha' };
    });
    const commitFiles = vi
      .fn()
      .mockRejectedValueOnce(new CommitConflictError('conflict'))
      .mockResolvedValueOnce({ commitSha: 'sha2', commitUrl: 'https://example.com/sha2' });

    const handler = makeHandler(makeDeps({ getFile, commitFiles }));
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(validRecipe()) });

    expect(res.statusCode).toBe(201);
    expect(commitFiles).toHaveBeenCalledTimes(2);
    // The retry's recipes.json commit content must be based on the freshly
    // re-fetched existing recipes (existing-1 + existing-2), not the stale
    // first-attempt snapshot (existing-1 only) — otherwise existing-2 would
    // be silently dropped.
    const secondCommitFiles = commitFiles.mock.calls[1][0];
    const recipesJsonFile = secondCommitFiles.find((f) => f.path === 'recipes.json');
    const committedRecipes = JSON.parse(recipesJsonFile.content);
    expect(committedRecipes.map((r) => r.id)).toEqual(['existing-1', 'existing-2', 'new-recipe']);
  });

  it('returns 409 if the conflict persists after the retry', async () => {
    const getFile = vi.fn().mockResolvedValue({ content: '[]', sha: 'sha' });
    const commitFiles = vi.fn().mockRejectedValue(new CommitConflictError('still conflicting'));
    const handler = makeHandler(makeDeps({ getFile, commitFiles }));

    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(validRecipe()) });

    expect(res.statusCode).toBe(409);
    expect(commitFiles).toHaveBeenCalledTimes(2);
  });

  it('does not commit on dryRun, even across a retry-eligible path', async () => {
    const getFile = vi.fn().mockResolvedValue({ content: '[]', sha: 'sha' });
    const commitFiles = vi.fn();
    const handler = makeHandler(makeDeps({ getFile, commitFiles }));

    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(validRecipe({ dryRun: true })) });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).dryRun).toBe(true);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
