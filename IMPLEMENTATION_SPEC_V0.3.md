# Texture Lab v0.3 Implementation Specification

**Status:** Product-approved implementation plan  
**Date:** 2026-08-20  
**Applies to:** texture-lab-v0.1-lite  
**Implementation boundary:** This document defines the approved v0.3 work. Writing it does not
itself authorize feature implementation. The existing v0.2 implementation record remains intact in
IMPLEMENTATION_SPEC.md.

## 1. Product Decision

Texture Lab v0.3 is a composition tool for creating responsive, vector-native visual textures. It
is not primarily a shape dragger and it is not a 3D editor.

The user starts with a beautiful multi-layer composition, uses a small number of visual gestures to
change it, and can still draw a precise closed boundary when needed. The result is represented as
colors, geometry, transforms, materials, and ordered groups that render at any container size. It
is never rasterized as the source of truth.

The visual language has two intentionally separate concerns:

| Concern     | Includes                                                                  | Does not include                     |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Composition | palette, artboard ratio, boundaries, groups, order, position, scale, crop | shader effects or 3D meshes          |
| Material    | feather, bloom, interaction mode, highlight, shadow, grain                | arbitrary filter graphs or animation |

The desired "3D" look is a 2D silhouette plus light, shadow, soft edges, and grain. V0.3 therefore
uses SVG and CSS first. WebGL, liquid distortion, animation, and actual 3D rotation are deferred.

## 2. Approved Product Principles

1. **Start beautiful.** New designs begin from a scene starter, not a barren property panel.
2. **Artboard first.** The artboard is the primary workspace. Controls appear as a compact
   selection tray, with a More drawer for precision rather than a permanent parameter wall.
3. **Add by visual intent.** Glow, Band, Arc, Orb, Boundary, and Grain are the first Add choices.
   Geometric primitives are available, but secondary.
4. **Every addition is frontmost.** A newly added layer or group is selected and placed above all
   existing root groups by default.
5. **Vector-native means responsive.** Canonical scene data is normalized geometry and color
   parameters. SVG and CSS scale it to the host; no image asset is the authoritative export.
6. **Simple geometry remains simple.** V0.3 boundaries are closed, straight-sided, non-self-
   intersecting polygons. Curves, boolean geometry, and multi-region drawings do not sneak into
   this version.
7. **Color interaction is intentional.** Artists choose whether a material contributes paint,
   light, shadow, texture, base-preserving luminance, or colorization. A generic blend dropdown is
   not the primary interaction.
8. **Preview and export share one renderer contract.** A control is not complete until the live
   artboard, exported SVG, and responsive embed agree.

## 3. Scope

### 3.1 Required in v0.3

| Area                | Required capability                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene start         | Six curated starters plus Blank, with one-click Palette Remix                                                                                                  |
| Artboard            | 1:1, 2:1, 1:2, 4:3, 16:9, and 21:9 profiles; Fit and Cover preview                                                                                             |
| Primary gestures    | Glow / Soft Field, Band / Wave, Arc / Ring, Orb, Freeform Boundary, Grain / Paper / Film                                                                       |
| Geometry library    | Rounded rectangle, ellipse/circle, triangle, simple polygon, solid star, line/ribbon, blob; cube, sphere, cylinder, cone, pyramid, and prism as 2D silhouettes |
| Boundary editing    | Click-to-place 3-64 point closed polygons with magnetic closure and valid post-draw editing                                                                    |
| Layers              | Nested groups, selection, visibility, rename, duplicate, delete, reorder, direct transforms, Undo/Redo                                                         |
| Materials           | Fill, opacity, edge feather, bloom, interaction mode, transform, and named grain overlays                                                                      |
| Color               | A 4-8 slot scene palette, palette links/local overrides, Palette Remix, and permanently available White Quick Color                                            |
| Responsive output   | Editable Scene JSON, self-contained SVG, and copy-ready responsive HTML/CSS embed output                                                                       |
| Recovery            | Local auto-save after commits plus explicit Scene JSON import/export                                                                                           |
| Verification        | Unit, Chromium, accessibility, parity, and human visual review gates                                                                                           |
| Final documentation | A verified usage guide with concise feature descriptions and text-based examples                                                                               |

### 3.2 Explicitly deferred

- Raster PNG/JPEG as a v0.3 export format.
- WebGL, shaders, animation, liquid distortion, and volumetric rendering.
- Seamless/tile-ready composition mode.
- Arbitrary pen curves, pressure input, raw pointer-trace retention, or curve handles.
- Self-intersecting paths, polygon booleans, automatic intersection repair, and multi-body drawings.
- Actual 3D geometry or rotation; the listed 3D forms are fixed 2D visual silhouettes.
- Arbitrary SVG filter stacks, custom blend equations, or a filter/shader editor.
- Legacy color conversion, lock-aware Shuffle, raw recipe editing, batch editing, and provenance
  replay.
- Cross-browser certification beyond the pinned Chromium acceptance target.
- Silent automatic conversion of arbitrary v0.2 recipe files to the v0.3 schema.

### 3.3 Earlier specification disposition

The earlier Spec Kit document is a source of useful ideas, not an active implementation authority.
The v0.2 document remains a verified historical implementation record. V0.3 adopts only the
following parts of that prior work:

| Prior capability                             | V0.3 disposition                                      |
| -------------------------------------------- | ----------------------------------------------------- |
| Normalized coordinates and shared renderer   | Retain and evolve                                     |
| Layer ordering, direct manipulation, history | Retain and simplify around groups                     |
| Palette references                           | Retain as simple scene swatches and local overrides   |
| SVG/CSS export                               | Retain, add Scene JSON and responsive embed semantics |
| Freeform contours                            | Replace with simple point-to-point Boundary behavior  |
| Seamless tiling                              | Defer                                                 |
| Shuffle, locks, converter, raw recipe editor | Defer                                                 |

## 4. User-Facing Vocabulary

The product uses art vocabulary. Internal implementation names must not dominate the primary UI.

| Internal term        | User-facing term    |
| -------------------- | ------------------- |
| SceneV03             | Design              |
| Node group           | Group               |
| Material leaf        | Layer               |
| Boundary             | Boundary            |
| Interaction mode     | Interaction         |
| Palette reference    | Palette color       |
| Render profile       | Artboard / Fit mode |
| Local color override | Custom color        |

## 5. Core User Journeys

### 5.1 Start from a scene and remix it

1. A user chooses one of six starters: Airy Pastel, Warm Sunset, Deep Aurora, Pearl Light,
   Electric Color, or Restrained Mono.
2. The artboard opens with three to five visible composition groups.
3. Palette Remix creates a new coherent palette while preserving group layout, geometry, and
   palette links.
4. The user selects a group, adjusts its edge feather or interaction, and immediately sees the
   result.

### 5.2 Add a material in one action

1. The user opens Add and chooses Glow, Band, Arc, Orb, Boundary, or Grain.
2. The new group is appended frontmost, selected, and visible against the existing design.
3. The quick tray exposes Fill, Opacity, Edge Feather, Bloom, Interaction, and Arrange.
4. The user can drag the selected group on the artboard without opening More.

### 5.3 Draw a custom solid boundary

1. The user chooses Freeform Boundary and clicks points on the artboard.
2. A live straight segment follows the pointer from the latest accepted point.
3. After three valid points, the first point becomes a visible magnetic Close shape target.
4. Clicking that target, double-clicking a valid final point, or pressing Enter closes the
   boundary exactly at the first point.
5. A self-crossing candidate is red and cannot be committed. Escape cancels; Undo removes the
   newest accepted point.
