# Texture Lab v0.3.2 — Boundary Point Drag Reliability Specification

**Status:** Product-approved implementation specification  
**Date:** 2026-08-22  
**Applies to:** Texture Lab v0.3.2 Boundary point editing  
**Implementation boundary:** This document defines the approved repair and its acceptance gates. It does not itself authorize implementation.

## Release boundary

This repair is the complete product scope of **v0.3.2**. The implementation must update the
package and lockfile version to `0.3.2` as part of the release work, without changing the v0.3.1
Scene schema or export compatibility boundary.

The release candidate is finalized on the Git `staging` branch, then tested locally from the exact
staging commit. As observed on 2026-08-22, this clone has no local or remote `staging` ref; creating
and pushing that branch is a later release action, not work performed by this specification.

## 1. Product outcome

Boundary point editing must behave as direct manipulation: press and hold a point, move it, and
release to plant it. A point must remain owned by that gesture even when the pointer travels faster
than the browser can paint, leaves the small point target, or leaves the visible artboard.

The author must never have to move slowly merely to keep a point attached to the pointer.

## 2. Approved interaction contract

### 2.1 Press, select, and drag

1. Pressing a Boundary point selects it.
2. Movement remains a selection-only press until the pointer moves at least **4 CSS pixels** from
   its press position. This prevents ordinary clicks from nudging geometry.
3. Once the threshold is crossed, the point enters an active drag and follows the pointer through
   the permitted edit space.
4. Releasing the pointer plants the last valid point, retains that point as selected, and creates
   exactly one Undo/Redo transaction.
5. There is no click-to-float or passive-follow mode. A point moves only during a held pointer drag.

### 2.2 Pointer ownership

- The editor captures the active `pointerId` on a **stable, non-moving DOM owner** for the whole
  gesture. The moving point button must not be the sole owner of capture or move/up events.
- `pointermove`, `pointerup`, and `pointercancel` accept input only from that active pointer.
- A render of a new point position must not replace the capture owner or lose the active gesture.
- Vertex rendering identity must be position-independent. Current coordinates must never be part of
  a React key for an editable point. The current ordered vertex index is sufficient for this repair
  because insertion/removal is unavailable during an active drag; no scene-schema vertex IDs are
  required.

### 2.3 Validity, overscan, and feedback

- The existing bounded Boundary edit space of `-2..3` on both axes remains authoritative.
- The active point may move beyond the visible artboard while it remains inside that edit space and
  the whole Boundary remains valid: 3--64 vertices, finite values, no repeated adjacent points,
  non-zero area, and no self-intersection or non-adjacent touching.
- An invalid candidate never replaces the latest valid candidate. The point visibly remains at the
  last valid location until the pointer returns to validity or the gesture ends.
- While the pointer requests an invalid location, the selected point and its outline use the error
  treatment. It returns to the normal selected treatment immediately after a valid sample, release,
  or cancellation.
- This feedback is local to the point and overlay. The editor must not emit repeated toast/status
  messages during a drag.

### 2.4 Cancellation and interruption

- `Escape` during an active drag restores the exact drag-start Boundary, releases capture, and keeps
  **Edit points** open with the original point selected.
- `pointercancel`, browser-focus loss, and equivalent system interruptions have the same outcome.
- Only an explicit `pointerup` may plant a change. A subsequent late `pointerup` after cancellation
  is ignored and cannot commit the cancelled move.
- Outside an active drag, `Escape` retains the existing behavior of leaving Edit points mode.

### 2.5 Input parity

This contract applies through Pointer Events to mouse, trackpad, touch, and pen. The behavior is
defined by pointer lifecycle, not by a mouse-only implementation.

## 3. Architectural direction

The repair must keep the canonical Scene and interaction draft separate. A recommended ephemeral
`BoundaryVertexDrag` state has:

```text
pointerId, materialId, vertexIndex
pressClientPoint, startBoundary, startVertex
phase: pending | dragging
lastValidPoint, invalidPointerLocation
```

The stable Boundary-editor overlay (or another stable artboard-level owner) owns capture and routes
events through that state. A point control only starts selection/pending drag; it is not relied on
after the first render. This preserves one rAF-coalesced visual update per frame without dropping
gesture ownership.

Each raw move may update ephemeral intent and validity state. Rendering may remain rAF-coalesced,
but the coalescer must retain the latest valid candidate rather than allowing a final invalid sample
to erase an earlier valid one. No invalid geometry is committed, exported, autosaved as a completed
edit, or placed in history.

Likely implementation surfaces:

