# Texture Lab v0.1-lite

A standalone local texture generator for composing prebuilt Field and Band layers, editing their
transform/color/opacity/blend values, previewing the result live, and downloading matching SVG and
self-contained CSS files.

## Requirements

- Node.js 24
- npm 11
- Chromium installed through Playwright (`npm run playwright:install` when needed)

## Run Locally

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The app does not require an account, remote API, or network
service after its dependencies are installed.

## Verify

```powershell
npm run lint
npm run format:check
npm run check
```

`npm run check` runs strict TypeScript, 35 focused unit tests, the production build, and one
Chromium end-to-end authoring/export journey.

## Scope

See [IMPLEMENTATION_SPEC.md](./IMPLEMENTATION_SPEC.md) for the five completed milestones and the
explicit v0.1-lite exclusions.