6. After creation, the user can drag, insert, or remove points while the boundary remains valid.

### 5.4 Preserve a green composition while adding red texture

1. The user starts with a green background or green material group.
2. They add a red texture and select Interaction: Keep base hue.
3. The overlapping portion remains green in hue and saturation; the red layer contributes
   lightness/texture instead of muddy red-green paint mixing.
4. If red should visually take over, the user deliberately selects Paint or Colorize.

### 5.5 Export a responsive website texture

1. The user selects 21:9 and chooses Cover or Fit for the target context.
2. The artboard changes its viewport without moving geometry.
3. If needed, the user chooses explicit Reframe, which fits visible content with padding as one
   Undoable action.
4. The user downloads editable Scene JSON, downloads SVG, or copies a responsive HTML/CSS embed.
5. The exported output scales through viewBox, CSS aspect-ratio, and the selected fit behavior.

## 6. Workspace and Interaction Model

### 6.1 Layout

At the primary desktop viewport, the workspace contains:

1. A compact top bar for starter/new, artboard ratio, Fit/Cover, Undo/Redo, save state, and Export.
2. A layer rail that shows root groups in front-to-back visual order, with the frontmost group at
   the top.
3. A large centered artboard with a neutral surround and a reliable, aspect-correct canvas.
4. A compact selection tray near the artboard or selected object.
5. A More drawer for precision inputs and advanced explanations.

The artboard remains visible while controls are edited. The application must not require page
scrolling to move between the artboard and the primary selection controls at 1440 by 900.

### 6.2 Startup and scene starters

- The default new-design experience is a starter gallery. Blank is available but not preselected.
- Each starter has a named base, 4-8 named palette swatches, and 3-5 groups that demonstrate the
  v0.3 gestures without looking like a component demo.
- Palette Remix changes palette values only. It never changes geometry, group count, ordering, or
  local overrides.
- Starting a new design while edits exist must make it clear that the current design remains
  locally saved and can be exported before switching.

### 6.3 Add menu

The first section is titled Add material and contains visual tiles:

- Glow / Soft Field
- Band / Wave
- Arc / Ring
- Orb
- Freeform Boundary
- Grain / Paper / Film

The secondary Geometry section contains:

- Rounded rectangle, ellipse/circle, triangle, polygon, solid star, line/ribbon, and blob
- Cube, sphere, cylinder, cone, pyramid, and prism silhouettes

A solid star is a simple concave boundary with no crossing segments. A line/ribbon is represented
as a thin closed filled body, not an open stroke. 3D silhouette choices create a suitable
highlight/shadow group but never expose 3D rotation controls.

### 6.4 Selection and arrangement

- Canvas click selects the visible topmost selectable root group.
- Alt/Option-click cycles through overlapping root groups at the pointer location, with a visible
  group name/status so the action is discoverable.
- The layer rail can select any root group directly, including one fully obscured on the artboard.
- Newly added and duplicated groups are appended to root z-order, selected, and appear frontmost.
- Dragging a group moves it; visual handles scale and rotate it. The same values remain available
  in More.
- Root groups can be renamed, duplicated, hidden, deleted, or reordered. Their child layers
  remain in relative order.

Every finished drag, slider gesture, text commit, add, delete, duplicate, palette update, reorder,
ratio change, Reframe, and valid Boundary edit is one Undo/Redo transaction.

### 6.5 Quick selection tray and More drawer

The quick tray contains only high-value controls:

- Fill, including scene palette chips, a color picker entry point, and pinned White
- Opacity
- Edge Feather
- Bloom
- Interaction
- Arrange

More contains numeric precision, geometry details, group expansion, visibility/name, per-child
Orb adjustments, accessibility descriptions, and the exact standard blend mapping for Interaction.
No primary workflow should require a user to understand renderer internals.

## 7. Artboard and Responsive Coordinate Contract

### 7.1 Ratios and viewBox

The supported artboard ratios are 1:1, 2:1, 1:2, 4:3, 16:9, and 21:9. A ratio selects a logical
viewBox, not a bitmap size. For example, a 16:9 design can use a 1600 by 900 logical viewBox while
all stored points, positions, and sizes remain normalized.

- Root position and scale values are expressed relative to the selected artboard.
- Boundary points are local normalized coordinates from 0 to 1.
- Group transforms may place content beyond the artboard within bounded normalized overflow so
  large fields can intentionally bleed into a crop.
- The compiler converts normalized values into viewBox coordinates exactly once.
- DOM preview, downloaded SVG, and embed CSS consume the same compiled render output.

### 7.2 Ratio changes and Reframe

Changing ratio:

- preserves canonical geometry, group transforms, palette, and order exactly;
- changes only the artboard viewport and its visible crop;
- never silently stretches, repositions, or rescales content;
- remains Undoable.

Reframe is explicit. Reframe: Fit all calculates visible root-group bounds and applies a uniform
scale/translation to fit them inside the new artboard with a documented safe padding. It is
Undoable and must never run automatically.

### 7.3 Fit modes

- Fit maps to SVG meet behavior and preserves all artwork inside the target.
- Cover maps to SVG slice behavior and fills the target, allowing crop.
- The artboard toolbar and exported embed code use the same labels and behavior.
- Stretch is not exposed in v0.3.

## 8. Canonical Scene Model

### 8.1 Version boundary

V0.3 introduces a distinct versioned Scene schema rather than extending the v0.2 Field/Band
recipe in place. The canonical document is validated before it is committed, imported, rendered,
saved, or exported.

The model has this logical shape:

    Scene
      schemaVersion
      artboard
      background
      palette
      rootGroups (back to front)

    Group
      id, name, visibility, transform
      children (back to front, relative to the group)

    Material layer
      id, name, geometry/boundary, fill, opacity,
      edge feather, bloom, interaction, optional grain style

Selection, open drawers, pointer state, draft text, zoom, hover state, and history cursor are UI
state. They must never appear in Scene JSON.

### 8.2 Palette and color source

- A scene has 4-8 named, stable palette entries.
- A material fill is either a palette reference or a local custom color.
- Selecting a palette swatch links the material to that palette entry.
- Editing a palette entry updates all linked material fills in one Undoable transaction.
- Selecting pinned White creates or applies a local #FFFFFF fill without consuming a scene-palette
  slot. A user may add that color to the palette deliberately if they want it linked.
- Palette Remix only changes palette entries. Local overrides, including pinned White, remain
  unchanged.

### 8.3 Shared Boundary

All v0.3 filled geometry ultimately compiles to a shared Boundary:

- closed ordered vertices;
- 3 to 64 points;
- straight segments only;
- no repeated adjacent vertices;
- nonzero signed area;
- no self-intersection other than the deliberate terminal closure;
- exact canonical closure at the first vertex.

Primitive factories generate valid boundaries. The freeform tool writes the same Boundary model.
There is no padding a triangle to the old Field minimum, no competing raw pointer trace, and no
curve/bend data in this model.

### 8.4 Groups and compound gestures

Compound gestures create a root group. For example, Orb creates a base silhouette, highlight,
shadow, and optional bloom children.

- A group transform moves, rotates, and uniformly scales its children together.
- Expanding a group exposes child layers for intentional fine edits.
- Reordering a root group changes its relationship to other groups; child order remains internal.
- Export serializes the group hierarchy as ordered SVG group elements or an equivalent flattened
  draw list that preserves the same child and root z-order.

## 9. Geometry and Material Requirements

### 9.1 Edge Feather

Edge Feather is boundary-aware:

