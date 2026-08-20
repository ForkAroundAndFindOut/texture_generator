# Texture Lab v0.2 Implementation Specification

**Status:** Implemented; automated acceptance passed on 2026-08-19, pending final human product review  
**Supersedes:** Texture Lab v0.1-lite implementation specification  
**Product target:** A local, clickable pattern-design tool for creating textured gradients from
Field and Band shapes and exporting trustworthy CSS and SVG for web design  
**Workflow boundary:** This document is the implementation authority for the lite fork. It does
not invoke or depend on Spec Kit, the Heavy orchestrator, the parent workflow ledger, or the
parent release-evidence process.

## 1. Guiding Light

Texture Lab must be a simple visual field where a designer can:

1. Add prebuilt Field and Band shapes.
2. Select shapes directly on the canvas or in the layer list.
3. Add, remove, and move Field anchors without entering an advanced drawing workflow.
4. Assign colors, opacity, blends, and texture properties.
5. Fine-tune every selected object in a robust sidebar while the design remains visible.
6. Compose those objects into a textured gradient.
7. Export the visible result as CSS and SVG for integration into a website.

The product is not done when parameters change, recipe hashes change, DOM nodes exist, or
serializer tests pass. It is done only when the user can see, manipulate, and export a coherent
design and Chromium verifies the same visible result at each stage.

## 2. Problem Statement

v0.1-lite contains useful state-management and export foundations, but it does not yet satisfy the
product promise:

- The development application is unstyled because its CSP blocks Vite's development styling and
  WebSocket connection.
- Component paths remain in normalized units and render at sub-pixel size against a canvas-space
  SVG viewBox.
- Fit is applied both by the SVG viewBox and by an inner transform.
- Grain filtering replaces rather than composites the colored source shape.
- A recipe/hash change can pass the current E2E even when the preview remains visually blank.
- The interface is a form-led parameter editor with no object hit testing, selection outline, or
  transform handles.
- Inspector drafts can disagree with the committed design after direct manipulation or Undo/Redo.
- The standalone export can contain correct strings while rendering the same blank-looking image.

v0.2 begins by repairing visual truth, then builds the clickable design workflow on top of that
truth. New UI polish must not be built on the broken v0.1 rendering contract.

## 3. Product Outcome

A first-time user opening Texture Lab at the supported desktop viewport sees a styled workspace
with a recognizable textured-gradient example. A layer rail, a large live canvas, and a
fine-tuning sidebar are visible at the same time. The user can add a Field or Band from a small
visual preset menu, click it on the canvas, drag it, edit its anchors or parameters, change its
color and blend, reorder it, and immediately see the result. SVG and CSS exports render the same
design in a clean Chromium page.

### 3.1 Primary user

A web or visual designer who understands layers, colors, opacity, and blend modes but should not
need to understand TextureRecipe, RenderIR, canonical hashes, schema validation, or editor-store
internals.

### 3.2 Primary use case

Create a reusable textured hero/background treatment in under ten minutes, then copy or download
CSS/SVG and apply it to a website.

### 3.3 Supported environment

- Local desktop application in current Chromium.
- Primary verification viewport: 1440 x 900 CSS pixels.
- Minimum simultaneous-workspace viewport: 1100 x 700 CSS pixels.
- Narrow layouts may stack or drawer the sidebars, but the desktop experience is the v0.2 release
  gate.

## 4. Scope

### 4.1 Required in v0.2

- A styled, console-clean development application at `http://localhost:5173`.
- One visually useful starter design with at least one Field and one Band.
- A small visual shape chooser with at least two distinct Field presets and two distinct Band
  presets.
- Add, select, rename, duplicate, remove, and reorder layers.
- Direct canvas selection and translation.
- Visible selected-object bounds plus scale and rotation handles.
- Basic Field anchor editing: reveal, select, drag, add, and remove anchors.
- A persistent fine-tuning sidebar for geometry, transform, color, opacity, texture, and blend.
- A layer rail that remains visible with the canvas and inspector on supported desktop viewports.
- Immediate preview updates with truthful geometry, gradients, texture, opacity, and blend.
- Undo/Redo with synchronized canvas, layer rail, and sidebar values.
- Standalone SVG download.
- Self-contained CSS download and copyable CSS code.
- Chromium verification of the running app, the edited preview, and the rendered export.
- Focused unit tests for coordinate conversion, commands, validation, history, filters, and export.

### 4.2 Explicitly excluded or deferred

- Freehand drawing and arbitrary pen-tool curves.
- Automatic repair of complex self-intersections.
- Advanced Boolean geometry and polygon-union recovery.
- Formal recipe import/export and schema-generation pipelines.
- Durable cache recovery matrices or cross-session persistence guarantees.
- Shuffle, provenance, locks, and replay.
- CMYK or other production color-space conversion.
- ZIP bundles, AI integration, and design-tool plugin integrations.
- Firefox, WebKit, or installed-channel certification.
- Formal accessibility, usability, or performance studies.
- Traceability matrices, release-evidence bureaucracy, or parent Heavy gates.

Native semantics, keyboard access for ordinary controls, and responsive behavior remain required
even though formal studies are deferred.

## 5. Product Language

The visible application must use design language, not internal architecture language.

| Internal term        | User-facing term        |
| -------------------- | ----------------------- |
| TextureRecipe        | Design                  |
| Component            | Layer or shape          |
| Canonical recipe     | Not shown in primary UI |
| Session state        | Not shown in primary UI |
| RenderIR             | Not shown               |
| Field contour anchor | Anchor                  |
| Translation X/Y      | Position X/Y            |
| Uniform scale        | Scale                   |

The following v0.1 controls must be removed from the primary shell unless they gain a real user
choice: Durable design, Canonical recipe, Session view, and Authoring session.

