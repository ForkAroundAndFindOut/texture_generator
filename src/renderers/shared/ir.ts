/**
 * Renderer-independent intermediate representation contracts.
 *
 * These are immutable values produced from a validated recipe and an explicit
 * RenderProfile. DOM/SVG/CSS adapters consume them; they do not reinterpret
 * geometry, color, ordering, or filter semantics. There are intentionally no
 * imports from React, the DOM, persistence, export orchestration, or compiler
 * tooling in this module.
 */

import type { FitMode, NormalizedSignedUnit, NormalizedUnit, QuantizedNumber } from './profile';

declare const canonicalHexBrand: unique symbol;

/** A canonical uppercase six-digit sRGB color token. */
export type CanonicalHex = `#${string}` & {
  readonly [canonicalHexBrand]: 'CanonicalHex';
};

/** Runtime guard for canonical uppercase #RRGGBB tokens. */
export function isCanonicalHex(value: unknown): value is CanonicalHex {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/u.test(value);
}

/** Validate and brand a canonical uppercase #RRGGBB token. */
export function toCanonicalHex(value: string): CanonicalHex {
  if (!isCanonicalHex(value)) {
    throw new RangeError('Renderer colors must be uppercase #RRGGBB values.');
  }
  return value as CanonicalHex;
}

/** Stable component identity carried for diagnostics and parity snapshots. */
export type ComponentId = string;

/** Stable definition identity shared by all adapters for one derived object. */
export type DefinitionId = string;

/** A finite normalized point in design space. */
export interface PointIR {
  readonly x: QuantizedNumber;
  readonly y: QuantizedNumber;
}

/** A finite normalized/quantized size in design space. */
export interface SizeIR {
  readonly width: QuantizedNumber;
  readonly height: QuantizedNumber;
}

/**
 * Deterministic affine transform in the conventional six-value 2D form.
 * The convention is shared by every adapter and has no CSS/SVG-specific
 * interpretation at this boundary.
 */
export interface MatrixIR {
  readonly a: QuantizedNumber;
  readonly b: QuantizedNumber;
  readonly c: QuantizedNumber;
  readonly d: QuantizedNumber;
  readonly e: QuantizedNumber;
  readonly f: QuantizedNumber;
}

/** Alias used by geometry callers that name the six-value matrix explicitly. */
export type Matrix2D = MatrixIR;

/** Short alias used by callers that refer to the transform as a matrix. */
export type Matrix = MatrixIR;

/** A resolved sRGB color. Alpha remains a separate normalized value. */
export interface ColorIR {
  readonly hex: CanonicalHex;
  readonly opacity: NormalizedUnit;
}

/** Short alias for a resolved renderer color. */
export type Color = ColorIR;

/** Supported compositing modes; this is the shared semantic set, not CSS. */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

/** One derived fade stop in normalized fade space. */
export interface FadeStopIR {
  readonly offset: NormalizedUnit;
  readonly opacity: NormalizedUnit;
}

/** Backend-neutral derived filter parameters. */
export type FilterIR =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'blur'; radius: QuantizedNumber }>
  | Readonly<{ kind: 'grain'; amount: NormalizedUnit }>;

/**
 * Derived appearance parameters. `stops` and `filter` are compiler output;
 * neither is an editable recipe field.
 */
export interface FadeIR {
  readonly kind: 'fade';
  readonly softness: NormalizedUnit;
  readonly highlight: NormalizedUnit;
  readonly asymmetry: NormalizedSignedUnit;
  readonly stops: readonly FadeStopIR[];
  readonly filter: FilterIR;
}

/** Short alias for the renderer-facing fade value. */
export type Fade = FadeIR;

/**
 * A normalized component-local path command. The compiler resolves the
 * component matrix into canvas units exactly once before an adapter sees it.
 */
export type PathCommand =
  | Readonly<{ kind: 'move'; x: QuantizedNumber; y: QuantizedNumber }>
  | Readonly<{ kind: 'line'; x: QuantizedNumber; y: QuantizedNumber }>
  | Readonly<{
      kind: 'cubic';
      c1x: QuantizedNumber;
      c1y: QuantizedNumber;
      c2x: QuantizedNumber;
      c2y: QuantizedNumber;
      x: QuantizedNumber;
      y: QuantizedNumber;
    }>
  | Readonly<{ kind: 'close' }>;

/** A path segment between the initial move and terminal close commands. */
export type PathSegmentCommand = Extract<PathCommand, { kind: 'line' | 'cubic' }>;

/**
 * Closed path command sequence: one move, zero or more line/cubic segments,
 * and one terminal close. The tuple prevents empty/open paths at compile time.
 */
export type ClosedPathCommands = readonly [
  Extract<PathCommand, { kind: 'move' }>,
  ...PathSegmentCommand[],
  Extract<PathCommand, { kind: 'close' }>,
];