- `src/app/components/SceneArtboard.tsx` — stable capture owner, threshold, coordinate conversion,
  active pointer routing, and editor-only feedback.
- `src/app/session/useSceneEditor.ts` — one interaction transaction, last-valid candidate tracking,
  release/cancel semantics, and selected-point state.
- `src/app/styles/layout.css` — selected-invalid point/outline treatment without layout shift.
- `tests/e2e/lite-authoring-export.spec.ts` and focused interaction/unit tests — gesture and
  transaction regressions.

## 4. Staged milestones

### M0 — Lock the regression and baseline

**Goal:** Turn the observed failure into deterministic evidence before changing production code.

**Work**

- Add a focused test helper that creates a simple editable Boundary with a known valid movement
  corridor and a known invalid crossing route.
- Capture the current failure with a rapid pointer movement that leaves the original point target.
- Record the existing slow stepped drag as the control case.

**Done looks like**

- The rapid case distinguishes the broken behavior from the control case without relying on a visual
  screenshot alone.
- The fixture has no dependence on browser timing guesses, application local-storage residue, or
  starter-specific geometry.
- The baseline demonstrates that the failure is input/capture related rather than an export or
  renderer-parity defect.

**Verification**

- Focused Chromium test is red before the repair and has a clear assertion for final vertex
  position or rendered overlay position.
- Existing `npm run typecheck` and targeted Boundary tests still pass.

### M1 — Establish stable gesture ownership

**Goal:** A held drag cannot lose ownership because the point moves or React re-renders.

**Work**

- Replace position-derived vertex keys with stable edit-session identity.
- Move pointer capture and move/up/cancel routing to the stable Boundary-editor owner.
- Introduce the `pending` to `dragging` threshold and ignore non-active pointer IDs.
- Ensure a point click remains selection-only and a drag creates one interaction group.

**Done looks like**

- A point follows a rapid drag even after the pointer has left the original 16 px handle.
- Re-rendering the overlay cannot terminate capture or cause a second point to receive the gesture.
- Click, touch, pen, and mouse paths share the same lifecycle.

**Verification**

- Chromium: rapid drag across more than one handle width reaches the requested valid endpoint.
- Chromium: click below the 4 px threshold changes selection but not geometry/history.
- Focused state test: only the captured `pointerId` can alter the active gesture.

### M2 — Make validity and cancellation explicit

**Goal:** Invalid movement remains controlled and every cancellation restores the correct source.

**Work**

- Track the drag-start Boundary and the last valid candidate separately from rendered draft state.
- Retain the last valid candidate across rAF coalescing; never replace it with an invalid sample.
- Add selected-invalid styling with no repeated status/toast output.
- Implement active-drag `Escape`, `pointercancel`, and focus-loss cancellation; release capture and
  preserve Edit points mode.

**Done looks like**

- Moving into a self-crossing, degenerate, or out-of-range candidate keeps the point at its last
  valid location and visibly signals the invalid request.
- Moving back into validity clears the warning immediately and resumes following the pointer.
- Escape or interruption restores the exact pre-drag geometry, adds no history entry, and cannot be
  re-committed by a late `pointerup`.

**Verification**

- Unit tests cover valid-to-invalid-to-valid candidate transitions and retention of the last valid
  point under coalesced input.
- Chromium covers self-crossing and edit-space-boundary cases, the selected-invalid style, Escape
  mid-drag, and `pointercancel`/lost-focus cancellation.
- Undo depth is unchanged after cancellation and increases by one after a valid release.

### M3 — Prove persistence, accessibility, and device parity

**Goal:** The repaired gesture is portable, keyboard-safe, and does not regress the authoring flow.

**Work**

- Exercise mouse, touch, and pen Pointer Event paths or equivalent pointer-type fixtures.
- Verify point selection and remove-point controls remain keyboard reachable.
- Verify a valid release persists through the existing save/reload path; cancelled movement does not.
- Verify exported Scene JSON/SVG/CSS contains only the committed Boundary, never drag overlays or
  invalid draft state.

**Done looks like**

- Every supported pointer type follows the same press/threshold/drag/release/cancel contract.
- Keyboard Escape outside an active drag still exits Edit points mode; during a drag it cancels only
  that move.
- Reload/export reflect the committed last-valid point and contain no editor-only feedback.

**Verification**

- Chromium accessibility and keyboard checks, plus pointer-type coverage appropriate to the pinned
  Playwright runtime.
- Scene canonicalization, persistence, SVG, and CSS export parity tests pass for a completed drag.
- Run `npm run format:check`, `npm run lint`, and the relevant targeted test set.