## 6. Workspace and Sidebar Requirements

### 6.1 Desktop layout

At 1440 x 900, the application must present three simultaneous regions beneath a compact toolbar:

1. **Layer rail:** 220-280 pixels wide.
2. **Canvas workspace:** flexible and no smaller than 520 x 420 pixels.
3. **Inspector sidebar:** 320-400 pixels wide.

The browser page itself must not require scrolling to move between the preview and inspector at the
primary viewport. The layer rail and inspector may scroll internally. The canvas must remain
visible while any inspector value is edited.

### 6.2 Layer rail

The layer rail must contain:

- Visual Add Field and Add Band actions.
- A row for every layer with a type icon or thumbnail, editable name, color chip, and selected
  state.
- Drag-and-drop reordering plus keyboard-accessible Move up/down actions.
- Duplicate and Remove actions in a row menu or clearly grouped controls.
- A visibility toggle for temporarily hiding a layer from preview and export.
- A clear top/bottom z-order convention; the highest visible row must correspond to the frontmost
  layer.

Multi-select is not required in v0.2. `Select All` must be removed unless genuine bulk editing is
implemented and verified.

### 6.3 Canvas workspace

The canvas must contain:

- The complete current design, fit to the available workspace without double scaling.
- A neutral surround that distinguishes the design bounds from the application background.
- A transparency grid when the canvas background opacity is below 1.
- Clickable layer geometry with a selected outline.
- Scale and rotation handles for the selected layer.
- Anchor handles and paths when a selected Field is in anchor-edit mode.
- Fit, 100%, Zoom in, and Zoom out controls.
- A concise empty-state message when all layers are removed or hidden.

### 6.4 Fine-tuning inspector sidebar

The inspector is a first-class editing surface, not a fallback parameter dump. Its header must show
the selected layer's name, type, color chip, and layer actions. Its sections must be grouped in this
order:

1. **Geometry**
   - Field preset/name and anchor count.
   - Enter/exit anchor-edit mode.
   - Add anchor and Remove selected anchor.
   - Band preset and simple width/taper/end-cap options where supported.
2. **Transform**
   - Position X and Y.
   - Width and Height.
   - Rotation in degrees.
   - Scale.
   - Reset transform.
3. **Color and texture**
   - Color picker and editable canonical hex text.
   - Opacity slider plus numeric value.
   - Softness slider plus numeric value.
   - Grain slider plus numeric value.
   - Blend mode.
4. **Canvas**
   - Canvas color and opacity.
   - Canvas dimensions displayed read-only in v0.2 unless dimension editing is implemented
     completely.

Requirements for every inspector field:

- The label, unit, valid range, and current committed value are visible.
- Slider and numeric representations remain synchronized.
- Direct canvas manipulation updates the corresponding field immediately.
- Undo/Redo updates the field immediately.
- Invalid text never masquerades as committed state.
- A rejected value receives inline feedback and returns to the last valid value on blur or Escape.
- Sections may collapse, but Transform and Color and texture are open by default.

## 7. State and Rendering Contracts

### 7.1 Authoritative design state

- `TextureRecipe` may remain the authoritative content model.
- Selection, active handle, open sidebar section, zoom, hover, validation drafts, and pointer gesture
  state are UI state and must not be serialized into the design.
- The UI must never display a stale draft as if it were the committed design.
- One finished drag, slider gesture, or anchor drag creates one Undo transaction.

### 7.2 Coordinate-space contract

The coordinate contract must be explicit and unit tested:

- Recipe component positions and sizes remain normalized to the source canvas where practical.
- Field/Band factory geometry may remain in normalized local coordinates.
- `compileRenderIR` must convert component geometry into source-canvas coordinates exactly once.
- RenderIR paths consumed by DOM and export renderers must use the same source-canvas coordinate
  space as `RenderIR.canvas`.
- The SVG `viewBox` performs source-canvas-to-viewport fitting.
- No inner fit matrix may repeat the viewBox's fit operation.
- Direct-manipulation pointer deltas must be converted from CSS pixels through the current zoom and
  view transform back into normalized design coordinates.

For the default 1200 x 800 design rendered at 720 x 480, the base and viewBox content must occupy
720 x 480 CSS pixels at Fit view, not 432 x 288.

### 7.3 Gradient and texture contract

- A Field must render as a closed colored area with a soft radial or shape-aware fade toward its
  boundary.
- A Band must render as a colored ribbon with a soft cross-axis fade and its configured end caps.
- Opacity must multiply the layer result once.
- Blend mode must affect the composed preview and export identically.
- Grain must be an optional overlay/composite on `SourceGraphic`; it must never replace the source
  color or make a nonzero-grain layer disappear.
- A control may not be exposed unless changing it produces a visible, deterministic result.
- Highlight and asymmetry may remain hidden in v0.2 unless their visible behavior is implemented
  and tested.

### 7.4 Development and production styling contract

- `npm run dev` at port 5173 must load the complete stylesheet.
- Development HMR/WebSocket behavior must not be blocked by the effective CSP.
- Production output must retain a restrictive CSP appropriate to its actual asset loading.
- Neither environment may require broadly allowing arbitrary remote scripts or objects.
- Zero browser console errors and zero page errors are required in both development and built
  Chromium journeys.

### 7.5 Validation contract

- UI constraints and domain constraints must agree.
- Inputs outside the supported range are either clamped before preview or rejected with a visible
  message; silent zero-change rejection is forbidden.
- Anchor count must stay within 3-32 for v0.2.
- Removing an anchor at the minimum count must disable the action and explain why.
- Complex self-intersections may be rejected without repair, but the user must keep the last valid
  design and receive a concise explanation.