- 0 is a crisp filled boundary.
- Higher values retain a solid interior and dissolve outward from the boundary.
- It is not an implicit radial fade to the center.
- Glow remains a distinct material gesture for intentional radial/soft-field behavior.

### 9.2 Bloom and grain

- Bloom adds controlled soft light beyond a material boundary and is independent from Edge Feather.
- Grain, Paper, and Film are named visual overlays with bounded, deterministic parameters.
- A grain effect must composite over its source; it must never replace source color or erase a
  visible object.
- Arbitrary filter chains and unbounded distortion values are not supported.

### 9.3 Interaction: the artist-facing blend control

The quick tray label is Interaction. The More drawer can disclose the standards mapping.

| Interaction label | Standard mapping | Intended use                                                               |
| ----------------- | ---------------- | -------------------------------------------------------------------------- |
| Paint             | normal           | Transparent colored paint; mixed overlap is expected                       |
| Glow              | screen           | Bright light fields and highlights                                         |
| Shade             | multiply         | Shadows and depth fields                                                   |
| Texture           | soft-light       | Subtle contrast and surface character                                      |
| Keep base hue     | luminosity       | Preserve lower hue/saturation while applying the layer's lightness/texture |
| Colorize          | color            | Apply source hue/saturation while retaining lower lightness                |

Rules:

- Interaction is applied after a material's fill, feather, bloom, and opacity have been resolved.
- A user cannot have a final pixel that appears fully red while also leaving that same pixel's green
  hue unchanged. The UI and guide explain this tradeoff instead of promising impossible blending.
- Keep base hue is the recommended response when a green patch must remain recognizably green under
  a red texture.
- Different Interaction choices must create observably distinct pixels in an approved fixture, or
  the choice cannot ship.
- The exact same mapping must be used by DOM preview, standalone SVG, and responsive embed output.

Recommended defaults:

| Gesture              | Default Interaction |
| -------------------- | ------------------- |
| Boundary / primitive | Paint               |
| Glow                 | Glow                |
| Band / Wave          | Texture             |
| Orb highlight        | Glow                |
| Orb shadow           | Shade               |
| Grain / Paper / Film | Texture             |

## 10. Freeform Boundary Contract

### 10.1 Creation

- A click accepts one point. A line previews from the latest accepted point to the pointer.
- The first point becomes a magnetic Close shape target after a third valid point exists.
- Clicking the target snaps the final endpoint exactly to the first stored point.
- Enter and double-click close a valid shape; Escape cancels the in-progress shape.
- Undo during drawing removes only the latest accepted point. It does not alter the committed
  design until the boundary is closed and added.
- The point limit is 64. The UI explains the limit before it blocks another point.

### 10.2 Validity and editing

- A candidate segment that crosses an existing nonadjacent segment is shown as invalid and cannot
  be committed.
- A completed boundary can drag a vertex, insert through a midpoint handle, or remove a vertex
  while remaining at or above three points.
- Invalid edits leave the last valid boundary unchanged and explain why.
- V0.3 does not auto-repair crossings, infer a surrounding contour, or create separate regions.

## 11. Export, Persistence, and Compatibility

### 11.1 Required outputs

| Output         | Purpose                   | Requirements                                                                    |
| -------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Scene JSON     | Editable source of truth  | Versioned, validated, deterministic, and importable                             |
| SVG            | Standalone vector artwork | Script-free, self-contained, vector paths/gradients/filters, responsive viewBox |
| HTML/CSS embed | Website usage             | Copy-ready, namespaced, uses aspect-ratio and selected Fit/Cover behavior       |

No output may depend on a network request, a remote font, an embedded raster texture, or a required
JavaScript renderer. SVG may be used directly or as an encoded CSS background, but it must remain
generated from the same canonical scene data.

### 11.2 Responsive embed behavior

The embed export:

- declares the intended aspect ratio without locking the host to a pixel dimension;
- uses a responsive SVG/viewBox path for geometry;
- maps Fit and Cover to the same semantics used in the artboard;
- includes concise instructions for placing it in a host container.

### 11.3 Persistence and import

- Each completed command is locally auto-saved after validation.
- The UI exposes a truthful Saved locally, Saving, or Needs attention state.
- Scene JSON export/import is the portable durable recovery path.
- Invalid or unsupported JSON must not change the active design; it receives a concise actionable
  error.
- V0.2 is preserved as a separate working surface. A lossless v0.2-to-v0.3 importer is not a
  release gate and must never silently rewrite an existing v0.2 design.

## 12. Architecture and Reuse Plan

### 12.1 Reuse

Retain the following proven seams where they satisfy the new contract:

- React, TypeScript, Vite, existing testing toolchain, and pinned Node runtime.
- Editor command/history pattern, with transactions at finished user gestures.
- Coordinate conversion utilities and direct manipulation overlays.
- Shared render intermediate representation approach.
- DOM SVG preview, SVG serializer, CSS serializer, browser download helpers, and Chromium export
  fixture pattern.

### 12.2 Replace or substantially evolve

| Existing area                     | V0.3 change                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| Field/Band recipe schema          | New versioned Scene schema with groups and shared Boundary  |
| Field anchors with cubic segments | 3-64 point straight Boundary with simple-polygon validation |
| Component-only layer list         | Root groups plus child material layers                      |
| Persistent inspector-centered UI  | Artboard-first quick tray plus More drawer                  |
| Five raw blend names              | Six semantic Interaction options with renderer mappings     |
| Fixed 1200 by 800 profile         | Ratio-aware logical viewBox and Fit/Cover profile           |
| SVG/CSS-only export               | Add editable Scene JSON and responsive embed output         |

### 12.3 Rendering pipeline

The only visual pipeline is:

    validated Scene
      -> scene command/history state
      -> compiled scene render IR
      -> DOM SVG preview
      -> standalone SVG serializer
      -> HTML/CSS embed serializer

Adapters must not independently reinterpret geometry, layer order, opacity, feather, bloom,
interaction, ratio, or fit mode. Rendering is SVG/CSS based; no Canvas or WebGL renderer is
introduced for v0.3.

### 12.4 Likely module boundaries

| Responsibility                                            | Likely location                       |
| --------------------------------------------------------- | ------------------------------------- |
| Scene schema, types, validation, canonical serialization  | src/domain/recipe                     |
| Boundary validity and primitive factories                 | src/domain/geometry                   |
| Palette resolution and interaction mapping                | src/domain/color and renderers/shared |
| Scene/group/material commands and history                 | src/editor/state                      |
| Pointer drawing and selected-boundary overlays            | src/app/components                    |
| Artboard shell, starter gallery, Add menu, selection tray | src/app and src/app/panels            |
| Shared compilation and SVG/CSS serialization              | src/renderers                         |
| Downloads, JSON import/export, local save                 | src/export and app/session            |
| Unit and Chromium evidence                                | tests/unit and tests/e2e              |

## 13. Implementation Dependency Map

    T1 Scene schema
      -> T2 Boundary and primitive geometry
      -> T3 Scene render IR and ratio compiler
      -> T4 SVG/CSS interaction serialization
      -> T5 Commands, history, and persistence adapter
          -> T6 Artboard shell and ratio controls
          -> T7 Starter gallery, Add menu, and layer rail
          -> T8 Material tray, palette, and White Quick Color
          -> T9 Freeform Boundary workflow
          -> T10 Export and import surface
              -> T11 Accessibility and end-to-end acceptance
                  -> T12 Human visual review
                      -> T13 Verified usage guide

Tasks are intentionally vertical and leave a working surface after each checkpoint. No implementation
task may claim completion from type checks alone.

## 14. Ordered Implementation Tasks

### Phase 1: Foundation