/**
 * A closed ordered path and its deterministic component transform. Commands
 * remain normalized component-local values; `matrix` is in canvas units.
 * Adapters must preserve both without applying another canvas or fit scale.
 */
export interface PathIR {
  readonly kind: 'path';
  readonly version: 'path-ir-v1';
  readonly commands: ClosedPathCommands;
  readonly matrix: MatrixIR;
  readonly sourceComponentId?: ComponentId;
  readonly sourceAnchorIds?: readonly string[];
}

/** Short alias for the shared path value. */
export type Path = PathIR;

/** Canvas/design bounds used by RenderIR. */
export interface CanvasBoundsIR extends SizeIR {
  readonly kind: 'canvas-bounds';
}

/** Render target bounds used by the fit calculation. */
export interface TargetBoundsIR extends SizeIR {
  readonly kind: 'target-bounds';
}

/** Shared fit result: mode, source/target bounds, and deterministic matrix. */
export interface FitIR {
  readonly kind: 'fit';
  readonly mode: FitMode;
  readonly source: CanvasBoundsIR;
  readonly target: TargetBoundsIR;
  readonly matrix: MatrixIR;
}

/** Short alias for the renderer-facing fit value. */
export type Fit = FitIR;

/** Rectangular clip in the same immutable coordinate space as RenderIR. */
export interface ClipIR {
  readonly kind: 'clip-rect';
  readonly x: QuantizedNumber;
  readonly y: QuantizedNumber;
  readonly width: QuantizedNumber;
  readonly height: QuantizedNumber;
}

/** Short alias for the renderer-facing clip value. */
export type Clip = ClipIR;

/**
 * One explicit neighboring tile copy. Offsets are in source canvas units;
 * adapters may position the copy but may not infer additional copies.
 */
export interface TileCopyIR {
  readonly kind: 'tile-copy';
  readonly offset: PointIR;
  readonly clip: ClipIR;
}

/** Alias used by callers that omit the IR suffix. */
export type TileCopy = TileCopyIR;

/** Resolved base layer. It is always the first layer in canonical order. */
export interface BaseLayerIR {
  readonly kind: 'base';
  readonly id: 'base';
  readonly color: ColorIR;
  readonly definitionId: DefinitionId;
}

/** Shared fields carried by every resolved component layer. */
interface ComponentLayerFields {
  readonly id: ComponentId;
  readonly path: PathIR;
  readonly color: ColorIR;
  readonly blendMode: BlendMode;
  readonly fade: FadeIR;
  readonly definitionId: DefinitionId;
}

/** A resolved Field layer, preserving recipe array order. */
export interface FieldLayerIR extends ComponentLayerFields {
  readonly kind: 'field';
}

/** A resolved Band layer, preserving recipe array order. */
export interface BandLayerIR extends ComponentLayerFields {
  readonly kind: 'band';
}

/** A resolved visual component layer, preserving recipe array order. */
export type ComponentLayerIR = FieldLayerIR | BandLayerIR;

/** Global derived effects layer. It is always last when present. */
export interface EffectsLayerIR {
  readonly kind: 'effects';
  readonly id: 'effects';
  readonly fade: FadeIR;
  readonly definitionId: DefinitionId;
}

/** Ordered layer union consumed by every visual adapter. */
export type LayerIR = BaseLayerIR | FieldLayerIR | BandLayerIR | EffectsLayerIR;

/**
 * Canonical layer order: exactly one base first, zero or more recipe-ordered
 * components, and at most one effects layer last.
 */
export type RenderLayersIR =
  | readonly [BaseLayerIR, ...ComponentLayerIR[]]
  | readonly [BaseLayerIR, ...ComponentLayerIR[], EffectsLayerIR];

/** More explicit alias for API callers that use the longer name. */
export type RenderLayerIR = LayerIR;

/** Short aliases used by renderer adapters and parity fixtures. */
export type Layer = LayerIR;
export type RenderLayer = LayerIR;

/**
 * Complete immutable renderer output. `layers` is the canonical z-order:
 * base first, then components in recipe-array order, then optional effects.
 * No numeric z-index is carried, preventing order disagreement between
 * preview and export adapters.
 */
export interface RenderIR {
  readonly kind: 'render-ir';
  readonly version: 'render-ir-v1';
  readonly canvas: CanvasBoundsIR;
  readonly fit: FitIR;
  readonly clip: ClipIR;
  readonly tileCopies: readonly TileCopyIR[];
  readonly layers: RenderLayersIR;
}

/** Stable version identifiers used by export manifests and parity evidence. */
export const PATH_IR_VERSION = 'path-ir-v1' as const;
export const RENDER_IR_VERSION = 'render-ir-v1' as const;

export type PathIrVersion = typeof PATH_IR_VERSION;
export type RenderIrVersion = typeof RENDER_IR_VERSION;