## 8. Clickable Pattern-Tool Requirements and Pass Gates

No category may be averaged away. v0.2 passes only when all nine categories meet their hard gate.
The score is an implementation review shorthand, not a substitute for the stated evidence.

### 8.1 Visual appeal — target 4/5 or better

#### Requirements

- Use a coherent neutral design system: typography, spacing, surfaces, borders, focus states, and
  accent color.
- Make the canvas the visual center of gravity.
- Show a compelling starter texture on first paint.
- Style all controls intentionally; no browser-default layout should dominate the page.
- Use shape thumbnails, color chips, selected outlines, and handles to communicate the design.

#### Done when

- Chromium at 1440 x 900 shows the layer rail, full canvas, and inspector in one screenshot.
- No text overlaps, clipped controls, unintended page scroll, unstyled regions, or blank design are
  visible.
- A reviewed baseline screenshot is stored with the Chromium E2E and passes
  `toHaveScreenshot` at the fixed verification viewport.
- The screenshot contains multiple visibly distinct design colors in addition to the application
  chrome and canvas background.

### 8.2 Discoverability — target 4/5 or better

#### Requirements

- Open with a useful design and one selected layer.
- Present Add Field and Add Band as visual, labeled choices.
- Use familiar labels: Layers, Inspector, Transform, Color, Opacity, Blend, Anchors, Export.
- Show a brief contextual hint for first use: select a shape, drag it, or edit it in the sidebar.
- Give immediate selected, hover, disabled, and validation feedback.

#### Done when

- A new user can identify how to add a shape, select it, change its color, and export without
  opening documentation.
- The exact Chromium journey completes using visible names and roles, without CSS selectors tied to
  internal IDs except for geometry assertions.
- Empty, loading, invalid, and no-selection states each provide a next action.

### 8.3 Direct manipulation — target 4/5 or better

#### Requirements

- Clicking visible Field or Band geometry selects that layer.
- Clicking empty canvas clears selection unless an active tool requires otherwise.
- Dragging selected geometry translates it.
- Scale and rotation handles modify the selected shape with a live outline.
- Anchor-edit mode shows Field anchors; anchors can be dragged and inserted on a segment.
- Pointer gestures use capture and remain one Undo transaction.

#### Done when

- Chromium clicks the visual center of a Band and the correct layer row and inspector become
  selected.
- A 60-pixel drag moves the rendered geometry in the same direction by a visibly corresponding
  amount and updates Position X/Y.
- Scaling and rotating through handles update canvas and sidebar continuously and Undo once each.
- Adding and dragging a Field anchor visibly changes the Field while preserving a valid closed
  path.

### 8.4 Layer composability — target 4/5 or better

#### Requirements

- Add, rename, duplicate, remove, hide/show, and reorder Field/Band layers.
- Keep selected identity stable through reorder.
- Make z-order visually obvious.
- Apply blend and opacity per layer.
- Keep Undo/Redo coherent for every layer command.

#### Done when

- A browser journey builds at least four layers, reorders the selected Band, hides a Field,
  duplicates the Band, removes the duplicate, and undoes the removal.
- Canvas hit testing, layer-row selection, and exported layer order agree after every operation.
- Hiding a layer removes it from preview and export without deleting it; showing it restores the
  same values.

### 8.5 Transform usability — target 4/5 or better

#### Requirements

- Provide direct handles and precise sidebar values for position, width, height, rotation, and
  scale.
- Show degrees for rotation and normalized or percentage units for applicable values.
- Keep canvas changes and fields bidirectionally synchronized.
- Provide Reset transform.
- Preserve sensible aspect behavior while scaling; explicit width/height edits may change aspect.

#### Done when

- Editing each transform field causes a visible, expected change.
- Direct dragging/handles update the matching committed numeric values.
- Undo/Redo, Reset, and selection changes never leave stale drafts.
- Invalid values show feedback and cannot remain displayed as if committed.

### 8.6 Color and blend experimentation — target 4/5 or better

#### Requirements

- Provide a color picker plus editable hex value.
- Provide synchronized opacity, softness, and grain controls.
- Provide Normal, Multiply, Screen, Overlay, and Soft light blend modes.
- Render each effect live and identically in export.
- Include at least six useful color swatches derived from the starter design; choosing one assigns
  it to the selected layer without introducing a formal palette-management workflow.

#### Done when

- Changing color produces a measurable preview pixel change and a visible color change.
- Every blend option produces either a distinct visible result for the acceptance fixture or is
  removed from the v0.2 UI.
- Grain at 0 and at a nonzero value both retain the source shape and color.
- Exported SVG and CSS preserve selected color, opacity, blend, softness, and grain semantics.

### 8.7 Preview fidelity — target 5/5

#### Requirements

- Preview must be a truthful rendering of the committed design plus the current valid gesture
  draft.
- Geometry must occupy meaningful canvas area.
- Layer order, gradients, opacity, texture, and blend must match export.
- Preview status must report real rendering/validation failure, never permanent decorative Ready.
- Resize and zoom may change presentation but never the design.

#### Done when

- Every visible non-base acceptance layer has a canvas bounding box of at least 20 x 20 CSS pixels.
- The base occupies the expected canvas bounds at Fit view.
- Color, transform, layer-order, anchor, and blend edits each produce a visible screenshot
  difference.
- No acceptance relies only on a recipe hash, DOM existence, or attribute string.
- The E2E opens the exported SVG in Chromium and verifies visual parity with the preview at the same
  dimensions.

### 8.8 Export trust — target 5/5

#### Requirements