### M4 — v0.3.2 staging and release-quality validation

**Goal:** Demonstrate the fix in the real local editor and document only verified behavior.

**Work**

- Run the full affected interaction suite and a manual localhost pass at normal and rapid pointer
  speeds.
- Review overscan movement, invalid feedback, release, Escape, focus loss, Undo/Redo, and reload.
- Update the user-facing guide only if it currently describes behavior that changes materially.
- Update `package.json` and `package-lock.json` to `0.3.2` only after M0--M3 are accepted.
- Commit the approved v0.3.2 implementation, promote that exact commit to `staging` (creating the
  branch if necessary), push it to `origin/staging`, then fetch/checkout the resulting staging SHA
  for the final local verification pass.

**Done looks like**

- No Boundary point breaks away from a held valid drag at ordinary or rapid pointer speed.
- Invalid geometry is visibly bounded, never committed, and recovers without restarting the edit.
- No unrelated editor behavior, export output, or persistence path regresses.
- The local validation worktree resolves to the exact SHA published as `origin/staging`; it is not
  merely a same-named local branch with unpushed changes.

**Verification**

```bash
npm run format:check
npm run lint
npm run check
```

- Manual localhost checklist passes in the pinned Chromium target.
- Browser console has no errors during the Boundary authoring journey.
- `git rev-parse HEAD` matches `git rev-parse origin/staging` in the final local verification
  worktree, and the working tree is clean after the verification commands.

## 5. Required acceptance matrix

| Scenario                                         | Required result                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Click a point without crossing 4 px              | Point selects; geometry and history do not change.                         |
| Rapid valid drag beyond original handle          | Captured point follows and plants at the valid endpoint.                   |
| Drag outside visible artboard but inside `-2..3` | Point continues to follow; export crop remains unchanged.                  |
| Drag into invalid topology/range                 | Point stays at last valid location; selected-invalid treatment is visible. |
| Return from invalid to valid                     | Warning clears immediately; point resumes following.                       |
| Release after valid movement                     | One history entry; point remains selected; reload/export retain it.        |
| Escape while dragging                            | Exact start geometry returns; Edit points remains open; no history entry.  |
| `pointercancel` or focus loss                    | Same result as Escape; later pointer-up cannot commit.                     |
| Escape while not dragging                        | Existing Finish editing behavior remains available.                        |
| Mouse, touch, pen                                | Same contract through Pointer Events.                                      |

## 6. Change-scoped regression policy

Boundary drag regression coverage is mandatory when a change can reasonably affect any of these
behaviors:

- Boundary point editing, artboard overlays, Pointer Event handling, capture ownership, or gesture
  state;
- coordinate conversion, edit-space limits, geometry validation, or selection state;
- rAF interaction scheduling, transaction/history handling, persistence, or shared scene rendering.

Palette-only, copy-only, or isolated color-value changes do not need this drag suite merely because
they are part of the same application. This policy does not remove normal repository checks required
by the active change; it scopes this specialized regression journey to behavioral impact.

## 7. Non-goals

- No click-to-float point placement mode.
- No curves, boolean geometry, automatic self-intersection repair, or unbounded coordinates.
- No raster preview, export format, schema-version, or new vertex-ID migration as part of this
  repair.
- No change to layer z-order, artboard crop semantics, or non-Boundary transform behavior.
- No promise of cross-browser certification beyond the pinned Chromium target already used by v0.3.

## 8. Risks and mitigations

| Risk                                                    | Mitigation                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Re-render drops capture again                           | Stable owner captures the active pointer; tests move beyond the original handle.                   |
| Threshold makes touch feel laggy                        | Keep it small (4 CSS px), apply it to displacement not elapsed press time, and test pointer types. |
| Invalid feedback becomes noisy                          | Use transient point/outline styling only; suppress per-move toasts.                                |
| Coalescing loses a valid point before an invalid sample | Store last valid ephemeral candidate independently of the latest raw pointer location.             |
| Escape exits edit mode instead of cancelling a move     | Branch Escape behavior on whether a drag is active; regression-test both branches.                 |
| Specialized tests become indiscriminate                 | Apply the explicit behavior-impact policy in Section 6.                                            |

## 9. Approval boundary

The interaction decisions and acceptance gates in this document are approved. The next step, only
when explicitly authorized, is implementation in milestone order: M0, M1, M2, M3, then M4. Until
then this specification is a reference document; no product code, test, or user-facing behavior is
changed by it.
