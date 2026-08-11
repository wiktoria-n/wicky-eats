import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFile, commitFiles, CommitConflictError } from '../netlify/functions/lib/github.js';

function makeFakeClient() {
  return {
    repos: { getContent: vi.fn() },
    git: {
      getRef: vi.fn(),
      getCommit: vi.fn(),
      createBlob: vi.fn(),
      createTree: vi.fn(),
      createCommit: vi.fn(),
      updateRef: vi.fn()
    }
  };
}

describe('github helper', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_REPO = 'wiktoria-n/wicky-eats';
    process.env.GITHUB_BRANCH = 'main';
  });

  it('getFile decodes base64 content and returns the sha', async () => {
    const client = makeFakeClient();
    client.repos.getContent.mockResolvedValue({
      data: { type: 'file', content: Buffer.from('hello world').toString('base64'), sha: 'abc123' }
    });
    const result = await getFile('recipes.json', client);
    expect(result).toEqual({ content: 'hello world', sha: 'abc123' });
  });

  it('commitFiles builds a single atomic commit from blobs -> tree -> commit -> ref update', async () => {
    const client = makeFakeClient();
    client.git.getRef.mockResolvedValue({ data: { object: { sha: 'base-commit-sha' } } });
    client.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } });
    client.git.createBlob
      .mockResolvedValueOnce({ data: { sha: 'blob-sha-1' } })
      .mockResolvedValueOnce({ data: { sha: 'blob-sha-2' } });
    client.git.createTree.mockResolvedValue({ data: { sha: 'new-tree-sha' } });
    client.git.createCommit.mockResolvedValue({ data: { sha: 'new-commit-sha' } });
    client.git.updateRef.mockResolvedValue({});

    const result = await commitFiles(
      [
        { path: 'recipes.json', content: '[]' },
        { path: 'index.html', content: '<html></html>' }
      ],
      'Add recipe: Test',
      { client }
    );

    expect(client.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: 'base-tree-sha',
        tree: [
          { path: 'recipes.json', mode: '100644', type: 'blob', sha: 'blob-sha-1' },
          { path: 'index.html', mode: '100644', type: 'blob', sha: 'blob-sha-2' }
        ]
      })
    );
    expect(client.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ tree: 'new-tree-sha', parents: ['base-commit-sha'], message: 'Add recipe: Test' })
    );
    expect(client.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'heads/main', sha: 'new-commit-sha' })
    );
    expect(result).toEqual({
      commitSha: 'new-commit-sha',
      commitUrl: 'https://github.com/wiktoria-n/wicky-eats/commit/new-commit-sha'
    });
  });

  it('throws a CommitConflictError on a non-fast-forward ref conflict, without recommitting stale content', async () => {
    const client = makeFakeClient();
    client.git.getRef.mockResolvedValue({ data: { object: { sha: 'base-commit-sha' } } });
    client.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } });
    client.git.createBlob.mockResolvedValue({ data: { sha: 'blob-sha' } });
    client.git.createTree.mockResolvedValue({ data: { sha: 'tree-sha' } });
    client.git.createCommit.mockResolvedValue({ data: { sha: 'commit-sha' } });
    client.git.updateRef.mockRejectedValue({ status: 422, message: 'Update is not a fast forward' });

    await expect(
      commitFiles([{ path: 'recipes.json', content: '[]' }], 'Add recipe: Test', { client })
    ).rejects.toBeInstanceOf(CommitConflictError);

    // No self-retry: it should have tried updateRef exactly once, never
    // silently recommitting the same (potentially stale) files.
    expect(client.git.updateRef).toHaveBeenCalledTimes(1);
    expect(client.git.getRef).toHaveBeenCalledTimes(1);
  });

  it('surfaces non-conflict errors from updateRef as-is', async () => {
    const client = makeFakeClient();
    client.git.getRef.mockResolvedValue({ data: { object: { sha: 'base-commit-sha' } } });
    client.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } });
    client.git.createBlob.mockResolvedValue({ data: { sha: 'blob-sha' } });
    client.git.createTree.mockResolvedValue({ data: { sha: 'tree-sha' } });
    client.git.createCommit.mockResolvedValue({ data: { sha: 'commit-sha' } });
    client.git.updateRef.mockRejectedValue({ status: 500, message: 'server error' });

    await expect(
      commitFiles([{ path: 'recipes.json', content: '[]' }], 'Add recipe: Test', { client })
    ).rejects.toMatchObject({ status: 500 });
  });
});