- Export standalone, script-free SVG with deterministic layer order and definitions.
- Export self-contained CSS using an encoded SVG data URL.
- Let the user copy CSS and download CSS/SVG.
- Show filename, dimensions, and a small export preview or status before/after download.
- Use the same compiled visual model as preview without applying fit or effects twice.

#### Done when

- Downloaded SVG opens directly in a fresh Chromium page and visibly matches the app preview.
- CSS applied to a clean fixture element visibly matches the same preview.
- Export contains no scripts, remote resources, broken fragment references, or missing filters.
- Color, opacity, blend, layer order, dimensions, and visibility state match the current design.
- Export tests include rendered-pixel or screenshot evidence, not string assertions alone.

### 8.9 Willingness to keep exploring — target 4/5 or better

#### Requirements

- Start with a visually interesting design rather than an empty or blank canvas.
- Offer at least four visual presets across Field and Band.
- Make adding, duplicating, recoloring, reordering, and Undo feel immediate and safe.
- Keep advanced controls out of the way until a layer is selected.
- Use concise, encouraging contextual copy without architecture jargon.

#### Done when

- In the acceptance journey, the user can produce three visibly distinct compositions from the
  starter design without reloading or reading external documentation.
- Preset thumbnails visibly resemble the shapes they create.
- Remove, Reset, and experimental edits are safely recoverable through Undo.
- No primary action leads to a blank-looking design without a clear explanation and recovery path.

## 9. Detailed Functional Requirements

### 9.1 Startup and starter design

- Start with one selected Field and one Band.
- The starter Field and Band must render visibly at first paint.
- The starter design must use at least two layer colors and one non-Normal blend that is visibly
  useful in the fixture.
- Starter grain may be nonzero only after the filter-compositing requirement passes.

### 9.2 Shape presets

- Minimum Field presets: Soft blob and Wide pool.
- Minimum Band presets: Sweep and Ribbon.
- Each preset tile includes a deterministic SVG thumbnail, name, and type.
- Adding a preset creates fresh component and anchor IDs and selects the new layer.
- A preset is a starting shape, not a linked template; later edits are local to that layer.

### 9.3 Field anchors

- A selected Field can enter anchor-edit mode from the inspector or a canvas toolbar action.
- Existing anchors render as visible, clickable handles.
- Clicking a segment inserts an anchor at the nearest valid point.
- Dragging an anchor previews continuously and commits on release.
- Delete/Backspace or the sidebar Remove anchor action removes the selected anchor when more than
  three remain.
- Escape cancels the active anchor gesture and restores the prior geometry.
- v0.2 does not promise automatic repair of a self-intersecting result; it preserves the last valid
  design and shows an inline message.

### 9.4 Band geometry

- Band remains a simple parametric ribbon in v0.2.
- Width, taper, end cap, transform, softness, and color are editable where rendering support exists.
- Band does not expose arbitrary path anchors in v0.2.

### 9.5 Selection and history

- Exactly zero or one layer is selected in v0.2.
- Add and Duplicate select the created layer.
- Remove selects the nearest remaining layer or clears selection if none remain.
- Reorder, visibility, rename, transform, color, anchor, and canvas edits are undoable.
- Undo/Redo update all visible projections: canvas, rows, inspector, export preview, and generated
  text.

### 9.6 Error and status behavior

- Console errors are never used as user feedback.
- Invalid field values show a message adjacent to that field.
- Rendering failure replaces the design with a bounded error state and a recovery action; it must
  not silently render only the base.
- Export is disabled with a reason when the design cannot compile.
- Successful download/copy status names the format and remains visible without moving the layout.

## 10. Architecture and Reuse Plan

### 10.1 Reuse with minimal or no change

- `src/editor/state/history.ts`
- `src/editor/state/reducer.ts`
- Validated add, duplicate, remove, reorder, and transform command foundations in
  `src/editor/state/componentCommands.ts`
- `src/editor/state/colorCommands.ts`
- Stable ID helpers in `src/domain/recipe/ids.ts`
- Recipe normalization and hashing where they do not leak into UI terminology
- `src/export/browserDownload.ts`
- Existing focused command/history/color unit tests after updating fixtures where needed

### 10.2 Reuse only after contract fixes

- Field and Band geometry factories.
- `compileRenderIR` and RenderIR types.
- DOM SVG renderer.
- SVG and CSS serializers.
- Preview gesture coordination.
- Default recipe and component templates.

### 10.3 Rebuild or substantially restructure

- The application layout and design tokens.
- Preview coordinate conversion and fit behavior.
- SVG gradient/fade/grain definitions.
- Canvas hit testing and selected-object overlay.
- Inspector field/draft synchronization.
- Layer rail interaction design.
- Export UI and visual-parity verification.
- Chromium E2E assertions.

### 10.4 Remove or hide

- Durable/session selector UI.
- Architecture-oriented help text.
- `Select All` without bulk editing.
- Highlight and asymmetry controls until visibly implemented.
- Any appearance control whose acceptance fixture shows no pixel difference.

## 11. Implementation Process

Implementation must follow the milestone order. High-risk rendering truth is first. A milestone is
not complete when code exists; its user-visible acceptance check must pass in Chromium.

### Milestone 1: Restore visual truth

**User-visible result:** The running development app is styled and the default Field and Band are
clearly visible at the correct canvas size.

#### Task 1.1: Define and enforce the coordinate contract

**Description:** Convert normalized component geometry into source-canvas RenderIR coordinates
exactly once and remove duplicate fitting.

**Acceptance criteria:**

- Default Field and Band each render with a browser bounding box greater than 20 x 20 pixels.
- At Fit view, the 1200 x 800 base occupies the complete 720 x 480 preview.
- DOM and serialized SVG use identical canvas-space geometry.

**Verification:** Focused RenderIR unit tests plus Chromium geometry assertions.