#### Task T1: Introduce the versioned Scene schema

**Description:** Define the V0.3 canonical scene model, validators, IDs, default blank scene, and
canonical serialization without changing the v0.2 schema in place.

**Acceptance criteria:**

- [ ] Valid scenes with palette, artboard, groups, and material leaves serialize deterministically.
- [ ] Invalid IDs, colors, ratios, transforms, group cycles, or color references are rejected.
- [ ] V0.2 data is not silently accepted as V0.3 data.

**Verification:** Focused schema/normalization unit tests and TypeScript typecheck.  
**Dependencies:** None.  
**Likely files:** src/domain/recipe/schema.ts, types.ts, normalize.ts, domainValidator.ts, default scene
module, tests/unit/domain.  
**Estimated scope:** M.

#### Task T2: Build shared Boundary validation and primitive factories

**Description:** Add closed simple-polygon validation and factories for primary primitives and 2D
silhouette boundaries.

**Acceptance criteria:**

- [ ] Every factory emits a 3-64 point valid Boundary.
- [ ] Crossing, repeated-adjacent, degenerate, open, and over-limit inputs fail safely.
- [ ] Solid stars and line/ribbons remain single non-self-intersecting bodies.

**Verification:** Geometry unit fixtures, including triangle, concave star, and invalid crossings.  
**Dependencies:** T1.  
**Likely files:** src/domain/geometry/boundary.ts, primitive factory modules, tests/unit/domain/geometry.  
**Estimated scope:** M.

#### Task T3: Compile ratio-aware scene render IR

**Description:** Evolve the shared renderer compiler so normalized scene/group/material data becomes
one deterministic ordered render IR for each artboard profile.

**Acceptance criteria:**

- [ ] DOM and export adapters receive one ratio-aware order, geometry, color, and interaction IR.
- [ ] Changing ratio preserves canonical scene coordinates and changes the viewBox only.
- [ ] Group transforms preserve child-relative geometry and z-order.

**Verification:** Compiler, matrix, ordering, ratio, and group-transform unit tests.  
**Dependencies:** T1, T2.  
**Likely files:** src/renderers/shared/ir.ts, compileRenderIR.ts, profile.ts, tests/unit/renderers.  
**Estimated scope:** M.

#### Task T4: Render materials and Interaction modes from shared IR

**Description:** Implement edge feather, bloom, named grain behavior, and the six Interaction
mappings consistently in DOM SVG and serialized SVG/CSS.

**Acceptance criteria:**

- [ ] Paint, Glow, Shade, Texture, Keep base hue, and Colorize map to the approved standards modes.
- [ ] Red-over-green fixtures visibly distinguish Paint, Texture, and Keep base hue.
- [ ] Exported SVG and CSS produce the same material semantics without scripts or raster assets.

**Verification:** Serializer and renderer unit tests plus focused Chromium blend fixture.  
**Dependencies:** T3.  
**Likely files:** src/renderers/dom-svg, src/renderers/svg, src/renderers/web, paint/filter modules,
tests/unit/export.  
**Estimated scope:** M.

### Checkpoint A: Renderer foundation

- [ ] T1-T4 pass focused tests, typecheck, lint, and production build.
- [ ] A simple scene renders identically in the artboard, standalone SVG, and CSS fixture.
- [ ] One reviewer verifies the red-over-green fixture visually before UI expansion.

### Phase 2: Composition Workspace

#### Task T5: Adapt commands, history, and local save to scenes

**Description:** Replace component-only editor operations with atomic scene/group/material commands,
selection state, history behavior, and validated local auto-save.

**Acceptance criteria:**

- [ ] Add, duplicate, delete, rename, visibility, reorder, transform, and palette edits are atomic
      Undo/Redo actions.
- [ ] New root groups append frontmost and become selected.
- [ ] Valid commits save locally; rejected/import-invalid data leaves the committed scene untouched.

**Verification:** Command/history unit tests and reload fixture.  
**Dependencies:** T1, T3.  
**Likely files:** src/editor/state, src/app/session/useLiteEditor.ts, persistence module,
tests/unit/editor.  
**Estimated scope:** M.

#### Task T6: Make the artboard ratio-aware and artboard-first

**Description:** Replace the fixed profile shell with a centered responsive artboard, ratio picker,
Fit/Cover controls, Reframe action, reliable coordinate conversion, and quick selection placement.

**Acceptance criteria:**

- [ ] Each supported ratio displays correctly at the primary desktop viewport.
- [ ] Ratio changes preserve scene data and never silently reposition groups.
- [ ] Explicit Reframe is one Undoable operation with visible safe padding.

**Verification:** Canvas coordinate unit tests and Chromium geometry/viewport assertions.  
**Dependencies:** T3, T5.  
**Likely files:** src/app/layout, src/app/components/PreviewSurface.tsx, canvasGeometry.ts,
styles, tests/unit/app, tests/e2e.  
**Estimated scope:** M.

#### Task T7: Build scene starters, Add menu, and group layer rail

**Description:** Deliver the starter gallery, visual material-first Add menu, and group-oriented
layer rail with direct selection and front-at-top order.

**Acceptance criteria:**

- [ ] Six starters and Blank create valid scenes with visible multi-layer compositions.
- [ ] Every approved Add tile creates a selected frontmost group or material.
- [ ] Layer rail selection and Alt/Option click provide access to obscured groups.

**Verification:** Template unit tests and Chromium starter/add/selection journey.  
**Dependencies:** T2, T5, T6.  
**Likely files:** src/app/panels, component template modules, layer list, styles, tests/unit/app,
tests/e2e.  
**Estimated scope:** M.

#### Task T8: Deliver the material tray, palette links, and White Quick Color

**Description:** Build the compact selection tray and More drawer for fill, palette links, pinned
White, opacity, edge feather, bloom, interaction, and arrange controls.

**Acceptance criteria:**

- [ ] Pinned White is selectable in Quick Colors without consuming a palette slot.
- [ ] Palette edits update linked materials but not local overrides.
- [ ] Every exposed quick-tray control changes the artboard and creates one history transaction.

**Verification:** Palette/command tests and pixel-changing Chromium actions.  
**Dependencies:** T4, T5, T6.  
**Likely files:** src/app/panels, src/domain/color, src/editor/state, styles, tests/unit,
tests/e2e.  
**Estimated scope:** M.

### Checkpoint B: Composition usability

- [ ] T5-T8 pass focused tests and build.
- [ ] A tester can start from a scene, remix palette, add a material, select an obscured group,
      change its interaction, and undo/redo the result without the artboard becoming unavailable.
- [ ] The working surface has no browser console or page errors.

### Phase 3: Boundary and Output

#### Task T9: Implement freeform Boundary creation and editing

**Description:** Add click-to-place Boundary drawing, magnetic closure, invalid-crossing prevention,
and post-creation point manipulation using the shared polygon model.

**Acceptance criteria:**

- [ ] Closing via target, Enter, and double-click produces exact first-point closure for valid
      3-64 point boundaries.
- [ ] Crossing candidates and invalid edits are visibly rejected without mutating the last valid
      scene.
- [ ] Drag, midpoint insertion, removal, Escape, and Undo behave as specified.

**Verification:** Boundary command tests plus pointer-driven Chromium journey.  
**Dependencies:** T2, T5, T6, T8.  
**Likely files:** src/app/components boundary overlay, interaction coordinator, editor commands,
tests/unit/editor, tests/e2e.  
**Estimated scope:** M.

#### Task T10: Complete portable Scene JSON, SVG, and responsive embed export

**Description:** Surface the three required exports, Scene JSON import, truthful save/export state,
and named Fit/Cover embed instructions.

