# Contributing to Texture Lab

## Local setup

Use Node.js `24.19.0` and npm `11.17.0`. The repository pins the Node version in `.nvmrc` and
locks dependencies in `package-lock.json`.

```bash
npm ci
npm run playwright:install
npm run dev
```

No secrets or environment variables are needed for local development.

## Branches and commits

- Keep released versions in immutable tags such as `v0.3.0`.
- Create the next implementation branch from the latest accepted release, for example
  `codex/texture-lab-v0.4`.
- Keep commits focused and do not commit `node_modules`, `dist`, caches, browser reports, or local
  runtime downloads.
- Do not rewrite released tags.

## Before opening a pull request

Run the same checks used by CI:

```bash
npm run format:check
npm run lint
npm run check
```

The end-to-end suite uses real Chromium interactions and checks authoring, Boundary editing,
responsive export, persistence, accessibility, and preview/export parity. If a visual snapshot is
intentionally changed, explain the product reason in the pull request.

## Release checklist

1. Confirm the usage guide matches the visible labels and supported limits.
2. Run the full verification commands above.
3. Update the `version` field in `package.json` and `package-lock.json`.
4. Commit the release and create an annotated tag, for example:

   ```bash
   git tag -a v0.4.0 -m "Texture Lab v0.4.0"
   git push origin v0.4.0
   ```

5. Keep the previous release tag available for rollback and comparison.