**Dependencies:** None.

**Files likely touched:**

- `src/renderers/shared/ir.ts`
- `src/renderers/shared/compileRenderIR.ts`
- `src/renderers/dom-svg/DomSvgRenderer.tsx`
- `src/renderers/svg/serializeSvg.ts`
- `tests/unit/export/serializers.test.ts`

**Estimated scope:** Medium.

#### Task 1.2: Implement visible fades and safe grain composition

**Description:** Render Field/Band gradient fades and composite grain over SourceGraphic.

**Acceptance criteria:**

- Field and Band retain their assigned colors with grain both zero and nonzero.
- Softness changes the visible edge fade.
- DOM preview and serialized SVG share the same gradient/filter semantics.

**Verification:** Renderer unit tests and fixed Chromium screenshots for grain 0/nonzero.

**Dependencies:** Task 1.1.

**Files likely touched:**

- `src/renderers/shared/compileRenderIR.ts`
- `src/renderers/shared/ir.ts`
- `src/renderers/dom-svg/DomSvgRenderer.tsx`
- `src/renderers/svg/serializeSvg.ts`
- `tests/unit/export/serializers.test.ts`

**Estimated scope:** Medium.

#### Task 1.3: Make development styling and CSP compatible

**Description:** Ensure Vite development and the production build load their required styles and
connections without weakening unrelated policy.

**Acceptance criteria:**

- Port 5173 renders the complete layout stylesheet.
- Development and production Chromium report zero console/page errors.
- Production CSP remains restrictive and contains no unintended remote allowance.

**Verification:** Direct Chromium visit to port 5173 and built static fixture.

**Dependencies:** None.

**Files likely touched:**

- `index.html`
- `vite.config.ts`
- `src/app/styles/layout.css`
- `tests/e2e/lite-authoring-export.spec.ts`

**Estimated scope:** Small.

#### Checkpoint 1

- The starter texture is visibly recognizable.
- Preview geometry and base bounds pass browser assertions.
- Both development and production app shells are styled and console-clean.
- No sidebar or direct-manipulation expansion begins until this checkpoint passes.

### Milestone 2: Build the simultaneous design workspace

**User-visible result:** Layer rail, canvas, and robust inspector are visible and usable at the same
time.

#### Task 2.1: Restructure the desktop workspace

**Description:** Replace the document-like v0.1 page with the toolbar, layer rail, canvas, and
inspector layout defined in Section 6.

**Acceptance criteria:**

- All three regions are visible at 1440 x 900 and at 1100 x 700.
- The browser page does not scroll to move between canvas and inspector at 1440 x 900.
- The canvas remains at least 520 x 420 at the primary viewport.

**Verification:** Responsive Chromium screenshots at both supported viewports.

**Dependencies:** Checkpoint 1.

**Files likely touched:**

- `src/app/App.tsx`
- `src/app/layout/EditorLayout.tsx`
- `src/app/styles/layout.css`
- `src/app/panels/ViewTabs.tsx`
- `tests/e2e/lite-authoring-export.spec.ts`

**Estimated scope:** Medium.

#### Task 2.2: Build the inspector information architecture

**Description:** Organize selected-layer geometry, transform, color/texture, and canvas controls in
one persistent sidebar.

**Acceptance criteria:**

- Selecting a Field or Band shows only applicable controls and all required shared controls.
- Transform and Color and texture are open by default.
- No visible control is inert or produces no visual change in its acceptance fixture.

**Verification:** Component/view-model unit tests plus manual Chromium inspection.

**Dependencies:** Task 2.1.

**Files likely touched:**

- `src/app/panels/ComponentInspector.tsx`
- `src/app/panels/ColorControls.tsx`
- `src/app/App.tsx`
- `src/app/styles/layout.css`
- `src/app/index.ts`

**Estimated scope:** Medium.

#### Checkpoint 2

- The layout satisfies Visual appeal and Discoverability screenshot gates.
- A selected starter layer can be edited without the canvas leaving view.
- Internal recipe/session terminology is absent from the primary interface.

### Milestone 3: Make selection and transforms truly clickable

**User-visible result:** Shapes can be selected and transformed on the canvas while the inspector
stays synchronized.

#### Task 3.1: Add canvas hit testing and selected-object overlay

**Description:** Map visible SVG geometry to layer selection and render a non-exported overlay with
bounds and handles.

**Acceptance criteria:**

- Clicking overlapping shapes selects the frontmost visible hit.
- Layer row and canvas selection always agree.
- Selection overlay never appears in SVG/CSS export.

**Verification:** Chromium click targets plus focused overlay/hit-test unit tests.

**Dependencies:** Checkpoint 2.

**Files likely touched:**

- `src/app/components/PreviewSurface.tsx`
- `src/app/components/SelectionOverlay.tsx`
- `src/app/session/useLiteEditor.ts`
- `src/renderers/dom-svg/DomSvgRenderer.tsx`
- `tests/e2e/lite-authoring-export.spec.ts`

**Estimated scope:** Medium.

#### Task 3.2: Implement translate, scale, and rotate gestures

**Description:** Convert pointer movement through the active viewport transform and commit one
history entry per finished gesture.

**Acceptance criteria:**

- Drag, scale, and rotation handles move predictably in canvas space.
- Sidebar transform values update during and after gestures.
- One Undo reverses one complete gesture.

**Verification:** Pointer-coordinate unit tests and Chromium gesture journey.

**Dependencies:** Task 3.1.

**Files likely touched:**

- `src/app/components/SelectionOverlay.tsx`
- `src/app/components/PreviewSurface.tsx`
- `src/app/session/useLiteEditor.ts`
- `src/editor/interactions/interactionCoordinator.ts`
- `tests/unit/editor/componentCommands.test.ts`