**Acceptance criteria:**

- [ ] Scene JSON round-trips a representative nested scene exactly after validation.
- [ ] SVG and HTML/CSS exports have no scripts, external assets, or raster backing.
- [ ] Fresh Chromium fixtures render exports at multiple container ratios with the selected fit mode.

**Verification:** Serializer unit tests, download/import tests, and fresh-host Chromium fixtures.  
**Dependencies:** T4, T5, T6, T9.  
**Likely files:** src/export, src/renderers/svg, src/renderers/web, export panel, tests/unit/export,
tests/e2e/fixtures.  
**Estimated scope:** M.

### Checkpoint C: Portable authoring

- [ ] T9-T10 pass focused tests, typecheck, lint, format check, and production build.
- [ ] A drawn Boundary survives Undo/Redo, local reload, Scene JSON round-trip, SVG export, and
      responsive embed rendering.
- [ ] Preview/export parity is visually reviewed for every Interaction mode.

### Phase 4: Release Quality and Documentation

#### Task T11: Accessibility, empty states, and product-language polish

**Description:** Ensure keyboard operation, clear labels/statuses, readable empty/error states, and
consistent art vocabulary across the completed UI.

**Acceptance criteria:**

- [ ] Add, selection, layer ordering, Boundary close/cancel, quick controls, and export are
      keyboard operable.
- [ ] Color state, interaction, save status, invalid geometry, and disabled controls do not rely
      on color alone.
- [ ] Automated accessibility checks find no blocking issue in the primary authoring journey.

**Verification:** Axe/keyboard Chromium checks and targeted UI assertions.  
**Dependencies:** T6-T10.  
**Likely files:** app components/panels/styles, tests/e2e.  
**Estimated scope:** M.

#### Task T12: Run the complete visual acceptance suite

**Description:** Produce and review the focused evidence required to establish that the rendered
product—not merely its state—matches this specification.

**Acceptance criteria:**

- [ ] The Chromium journey covers starter/remix, Add/frontmost, Boundary, red-over-green,
      ratio/Reframe, export, import, and reload.
- [ ] Representative screenshots demonstrate each starter and the green/red interaction use case.
- [ ] Human review confirms the artboard is intuitive, new objects appear on top, and exports look
      materially equivalent to preview.

**Verification:** Full npm check, lint, format check, axe run, screenshots, and documented human
review results.  
**Dependencies:** T11.  
**Likely files:** tests/e2e, visual snapshots, verification notes.  
**Estimated scope:** M.

#### Task T13: Write the verified v0.3 Usage Guide

**Description:** As the final implementation step, create a concise usage guide only after the
actual UI, labels, interaction modes, exports, and acceptance evidence are final.

**Acceptance criteria:**

- [ ] Create USAGE_GUIDE.md with brief descriptions of every visible v0.3 feature and its limits.
- [ ] Include text-based examples for starting/remixing a scene, drawing a Boundary, arranging
      groups, using white, choosing Interaction for red over green, changing ratio, and exporting.
- [ ] Every instruction is checked against the finished application and links to the exact visible
      labels; unsupported/deferred features are called out plainly.

**Verification:** Walk each written example in the completed app; reviewer confirms the guide has
no stale UI labels or unsupported promises.  
**Dependencies:** T12.  
**Likely files:** texture-lab-v0.1-lite/USAGE_GUIDE.md and, only if needed, a small Help entry point.  
**Estimated scope:** S.

### Final checkpoint: v0.3 release candidate

- [ ] All tasks T1-T13 and their focused verification steps pass.
- [ ] Full npm check, lint, format check, and Chromium suite pass on the pinned runtime.
- [ ] SVG, CSS embed, and Scene JSON are checked in fresh browser contexts at more than one ratio.
- [ ] Human product review accepts both the visual result and the interaction model.
- [ ] The usage guide has been written last, verified against the completed product, and reviewed.

## 15. Required Chromium Acceptance Journey

The end-to-end suite must use real pointer and keyboard interactions, not direct state injection,
for the following path:

1. Open a starter and confirm its multi-layer artboard is visible and console-clean.
2. Palette Remix it, then choose pinned White for a selected material and verify the expected
   palette/local behavior.
3. Add a Glow and an Orb; verify each appears selected and frontmost in both artboard and layer
   rail.
4. Select a lower overlapping group through the rail and through Alt/Option-click.
5. Draw a valid freeform Boundary, close it magnetically, insert/drag/remove a point, and Undo/Redo
   the edits.
6. Attempt a crossing segment and verify the scene remains unchanged with an accessible reason.
7. Apply a red material over green using Paint, Texture, and Keep base hue; verify distinct visible
   outcomes and preview/export parity.
8. Change 1:1 to 21:9, verify positions remain canonical, then invoke explicit Reframe and Undo it.
9. Download/import Scene JSON and load SVG/CSS output in fresh responsive hosts using Fit and Cover.
10. Reload the app and verify the most recent valid scene is recovered locally.
11. Walk each usage-guide example after it is written.

## 16. Definition of Done

V0.3 is done only when all of the following are true:

### Product

- A first-time user can begin from a scene starter, create a visibly different multi-colored
  composition, and understand where to add material without reading internal terminology.
- New material additions appear frontmost and are immediately selectable.
- The artboard has reliable ratio behavior; it does not double-fit, warp, or silently reframe.
- Boundary drawing creates only one valid, closed, straight-sided solid body.
- White is a visible Quick Color.
- Interaction behavior makes red-over-green tradeoffs understandable and reproducible.
- A user can access any obscured group and arrange it deliberately.

### Portability

- Scene JSON preserves editable scene semantics.
- SVG and HTML/CSS embed use geometry, gradients, opacity, effects, groups, and interaction modes
  rather than a bitmap fallback.
- Fit/Cover and artboard ratio behavior match between authoring and fresh exported hosts.

### Engineering

- The new schema, Boundary validator, render compiler, UI commands, and serializers share one
  unambiguous contract.
- All supported controls have a deterministic visual effect and a focused automated assertion.
- Preview/export parity, invalid input behavior, and local persistence are tested in Chromium.
- No console errors, page errors, unchecked invalid draft, or hidden geometry failure is accepted.

### Documentation and review

- The final USAGE_GUIDE.md exists, is concise, contains verified text examples, and does not claim
  deferred functionality.
- Human review verifies the artboard feels composition-first and the artwork is visually credible.
- The user explicitly accepts the release candidate after seeing the evidence.

## 17. Risks and Mitigations

| Risk                                                            | Impact | Mitigation                                                                                        |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Preview and export interpret a material differently             | High   | Compile one shared render IR; use fresh-host SVG/CSS fixtures for each Interaction                |
| Boundary implementation grows into a pen tool                   | High   | Enforce 3-64 straight simple polygons; reject curves, crossings, and booleans                     |
| Blend labels are technically correct but artistically confusing | High   | Use semantic Interaction labels, visible mini-previews, red-over-green fixture, and guide example |
| Group hierarchy breaks z-order or selection                     | High   | Canonical ordered children/root groups, explicit front-at-top rail, layered selection tests       |
| Ratio changes feel destructive                                  | Medium | Preserve normalized scene data; make Reframe explicit, reversible, and visibly explained          |
| Legacy scope reappears during implementation                    | Medium | Treat the deferred list as a hard boundary; add new scope only through explicit approval          |
| Guide becomes stale                                             | Medium | Require it as the final post-verification task and walk every example in the final app            |

## 18. Approval and Next Step

All product choices through Interaction mode and the final usage-guide requirement are approved.
There are no remaining product questions blocking implementation planning.

