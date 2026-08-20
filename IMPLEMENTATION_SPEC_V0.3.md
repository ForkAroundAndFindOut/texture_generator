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