**Estimated scope:** Medium.

#### Task 3.3: Repair inspector drafts and validation feedback

**Description:** Separate editable text drafts from committed values and synchronize fields after
external design changes.

**Acceptance criteria:**

- Undo/Redo and canvas gestures immediately update every matching field.
- Invalid values show inline feedback and cannot remain displayed as committed.
- Escape cancels a draft; blur restores or commits according to validity.

**Verification:** Focused view-model unit tests plus the exact stale-Undo and invalid-rotation
Chromium regressions.

**Dependencies:** Task 3.2.

**Files likely touched:**

- `src/app/panels/ComponentInspector.tsx`
- `src/app/session/useLiteEditor.ts`
- `src/editor/state/componentCommands.ts`
- `tests/unit/editor/componentCommands.test.ts`
- `tests/e2e/lite-authoring-export.spec.ts`

**Estimated scope:** Medium.

#### Checkpoint 3

- Direct manipulation and Transform usability hard gates pass.
- The sidebar never disagrees with the current design after Undo/Redo.
- Invalid values cannot silently fail.

### Milestone 4: Complete shape, anchor, layer, and color authoring

**User-visible result:** The user can build and experiment with a layered textured gradient rather
than merely adjust a starter fixture.

#### Task 4.1: Add visual Field/Band presets

**Description:** Replace plain Add buttons with a compact visual chooser backed by deterministic
templates.

**Acceptance criteria:**

- At least two Field and two Band presets have accurate thumbnails.
- Adding a preset creates fresh IDs, selects it, and renders it visibly.
- Presets are visually distinct at their default transforms.

**Verification:** Template unit tests and Chromium thumbnail-to-created-shape journey.

**Dependencies:** Checkpoint 3.

**Files likely touched:**

- `src/app/session/componentTemplates.ts`
- `src/app/panels/ShapePicker.tsx`
- `src/app/App.tsx`
- `src/app/styles/layout.css`
- `tests/unit/domain/geometry/basicComponents.test.ts`

**Estimated scope:** Medium.

#### Task 4.2: Implement basic Field anchor editing

**Description:** Add explicit anchor commands and a canvas overlay for reveal/select/insert/drag/
remove within the bounded v0.2 geometry rules.

**Acceptance criteria:**

- Insert, drag, remove, cancel, Undo, and Redo preserve valid anchor identities and closed paths.
- Minimum/maximum counts are enforced with user feedback.
- Invalid self-intersection keeps the last valid design without an automatic-repair promise.

**Verification:** Anchor-command unit tests and one Chromium anchor-edit journey.

**Dependencies:** Task 4.1.

**Files likely touched:**

- `src/editor/state/anchorCommands.ts`
- `src/app/components/AnchorOverlay.tsx`
- `src/app/session/useLiteEditor.ts`
- `src/app/panels/ComponentInspector.tsx`
- `tests/unit/editor/anchorCommands.test.ts`

**Estimated scope:** Medium.

#### Task 4.3: Finish layer rail and color/blend experimentation

**Description:** Add visual layer rows, visibility, rename, drag reorder, color chips/swatches, and
truthful opacity/softness/grain/blend controls.

**Acceptance criteria:**

- Layer operations preserve selection and match canvas/export order.
- Each exposed appearance control produces a visible result.
- Visibility is undoable and respected by preview/export.

**Verification:** Command unit tests and the four-layer Chromium composition journey.

**Dependencies:** Tasks 4.1 and 4.2.

**Files likely touched:**

- `src/app/panels/ComponentListPanel.tsx`
- `src/app/panels/ColorControls.tsx`
- `src/app/session/useLiteEditor.ts`
- `src/editor/state/componentCommands.ts`
- `tests/unit/editor/componentCommands.test.ts`

**Estimated scope:** Medium.

#### Checkpoint 4

- Layer composability and Color and blend experimentation hard gates pass.
- The user can create three clearly different compositions from the starter design.
- Basic Field anchor editing works without importing the advanced freeform recovery stack.

### Milestone 5: Make export visually trustworthy

**User-visible result:** SVG and CSS downloads visibly match the canvas and are ready for web use.

#### Task 5.1: Unify preview and export semantics

**Description:** Ensure both renderers consume the same corrected canvas-space IR and equivalent
gradient/filter definitions.

**Acceptance criteria:**

- Layer order, visibility, geometry, gradients, color, opacity, blend, and grain match.
- Fit is applied exactly once in preview and export.
- Export has no overlay/selection UI.

**Verification:** Serializer unit tests plus side-by-side Chromium screenshots.

**Dependencies:** Checkpoint 4.

**Files likely touched:**

- `src/renderers/shared/compileRenderIR.ts`
- `src/renderers/dom-svg/DomSvgRenderer.tsx`
- `src/renderers/svg/serializeSvg.ts`
- `src/renderers/web/serializeCss.ts`
- `tests/unit/export/serializers.test.ts`

**Estimated scope:** Medium.

#### Task 5.2: Build a designer-facing export surface

**Description:** Provide download and copy actions, filenames/dimensions, code preview, and stable
status without replacing the canvas.

**Acceptance criteria:**

- Download SVG, Download CSS, and Copy CSS are visible and labeled.
- Export status identifies the completed action without shifting layout.
- CSS selector and dimensions shown to the user match the generated files.

**Verification:** Chromium download/clipboard journey and focused exporter tests.

**Dependencies:** Task 5.1.

**Files likely touched:**

- `src/app/panels/ExportPanel.tsx`
- `src/export/browserDownload.ts`
- `src/renderers/web/serializeCss.ts`
- `src/app/styles/layout.css`
- `tests/e2e/lite-authoring-export.spec.ts`