The next authorized action, if requested, is to implement this plan incrementally from T1 onward.
The v0.2 specification and implementation remain preserved as the stable baseline until that work is
explicitly authorized.

## 19. Approved v0.3 Interaction and Performance Refinement Addendum — 2026-08-21

**Status:** Product decisions approved; this is a no-code refinement plan.
**Relationship to the baseline:** This addendum preserves the v0.3 composition, material, export,
and simple-Boundary contracts above. It supersedes only prior text that conflicts with the
transform, selected-layer, Boundary-editing, or interaction-performance behavior defined here.
**Implementation boundary:** Writing this addendum does not authorize implementation. It defines
the smallest coherent next increment when implementation is expressly requested.

### 19.1 Refined product outcome

The artboard must feel like an art canvas rather than a collection of exposed polygon controls. A
designer can select an obscured layer from the layer rail, see an editor-only indication of its true
placement, move or resize it without changing visual z-order, and return to a full-fidelity vector
composition after the gesture settles.

The refinement has four equally important outcomes:

1. **Fast transforms:** Scale X and Scale Y are easy to manipulate independently or proportionally;
   rotation is easy to sweep through a full turn while remaining precise.
2. **Calm point editing:** Ordinary selection has no anchor clutter. Point editing is explicit,
   retains the exact Boundary, and exposes only the controls required for the next edit.
3. **Intentional obscured-layer editing:** Selecting a layer in the rail makes it directly editable
   even beneath visible layers, but never changes the composition's real stacking order.
4. **Responsive interaction:** Continuous input receives an immediate close visual preview without
   recompiling every full-quality material on every pointer event. The canonical vector Scene,
   exported SVG, and CSS remain full fidelity.

### 19.2 Approved decisions

| Area                | Approved behavior                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scale               | Each root-group transform has independent X and Y scale. The transform UI expresses `100%` as the group's unscaled local bounds. Scale lock is on by default.                                                                                             |
| Resize handles      | With ratio lock on, corner handles scale proportionally and side handles are unavailable. With it off, corners change both axes and side handles change one axis. Normal resize keeps the opposite edge/corner fixed.                                     |
| Center resize       | During a transform-handle drag, `Ctrl` on Windows and `Option` on macOS scale about the group center. `Shift` temporarily toggles the ratio lock. A visible accessible control provides the same center-resize behavior without requiring a modifier.     |
| Rotation            | The UI has a `0–360°` slider and numeric field, both in `0.5°` increments. Canonical Scene data normalizes equivalent values into `[-180°, 180°)` to keep serialization deterministic.                                                                    |
| Sidebar selection   | Selecting a layer rail row pins that group as the editor target. A non-exported overlay makes it draggable even when it is visually beneath other layers. It does not reorder, brighten, hide, or otherwise alter artwork.                                |
| Boundary modes      | `Object` mode is the default and shows a selection cage, not points. `Edit points` reveals vertices; an insertion affordance appears only for a hovered or selected segment. Leaving edit mode hides points without deleting or simplifying the Boundary. |
| Off-artboard points | Boundary vertices may use bounded local overscan. The rendered art remains clipped to the artboard; a separate editor overlay keeps selected handles reachable outside it. Topology, not the visible canvas edge, is the reason an edit is rejected.      |
| Interaction quality | Active-drag preview is vector and z-order-correct. It retains shape, fill, opacity, clipping, and Interaction/blend behavior; transient grain, bloom, and costly blur refinement may be deferred for the active layer only.                               |

### 19.3 Hard boundaries and non-goals

- No raster snapshot, canvas bitmap, WebGL, or shader becomes the authoritative preview or export.
- No new curve model, freehand trace, Boolean operation, multi-body Boundary, or self-intersection is
  introduced.
- `Solidify` is not a destructive geometry command. The user-facing solution is to leave `Edit
points`; an optional future `Simplify Boundary` command would be explicit and lossy, and is out of
  scope here.
- Layer rail selection never issues Bring to front, reorder, visibility, fill, opacity, or blend
  commands.
- Scene JSON uses an exact version boundary. Unsupported versions are rejected with clear recovery
  guidance; Git remains the rollback path for the prior 0.3.0 format.
- A global low-resolution preview is not the first performance tactic. Fidelity loss is narrowly
  scoped to expensive active-layer polish during an active interaction.

### 19.4 Transform data, compatibility, and export contract

#### 19.4.1 Versioned transform representation

The existing `uniformScale` field cannot remain the canonical transform once independent scaling is
available. The refinement uses a patch-level Scene JSON version, `0.3.1`, with this canonical form:

```ts
transform: {
  translation: { x: number; y: number },
  scale: { x: number; y: number },
  rotationDeg: number // canonical range: [-180, 180)
}
```

- Each scale axis is finite and within `0.05..4`; `1` is `100%`.
- Translation retains the existing bounded normalized overscan range.
- The ratio-lock preference, selected handle, center-resize modifier state, and displayed `0..360°`
  rotation are editor UI state. They are not Scene JSON fields.
- This is intentionally a breaking Scene JSON change: only `0.3.1` documents with `scale.x` and
  `scale.y` are accepted. A `0.3.0` `uniformScale` document is retained by the prior Git revision,
  not silently transformed by this build.
- V0.2 remains a separately versioned format and is not implicitly imported.

This is a data compatibility change, not an image export change. SVG matrices and responsive CSS
already represent non-uniform affine scale. DOM preview, standalone SVG, CSS embed, Scene JSON,
Undo/Redo, autosave, and starter fixtures must all consume the same transform form.

#### 19.4.2 Transform interaction contract

- The transform cage uses the group’s logical geometry bounds, not bloom or grain extents.
- Rotation occurs about the group's logical center. It preserves the center unless a later explicit
  pivot feature is approved.
- Standard resize changes scale and translation together so the opposing edge/corner remains fixed
  in artboard coordinates, including after rotation.
- Center resize uses the logical center as the fixed pivot; it never moves geometry to compensate.
- Numeric X/Y percent and rotation inputs remain visible in More. Slider and number entry have one
  committed value source and show validation feedback rather than silently reverting.
- A `360°` entry visibly reads as `0°` after commit, because the values are equivalent. The control
  never claims that they are separate rotations.

### 19.5 Selection, layer order, and transform overlay contract

The selected object is an editor concern, not a render-order concern.

1. The layer rail still lists groups front-to-back. Selecting a row selects that actual group even if
   its rendered pixels are fully obscured.
2. A rail selection enters a pinned editor-focus state. The artboard renders a non-exported focus
   outline and transform cage after the artwork, so it is readable above all layers.
3. The selected group’s transparent logical hit area and its handles receive pointer priority while
   pinned. A drag therefore moves the selected group as though it were frontmost, while all real
   artwork stays in its original order.
4. `Escape`, clicking empty stage space, or choosing another rail row clears/replaces the pin.
   Normal visible-layer picking and the existing Alt/Option overlap cycle remain available outside a
   pinned hit area.
5. For a single-material group, the overlay may trace the Boundary. For compound gestures such as an
   Orb, it uses one logical transform cage around the group rather than attempting to expose every
   child material as a separate selectable object.

The overlay must never be emitted by Scene JSON, SVG download, or CSS export. It must be clearly
distinguishable from artwork through a focused outline/handle style rather than by modifying the
selected material’s appearance.

### 19.6 Boundary editing and overscan contract

#### 19.6.1 Object versus Edit points

- `Object` mode is the normal state after a Boundary is created or selected. It preserves all
  vertices exactly but shows only the group selection cage.
