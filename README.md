# Texture Lab

Texture Lab v0.3.1 is a browser-based composition canvas for making soft, multi-colored vector
textures. It stores editable colors, straight-sided Boundaries, material effects, transforms, and
layer order, then renders the same scene responsively as DOM/SVG, standalone SVG, or CSS.

## What is included

- Seven scene starting points with palette remixing.
- Material-first gestures: Glow, Band, Arc, and Orb.
- Common 2D shapes and flat 3D-style silhouettes.
- Point-to-point freeform Boundary drawing with magnetic, Enter, and double-click closure.
- Frontmost layer creation, layer rail selection, Alt/Option-click cycling, and undoable edits.
- Fill color, pinned White quick color, opacity, edge fade, bloom, grain, and six Interaction modes.
- Independent X/Y scaling, 0.5° rotation, center-resize modifiers, pinned obscured-layer editing,
  and responsive staged drag previews.
- Ratio-aware artboards: `1:1`, `2:1`, `1:2`, `4:3`, `16:9`, and `21:9`, with Fit/Cover framing.
- Portable Scene JSON, SVG, and responsive CSS exports. No raster export is used.

Read [USAGE_GUIDE.md](./USAGE_GUIDE.md) for the user-facing workflow and examples. The
authoritative product contract is [IMPLEMENTATION_SPEC_V0.3.md](./IMPLEMENTATION_SPEC_V0.3.md).

## Requirements

- Node.js `24.19.0` (the version in `.nvmrc`).
- npm `11.17.0` (declared by `packageManager` in `package.json`).
- Chromium installed through Playwright for end-to-end checks.

No account, API key, database, or runtime environment variables are required.

## Quick start

```bash
git clone git@github.com:ForkAroundAndFindOut/texture_generator.git
cd texture_generator

# With nvm/fnm/Volta installed, this uses .nvmrc automatically or explicitly:
nvm install 24.19.0
nvm use 24.19.0

npm ci
npm run playwright:install
npm run dev
```

Open the local URL printed by Vite. On Windows, nvm-windows, fnm, Volta, or the official Node.js
installer can provide the pinned Node version.

## Verification

```bash
npm run format:check
npm run lint
npm run check
```

`npm run check` runs both TypeScript projects, the unit suite, a production build, and the complete
Chromium authoring/export journey. The E2E fixture serves the built app on port 4173 by default;
set `TEXTURE_LAB_BASE_URL` to point the browser at another already-running app server. GitHub
Actions runs the same checks on every push and pull request.

## Development workflow

Use a feature branch from the current release line, make small commits, and keep generated files
out of Git. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch, test, and release workflow.

The v0.3.0 release is represented by the `v0.3.0` tag. The current v0.3.1 release line is developed
on `codex/texture-lab-v0.3.1` and released as `v0.3.1`. Future releases should keep this repository
root, create a new branch, update the package version, and add a new Git tag; old versions remain
available through Git history rather than duplicate folders.
