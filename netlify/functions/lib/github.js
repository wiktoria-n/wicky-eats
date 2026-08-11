'use strict';

const { Octokit } = require('@octokit/rest');

function getClient() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return new Octokit({ auth: token });
}

// This function only ever commits to this one repo/branch, so these are
// fixed rather than configurable — no reason to make deploy setup depend
// on getting non-secret config right too.
function getRepoConfig() {
  return { owner: 'wiktoria-n', repo: 'wicky-eats', branch: 'main' };
}

/**
 * Fetches a text file's current content and sha from the repo.
 * `client` is injectable so tests can pass a fake Octokit instance.
 */
async function getFile(path, client = getClient()) {
  const { owner, repo, branch } = getRepoConfig();
  const { data } = await client.repos.getContent({ owner, repo, path, ref: branch });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`${path} is not a file`);
  }
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha
  };
}

class CommitConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommitConflictError';
    this.conflict = true;
  }
}

/**
 * Commits one or more file changes to the target branch as a single commit,
 * using the Git Data API (blob -> tree -> commit -> ref update) so the
 * change is atomic.
 *
 * On a non-fast-forward conflict (someone else committed in the meantime)
 * this throws a CommitConflictError rather than retrying itself: `files`
 * was built from content read before the conflict, so blindly recommitting
 * it would silently overwrite whatever the other commit just wrote. The
 * caller is the one who knows how to re-fetch and regenerate that content,
 * so it owns the retry.
 *
 * @param {{path: string, content: string, encoding?: 'utf-8'|'base64'}[]} files
 * @param {string} message
 * @param {{client?: import('@octokit/rest').Octokit}} [opts]
 */
async function commitFiles(files, message, opts = {}) {
  const { client = getClient() } = opts;
  const { owner, repo, branch } = getRepoConfig();

  const ref = await client.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const baseCommitSha = ref.data.object.sha;

  const baseCommit = await client.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
  const baseTreeSha = baseCommit.data.tree.sha;

  const treeEntries = await Promise.all(
    files.map(async (file) => {
      const blob = await client.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: file.encoding || 'utf-8'
      });
      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha
      };
    })
  );

  const newTree = await client.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries
  });

  const newCommit = await client.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.data.sha,
    parents: [baseCommitSha]
  });

  try {
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.data.sha
    });
  } catch (err) {
    if (err.status === 422) {
      throw new CommitConflictError('branch moved before the commit could land; caller should re-fetch and retry');
    }
    throw err;
  }

  return {
    commitSha: newCommit.data.sha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.data.sha}`
  };
}

module.exports = { getFile, commitFiles, getRepoConfig, CommitConflictError };