- `Edit points` is an explicit reversible mode. It shows draggable vertices, an active vertex state,
  and one candidate insertion affordance for the hovered or selected segment.
- Every segment must not render a permanent `+` control. This removes the current two-control-per-
  vertex density and shortens keyboard traversal.
- Removing a selected vertex remains available only when at least three vertices remain. Insertion
  and removal always re-run simple-polygon validity checks.
- Exiting point mode is the requested non-destructive "solidification" experience: the shape is no
  longer visually dependent on anchors, but can be reopened for exact editing at any time.

#### 19.6.2 Bounded off-artboard editing

Boundary local coordinates change from a strict `0..1` range to a finite edit-space range of
`-2..3` on each axis. This matches existing transform overscan and allows an anchor to move well
beyond any artboard edge without inventing infinite coordinate space.

- The simple-polygon rules remain unchanged: 3–64 vertices, finite values, no repeated vertices,
  nonzero area, and no non-adjacent crossing or touching segments.
- Affine transform scaling/rotation of a valid non-degenerate simple polygon remains valid; point
  editing therefore validates local topology, not incidental visible crop.
- The visible artboard continues to clip artwork for Fit/Cover/export. The editor adds a padded,
  non-exported overscan stage outside the clip for selected outlines, vertices, and handles.
- Pointer conversion in `Edit points` uses unclamped stage coordinates before transforming through
  the inverse group matrix. Ordinary artboard crop behavior does not leak into the exported design.
- Invalid candidate edits show the draft state as invalid and leave the latest valid canonical
  Boundary untouched.

### 19.7 Interaction-performance architecture

#### 19.7.1 Measured problem statement

The current direct-drag path promotes a full scene candidate for every pointer event. The artboard
then recompiles its full render IR and the DOM renderer serializes/replaces the complete SVG,
including potentially expensive Gaussian blur and turbulence filters. This is a plausible source of
the observed lag, but the implementation must record a benchmark before declaring a measured cause.

#### 19.7.2 Required two-tier preview

The system must never simply wait 200 ms before showing a drag. Instead, it has two preview tiers:

```text
pointer samples
  -> keep latest draft in ephemeral interaction state
  -> requestAnimationFrame coalesces to one immediate vector preview per paint
  -> 150 ms quiet period triggers one full-quality refinement
  -> pointer move cancels a pending refinement and resumes interaction quality
  -> pointer release fully validates, commits one Scene/Undo/autosave transaction, then restores full quality
```

- The draft is not authoritative Scene JSON and is not autosaved or exported.
- Inspector values reflect the current valid draft so direct manipulation and precision controls do
  not appear stale.
- A transform drag updates its selected group’s matrix or isolated render fragment; it does not
  require full Scene serialization per pointer sample.
- A Boundary drag updates the selected draft path and performs an incremental local validity test;
  full command validation remains mandatory before the final commit.
- An interaction begins one history transaction and produces at most one committed Scene revision on
  release. Cancel restores the last canonical scene.

#### 19.7.3 Z-order-correct static caching

A single flattened background cache is forbidden because it would make a selected lower layer appear
above layers that should cover it. The editor preview instead maintains three ordered regions in the
same SVG compositing context:

```text
full-quality cached groups below selected group
  -> interaction-quality selected group
  -> full-quality cached groups above selected group
  -> non-exported selection/point overlay
```

The active group remains in its true draw-order slot. The overlay alone appears above all artwork.
Fragment caching is keyed by stable compiled group/material content and render quality. Shared
filter definitions may be deduplicated when their normalized parameters match, but filter IDs and
blend semantics must remain collision-safe.

#### 19.7.4 Interaction-quality rules

- Preserve active-layer boundary/path, fill, opacity, clipping, affine transform, and Interaction
  blend mapping on every draft paint.
- Retain all non-active layers in their last full-quality state and true z-order.
- Grain/Paper/Film and bloom are deferred for the active layer during continuous input. Edge feather
  remains visible; if profiling requires a fallback, use a bounded lower-cost feather refinement
  rather than changing the underlying Boundary.
- After 150 ms idle or pointer release, restore the identical full-quality SVG/CSS material result.
- Do not use a low-resolution bitmap, alter palette data, change fit/crop, or substitute another
  blend mode as an interaction shortcut.

### 19.8 Refinement dependency map

```text
R0 benchmark and interaction diagnostics
  -> R1 transform schema 0.3.1 boundary
      -> R2 scale-aware compiler/export parity
          -> R3 selection focus and transform cage
              -> R4 Object/Edit-points and overscan
              -> R5 segmented persistent DOM preview
                  -> R6 rAF draft scheduler and quality refinement
                      -> R7 end-to-end, export, accessibility, performance, and guide verification
```

R3 and R4 must produce correct full-quality behavior before R5/R6 optimize it. Performance work
must not be used to conceal an incorrect transform, selection, Boundary, or export contract.

### 19.9 Ordered implementation tasks

#### Task R0: Establish an interaction performance baseline

**Description:** Create deterministic 12-layer and 24-layer fixtures and lightweight local
instrumentation for pointer-to-draft paint, full-quality settle time, full-scene serialization count,
and queued interaction updates.

**Acceptance criteria:**

- [ ] The fixtures represent ordinary combinations of Glow, Band, Orb, Boundary, blur, and grain.
- [ ] Measurements distinguish direct transform, Boundary vertex drag, and idle/refinement phases.
- [ ] Baseline results are recorded before any caching or quality shortcut lands.

**Verification:** Focused test helper/unit coverage plus a repeatable pinned-Chromium manual profile.
**Dependencies:** None.
**Likely files:** `src/app/session`, `tests/e2e`, a dedicated performance-fixture module.
**Estimated scope:** S.

#### Task R1: Introduce the two-axis transform model

**Description:** Add the `0.3.1` transform representation, per-axis validation/normalization,
commands, persistence, and canonical serialization. This is a deliberate breaking schema boundary.

**Acceptance criteria:**

- [ ] Canonical `0.3.1` documents contain only `scale.x` and `scale.y`, with finite bounded values.
- [ ] A `0.3.0` document receives a clear unsupported-version diagnostic without mutating the current scene.
- [ ] Undo/Redo, local recovery, import failure, and starter creation retain deterministic state.

**Verification:** Schema, normalize, command, persistence, rejection, and canonical-round-trip tests.
**Dependencies:** R0.
**Likely files:** `src/domain/scene/{types,validate,normalize,canonicalSerialize}.ts`,
`src/editor/scene/{commands,persistence}.ts`, focused tests.
**Estimated scope:** M.

#### Task R2: Make transforms portable through the shared renderer

**Description:** Apply two-axis affine transforms once in the shared render IR and keep DOM SVG,
standalone SVG, CSS embed, Reframe, and export fixtures in parity.

**Acceptance criteria:**

- [ ] X/Y scaling, rotation, Fit/Cover, and all supported artboard ratios match in preview and both exports.
- [ ] New uniform X/Y scale scenes render identically across preview and export.
- [ ] Reframe calculates meaningful bounds for non-uniformly scaled groups without changing child order.

**Verification:** Matrix/compiler tests, SVG/CSS serializer tests, and fresh-host Chromium parity fixtures.
**Dependencies:** R1.
**Likely files:** `src/renderers/shared/compileSceneRenderIR.ts`, `src/renderers/shared/sceneIr.ts`,
`src/renderers/{svg,web}`, `src/editor/scene/commands.ts`, focused tests.
**Estimated scope:** M.

#### Task R3: Deliver pinned selection and the transform cage

