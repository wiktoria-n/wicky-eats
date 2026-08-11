# wicky-eats

## UI Design Inspo

- [Recipe Book Mobile App UI Design](https://dribbble.com/shots/26210817-Recipe-Book-Mobile-App-UI-Design) — Dribbble

## Adding recipes via the admin form

Recipes can be added at `/admin` (password-protected) instead of hand-editing `index.html`. See `CLAUDE.md` for the full architecture.

### Deployment (Netlify)

1. Connect this repo to a Netlify site (no build command needed — `netlify.toml` points at the repo root and `netlify/functions`).
2. Set these environment variables in the Netlify site's settings:

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Password checked by `/api/login` to grant access to `/admin`. |
| `SESSION_SECRET` | Random secret used to sign the login session cookie (JWT). |
| `GITHUB_TOKEN` | Fine-grained GitHub PAT, scoped to this repo only, with **Contents: Read and write** permission. |

(The target repo/branch — `wiktoria-n/wicky-eats` / `main` — are hardcoded in `netlify/functions/lib/github.js` rather than configurable, since this app only ever commits to itself.)

3. Push to the connected branch — Netlify auto-deploys the static site and functions together.

### Local development

```
npm install
npm test        # runs the unit tests
netlify dev      # runs the site + functions locally (requires the Netlify CLI)
```