**Estimated scope:** Small.

#### Task 5.3: Render-test downloaded artifacts

**Description:** Open the actual downloaded SVG and apply downloaded CSS to a clean fixture in the
same Chromium run.

**Acceptance criteria:**

- SVG and CSS fixture screenshots match the preview within an explicitly documented small pixel
  tolerance.
- Every acceptance layer has visible non-base pixels in both formats.
- No remote requests, scripts, console errors, or broken SVG references occur.

**Verification:** Chromium E2E only; string assertions are supplementary.

**Dependencies:** Tasks 5.1 and 5.2.

**Files likely touched:**

- `tests/e2e/lite-authoring-export.spec.ts`
- `tests/e2e/fixtures/export-host.html`
- `playwright.config.ts`
- `package.json`

**Estimated scope:** Small.

#### Checkpoint 5

- Preview fidelity and Export trust hard gates pass at 5/5.
- Downloaded artifacts are visibly usable, not merely syntactically valid.

### Milestone 6: Product polish and focused verification

**User-visible result:** The complete ten-minute authoring journey is coherent, recoverable, and
invites continued experimentation.

#### Task 6.1: Complete product copy and states

**Description:** Replace internal terminology, add concise contextual guidance, and complete empty,
no-selection, invalid, and export states.

**Acceptance criteria:**

- Primary UI contains no unexplained recipe/RenderIR/session terminology.
- Every empty or blocked state presents a recovery action.
- Preset, layer, canvas, inspector, and export labels are consistent.

**Verification:** Source text audit and Chromium state screenshots.

**Dependencies:** Checkpoint 5.

**Files likely touched:**

- `src/app/App.tsx`
- `src/app/layout/EditorLayout.tsx`
- `src/app/panels/ComponentListPanel.tsx`
- `src/app/panels/ComponentInspector.tsx`
- `src/app/panels/ExportPanel.tsx`

**Estimated scope:** Medium.

#### Task 6.2: Consolidate the focused verification matrix

**Description:** Keep the suite small but make browser-visible truth non-negotiable.

**Acceptance criteria:**

- Unit tests cover commands/contracts rather than UI implementation details.
- Two or fewer Chromium files cover startup/style, authoring/direct manipulation, anchors, and
  rendered export parity.
- `npm run check` runs typecheck, unit tests, production build, and Chromium without skipped
  required tests.

**Verification:** Clean `npm run check` plus a direct port-5173 Chromium smoke command.

**Dependencies:** Task 6.1.

**Files likely touched:**

- `tests/e2e/lite-authoring-export.spec.ts`
- `tests/unit/editor/anchorCommands.test.ts`
- `tests/unit/export/serializers.test.ts`
- `playwright.config.ts`
- `package.json`

**Estimated scope:** Medium.

#### Checkpoint 6: Release candidate

- All nine Clickable pattern-tool gates pass independently.
- The exact journey in Section 12 passes against port 5173 and the production build.
- No open blocking or major failure remains from the v0.1 forensic audit.
- A human reviews the fixed 1440 x 900 screenshot and exported SVG/CSS result.

## 12. Required Chromium Acceptance Journey

The release journey must operate through user-visible roles and labels:

1. Open the app and see a styled, nonblank starter texture with one selected layer.
2. Open Add shape and add a Field preset.
3. Add a Band preset.
4. Click each new shape on the canvas and confirm layer-row/sidebar selection follows.
5. Drag the Band, scale it, and rotate it with canvas handles.
6. Fine-tune Position, Width, Height, Rotation, and Scale in the persistent inspector while the
   canvas remains visible.
7. Change color, opacity, softness, grain, and blend; verify a visible pixel change after each
   exposed control.
8. Enter Field anchor mode, insert one anchor, drag it, and Undo/Redo the edit.
9. Rename, reorder, hide/show, duplicate, remove, and Undo a layer operation.
10. Enter an invalid rotation and verify inline feedback plus restoration of the valid committed
    value.
11. Undo and Redo a transform and verify canvas and sidebar values both restore.
12. Download SVG and CSS and copy CSS.
13. Open the downloaded SVG in Chromium.
14. Apply the downloaded CSS to a clean fixture element.
15. Verify preview, SVG, and CSS fixtures visibly match, contain all visible layers, and produce no
    console/page errors.

The journey must assert both state and appearance. Recipe hash changes may be recorded for
diagnostics but cannot satisfy a visual assertion.

## 13. Focused Test Matrix

### 13.1 Unit tests

Required focused coverage:

- Normalized geometry to canvas-space conversion.
- Fit applied exactly once.
- Field/Band path bounds and deterministic presets.
- SourceGraphic-preserving gradient/grain definitions.
- Add, duplicate, remove, reorder, visibility, rename, and transform commands.
- Anchor insert, drag, remove, invalid-result rejection, and stable IDs.
- One history transaction per pointer/slider/anchor gesture.
- Draft parsing, validation, cancellation, and committed-value synchronization.
- Deterministic SVG/CSS output and safe escaping.

### 13.2 Chromium tests

Required browser evidence:

- Development stylesheet and CSP smoke at port 5173.
- Fixed desktop workspace screenshot.
- Component geometry bounding boxes.
- Canvas hit testing and gesture behavior.
- Inspector/Undo/Redo synchronization.
- Anchor editing.
- Visible differences for each exposed appearance control.
- Real downloads rendered in fresh pages/fixtures.
- Zero console and page errors.

### 13.3 Forbidden weak proxies

The following may supplement but never replace visible acceptance:

- `toBeVisible()` on the preview container.
- Recipe hash changed.
- SVG contains a fill string.
- CSS contains a data URL.
- Layer IDs appear in order.
- Build completed.