**Description:** Add a non-exported selection overlay that supports rail-pinned obscured-layer
editing, logical bounds, resize handles, rotation, modifier behavior, and focus exit behavior.

**Acceptance criteria:**

- [ ] A rail-selected lower group stays visually beneath covering groups yet can be highlighted and dragged.
- [ ] Locked/unlocked X/Y resize, opposing-pivot resize, center resize, and `0.5°` rotation agree with More inputs.
- [ ] `Escape`, empty-stage click, visible picking, and Alt/Option cycling retain predictable selection behavior.

**Verification:** Transform-math units, real-pointer Chromium journey, keyboard/accessibility check, and visual review.
**Dependencies:** R2.
**Likely files:** `src/app/components/SceneArtboard.tsx`, a focused transform-overlay component,
`src/app/session/useSceneEditor.ts`, `src/app/panels/SceneLayerInspector.tsx`, layout styles, tests.
**Estimated scope:** M.

#### Task R4: Replace noisy Boundary editing with Object/Edit-points and overscan

**Description:** Separate normal object selection from point editing, reveal insertion affordances
on demand, permit bounded off-artboard vertices, and add an unclipped editor-only overscan layer.

**Acceptance criteria:**

- [ ] A dense primitive no longer shows one permanent midpoint control per segment in normal selection.
- [ ] A valid anchor can move outside the visible artboard and remain reachable without changing artwork crop.
- [ ] Crossing/touching/repeated/degenerate candidates remain rejected with the last valid Boundary preserved.

**Verification:** Boundary validator and coordinate-conversion units; pointer-driven Chromium cases for
Object/Edit-points, off-artboard dragging, insert/remove, invalid topology, and Undo/Redo.
**Dependencies:** R1, R3.
**Likely files:** `src/domain/geometry/boundary.ts`, `src/app/components/SceneArtboard.tsx`,
`src/app/session/useSceneEditor.ts`, layout styles, Boundary tests.
**Estimated scope:** M.

#### Task R5: Segment the DOM preview without splitting render semantics

**Description:** Evolve the DOM SVG preview away from whole-SVG replacement per interaction so it
can retain cached above/below z regions, an isolated active group, shared definitions, and a
non-exported editor overlay while export keeps using the shared material IR.

**Acceptance criteria:**

- [ ] An active lower group stays between cached lower and upper groups in the same SVG compositing order.
- [ ] Export serialization still uses full-quality shared IR and contains no editor-only fragments.
- [ ] Stable groups/filter definitions are not rebuilt merely because the active group moves.

**Verification:** Renderer-fragment units, blend/filter parity fixtures, DOM mutation/serialization
instrumentation, and focused visual comparison.
**Dependencies:** R0, R2, R3.
**Likely files:** `src/renderers/dom-svg/DomSceneSvgRenderer.tsx`, `src/renderers/shared`,
`src/renderers/svg/serializeSceneSvg.ts`, `src/app/components/SceneArtboard.tsx`, renderer tests.
**Estimated scope:** M.

#### Task R6: Add rAF-coalesced drafts and staged material refinement

**Description:** Replace per-pointer canonical promotion with an ephemeral interaction draft,
requestAnimationFrame coalescing, cancellation-aware idle refinement, and one final validation/
history/autosave commit per gesture.

**Acceptance criteria:**

- [ ] Continuous transform and Boundary input uses at most one draft preview per animation frame.
- [ ] The active layer remains recognizably accurate while expensive grain/bloom polish is deferred.
- [ ] Pointer release or 150 ms idle restores full fidelity; cancel leaves the committed Scene unchanged.

**Verification:** Interaction-state units, scheduler fake-timer tests, real-pointer 12/24-layer
Chromium profiles, and undo/export parity checks after an interaction.
**Dependencies:** R3, R4, R5.
**Likely files:** `src/app/session/useSceneEditor.ts`, `src/app/components/SceneArtboard.tsx`, a small
interaction-preview/scheduler module, DOM SVG preview, tests.
**Estimated scope:** M.

#### Task R7: Prove the refinement and update the usage guide last

**Description:** Run the full acceptance package, document only verified behavior, and obtain the
human product review required by the original v0.3 plan.

**Acceptance criteria:**

- [ ] The 12-layer benchmark targets p95 pointer-to-draft paint of 33 ms or less and full-quality settle within 250 ms on the recorded pinned-Chromium baseline; the 24-layer fixture has no unbounded input queue.
- [ ] Chromium covers X/Y/locked/center scale, `0.5°` rotation, rail-pinned hidden-layer drag,
      Object/Edit-points, overscan, invalid topology, export parity, and accessibility.
- [ ] The usage guide describes the final controls, modifier keys, editor-only selection behavior,
      performance-preview behavior, and Boundary limits without promising deferred functionality.

**Verification:** Full pinned-runtime checks, accessibility run, fresh-host exports at multiple
ratios, performance evidence, screenshots, and human review.
**Dependencies:** R1–R6.
**Likely files:** `tests/unit`, `tests/e2e`, `USAGE_GUIDE_V0.3.md`, verification notes.
**Estimated scope:** M.

### 19.10 Completion gates

This refinement is complete only when all prior v0.3 gates still pass and all of the following are
true:

- A selected hidden layer can be manipulated through the layer rail without changing its actual
  visible z-order, and the exported output contains no selection chrome.
- A user can use locked X/Y scaling, explicitly unlock scale, resize from the center with the
  documented modifier/control, and enter a precise `0.5°` rotation.
- The Object/Edit-points distinction removes anchor clutter without any hidden geometry loss.
- A Boundary vertex can move beyond the artboard in bounded overscan, while invalid topology is still
  blocked and export crop remains predictable.
- Continuous interaction does not induce a full-scene recompute/serialize for every raw pointer
  sample; the staged preview is visually close, z-order-correct, and returns to full vector fidelity.
- Scene JSON version rejection, SVG, CSS embed, Undo/Redo, autosave, ratio behavior, interaction modes, and
  existing human-review expectations remain valid.
- The usage guide is updated only after these behaviors are verified in the finished UI.

### 19.11 Risks and mitigations

| Risk                                                                   | Impact | Mitigation                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pinned overlay steals expected top-layer clicks                      | High   | Pin only on explicit layer-rail selection; visibly identify focus; document `Escape`/empty-stage exit; preserve normal canvas picking outside the focused hit area. |
| Non-uniform scale makes older JSON unavailable or breaks export parity | High   | Use an explicit `0.3.1` format boundary, Git rollback for 0.3.0, one shared affine IR, deterministic round trips, and fresh-host export tests.                      |
| Off-artboard controls become invisible or confuse crop                 | High   | Separate clipped artwork from padded editor-only overscan; label crop behavior; never export overlay chrome.                                                        |
| Caching flattens z order or changes blend behavior                     | High   | Cache lower/active/upper regions in one SVG compositing context; test every Interaction mapping against full-quality export.                                        |
| A 200 ms debounce makes dragging laggy                                 | High   | rAF immediate draft first; idle delay only refines quality; cancellation token drops stale refinements.                                                             |
| Performance work creates a second design state                         | High   | Draft state is isolated, validation-aware, non-exported, and atomically settled into one canonical commit.                                                          |
| Time thresholds are brittle across hardware                            | Medium | Record pinned-browser baseline and automate scheduling/queue invariants; treat numerical profiling as evidence paired with human review.                            |

### 19.12 Approval boundary

All product decisions in this refinement addendum are approved. The next step, only when the user
explicitly authorizes implementation, is R0 followed by the ordered vertical tasks above. Until then,
this document is the implementation definition of done; no product-code, export-schema, or usage-
guide behavior is considered changed.
