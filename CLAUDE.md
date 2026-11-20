# Working on Keel

- Push finished changes straight to `main` (the owner asked for this, 2026-11-20). Pages deploys `public/` from `main`.
- Run `npm run check` and `npm run smoke` before pushing.
- `worker/` is not deployed by GitHub: deploy it to Cloudflare separately (see README "Changing the worker").