## 14. Definition of Done

v0.2 is done only when all conditions below are true:

### Product

- A designer can see and modify the design simultaneously at the supported desktop viewport.
- Field and Band presets render visibly and accurately.
- Basic Field anchors are directly editable.
- The layer rail, canvas selection, and inspector always agree.
- Every exposed transform, color, texture, and blend control has an observable effect.
- Undo/Redo restores both design and displayed values.
- Invalid inputs never appear committed without feedback.
- SVG and CSS exports visibly match the preview.

### Clickable pattern-tool scorecard

| Category                      | Required score | Hard-gate status before release |
| ----------------------------- | -------------: | ------------------------------- |
| Visual appeal                 |            4/5 | Must pass                       |
| Discoverability               |            4/5 | Must pass                       |
| Direct manipulation           |            4/5 | Must pass                       |
| Layer composability           |            4/5 | Must pass                       |
| Transform usability           |            4/5 | Must pass                       |
| Color/blend experimentation   |            4/5 | Must pass                       |
| Preview fidelity              |            5/5 | Must pass                       |
| Export trust                  |            5/5 | Must pass                       |
| Willingness to keep exploring |            4/5 | Must pass                       |

No average score, test count, or implementation percentage can compensate for a failed category.

### Engineering

- `npm run typecheck` passes.
- Focused unit tests pass with no skipped required test.
- Production build succeeds.
- Chromium acceptance passes against development and production surfaces.
- Browser console/page error collections are empty.
- Required screenshots and rendered-export comparisons pass.
- No runtime dependency reaches the parent Spec Kit/Heavy workflow, advanced freeform recovery,
  CMYK, ZIP/AI, shuffle/provenance, cache-recovery, or traceability surfaces.

### Review

- The implementation owner supplies the final fixed workspace screenshot, exported SVG, and CSS
  fixture result for human review.
- Any known limitation is listed explicitly and does not violate a hard gate.
- The user approves implementation completion; green tests alone do not declare product completion.

## 15. Risks and Mitigations

| Risk                                           | Impact                            | Mitigation                                                               |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| UI work begins before renderer truth is fixed  | Polished blank tool               | Milestone 1 is a blocking checkpoint                                     |
| Normalized/canvas coordinates drift again      | Tiny or misplaced exports         | One explicit contract and shared browser assertions                      |
| Filters diverge between DOM and serialized SVG | Preview/export mismatch           | Shared filter model plus rendered-export E2E                             |
| Inspector drafts become a second design state  | Stale or misleading values        | Separate draft adapter, synchronization tests, inline validation         |
| Direct manipulation destabilizes history       | Excess Undo entries or lost edits | One interaction group per pointer gesture                                |
| Anchor editing expands into advanced freeform  | Scope and stability loss          | Bounded insertion/drag/removal only; reject invalid complex results      |
| Visual regression becomes brittle              | Noisy test suite                  | Fixed viewport/fonts/animations and a small set of intentional baselines |
| More controls hide lack of visible quality     | Parameter-form relapse            | No control ships without a visible acceptance fixture                    |

## 16. Approval Boundary

This specification was an approval gate. v0.2 implementation proceeded in the milestone order above
after authorization for this task. Passing the automated gates records implementation completion; it
does not replace the final human review required by Section 14.

## 17. Verified Implementation Record — 2026-08-19

The following records what is actually present in this workspace, rather than a future-plan claim.

| Milestone                         | Verified implementation result                                                                                                                                                                                      | Evidence                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Visual truth                   | Normalized geometry is resolved to canvas space exactly once; preview and serialized SVG share gradient and grain composition semantics; development CSP permits Vite styling while production remains restrictive. | Renderer unit tests; development Chromium surface check; production build.                                                          |
| 2. Simultaneous workspace         | A bounded desktop three-column workspace keeps presets/layers, live canvas, and a scrollable fine-tuning inspector visible together at 1440 × 900.                                                                  | `tests/e2e/lite-authoring-export.spec.ts-snapshots/texture-lab-workspace-chromium-win32.png`.                                       |
| 3. Clickable editing              | Canvas hit selection, empty-canvas deselection, direct translate/scale/rotate, bounded Field anchor drag, and contour-segment insertion all operate through one editor/history state.                               | Chromium authoring journey and focused command tests.                                                                               |
| 4. Layer and appearance authoring | Four visual Field/Band presets, add/rename/duplicate/remove/hide/show/reorder, six starter-derived quick colors, opacity, texture, taper/end-cap, and all five blend modes are available in the live workspace.     | Pixel-changing Chromium assertions plus unit command coverage.                                                                      |
| 5. Export trust                   | SVG and CSS downloads/copy are produced from the same render IR; the journey loads both assets into fresh Chromium fixtures and verifies non-base rendered pixels.                                                  | Download, fixture, script-free SVG, and rendered-pixel assertions in the Chromium journey.                                          |
| 6. Quality gate                   | Type checking, unit tests, lint, formatting, production build, and the two-test Chromium suite all pass.                                                                                                            | `npm run typecheck`; `npm test` (9 files, 44 tests); `npm run lint`; `npm run format:check`; `npm run test:e2e` (2 Chromium tests). |

The intentionally deferred items in Section 4.2 remain excluded: advanced freeform recovery,
recipe/schema-generation pipelines, cache-recovery matrices, shuffle provenance/replay, CMYK,
ZIP/AI integration, multi-browser certification, formal accessibility/usability studies, performance
certification, and traceability/release-evidence bureaucracy.

The remaining non-automated gate is the deliberate Section 14 human product review of the fixed
workspace screenshot and the exported SVG/CSS fixture behavior. It is not represented as an
engineering failure or silently waived.
