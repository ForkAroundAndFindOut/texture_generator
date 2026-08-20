/**
 * Renderer profile contracts.
 *
 * A profile describes where a recipe is being evaluated. It is deliberately
 * separate from recipe state: changing a profile must never mutate a recipe.
 * This module contains no rendering implementation and no browser/runtime
 * dependencies.
 */

/** Six decimal places are the renderer/domain boundary precision. */
export const QUANTIZATION_SCALE = 1_000_000 as const;

declare const quantizedNumberBrand: unique symbol;
declare const normalizedUnitBrand: unique symbol;
declare const normalizedSignedUnitBrand: unique symbol;
declare const positiveDimensionBrand: unique symbol;
declare const renderProfileDimensionsBrand: unique symbol;

/** A finite number represented at the shared six-place quantization boundary. */
export type QuantizedNumber = number & {
  readonly [quantizedNumberBrand]: 'QuantizedNumber';
};

/** A quantized value normalized to the closed interval [0, 1]. */
export type NormalizedUnit = QuantizedNumber & {
  readonly [normalizedUnitBrand]: 'NormalizedUnit';
};

/** A quantized value normalized to the closed interval [-1, 1]. */
export type NormalizedSignedUnit = QuantizedNumber & {
  readonly [normalizedSignedUnitBrand]: 'NormalizedSignedUnit';
};

/** A positive, finite target dimension in render space. */
export type PositiveDimension = QuantizedNumber & {
  readonly [positiveDimensionBrand]: 'PositiveDimension';
};

/** Runtime guard for finite values already quantized to six decimal places. */
export function isQuantizedNumber(value: unknown): value is QuantizedNumber {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const scaled = value * QUANTIZATION_SCALE;
  const nearest = Math.round(scaled);
  if (!Number.isSafeInteger(nearest)) return false;

  // Decimal fractions such as 0.466037 can multiply to 466036.99999999994
  // even after six-place rounding. Allow only a few ULPs of that operation's
  // error; a genuinely non-quantized value remains well outside this bound.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;
  return Math.abs(scaled - nearest) <= tolerance;
}

/** Deterministically quantize a finite number, canonicalizing negative zero. */
export function quantizeNumber(value: number): QuantizedNumber {
  if (!Number.isFinite(value)) {
    throw new RangeError('Quantized renderer numbers must be finite.');
  }

  const rounded = Math.round(value * QUANTIZATION_SCALE) / QUANTIZATION_SCALE;
  if (!isQuantizedNumber(rounded)) {
    throw new RangeError('Quantized renderer number exceeds the safe precision range.');
  }

  return (Object.is(rounded, -0) ? 0 : rounded) as QuantizedNumber;
}

/** Runtime guard for normalized values in the closed interval [0, 1]. */
export function isNormalizedUnit(value: unknown): value is NormalizedUnit {
  return isQuantizedNumber(value) && value >= 0 && value <= 1;
}

/** Quantize and validate a normalized [0, 1] value. */
export function toNormalizedUnit(value: number): NormalizedUnit {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Normalized renderer values must be within [0, 1].');
  }
  const quantized = quantizeNumber(value);
  if (!isNormalizedUnit(quantized)) {
    throw new RangeError('Normalized renderer values must be within [0, 1].');
  }
  return quantized as NormalizedUnit;
}

/** Runtime guard for normalized values in the closed interval [-1, 1]. */
export function isNormalizedSignedUnit(value: unknown): value is NormalizedSignedUnit {
  return isQuantizedNumber(value) && value >= -1 && value <= 1;
}

/** Quantize and validate a normalized [-1, 1] value. */
export function toNormalizedSignedUnit(value: number): NormalizedSignedUnit {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError('Signed normalized renderer values must be within [-1, 1].');
  }
  const quantized = quantizeNumber(value);
  if (!isNormalizedSignedUnit(quantized)) {
    throw new RangeError('Signed normalized renderer values must be within [-1, 1].');
  }
  return quantized as NormalizedSignedUnit;
}

/** Runtime guard for positive finite dimensions at the quantized boundary. */
export function isPositiveDimension(value: unknown): value is PositiveDimension {
  return isQuantizedNumber(value) && value > 0;
}

/** Quantize and validate a positive render dimension. */
export function toPositiveDimension(value: number): PositiveDimension {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Render dimensions must be positive.');
  }
  const quantized = quantizeNumber(value);
  if (!isPositiveDimension(quantized)) {
    throw new RangeError('Render dimensions must be positive.');
  }
  return quantized as PositiveDimension;
}

/** Intended use of the rendered texture. */
export type RenderUsage = 'component' | 'background' | 'icon' | 'tile' | 'custom';

/** Documented fit semantics shared by preview and export. */
export type FitMode = 'cover' | 'contain' | 'stretch';

/** Named target-shape hints used by preview controls. */
export type RenderTargetShape = 'square' | 'portrait' | 'landscape' | 'custom';

/** Immutable target dimensions for a profile. */
export interface RenderDimensions {
  readonly width: PositiveDimension;
  readonly height: PositiveDimension;
}

/**
 * A non-destructive preview/export context.
 *
 * `width` and `height` are target dimensions, not recipe canvas dimensions.
 * `inspectTiles` requests the exact 3-by-3 neighboring-copy inspection view;
 * it does not itself grant tile-export eligibility.
 */
export interface RenderProfile {
  readonly kind: 'render-profile';
  readonly usage: RenderUsage;
  /** Raw input dimensions are checked with `isRenderProfile` at the boundary. */
  readonly width: number;
  readonly height: number;
  readonly fit: FitMode;
  readonly inspectTiles: boolean;
  readonly targetShape?: RenderTargetShape;
}

/** Runtime guard for a complete non-destructive render profile. */
export function isRenderProfile(value: unknown): value is RenderProfile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['kind'] === 'render-profile' &&
    (candidate['usage'] === 'component' ||
      candidate['usage'] === 'background' ||
      candidate['usage'] === 'icon' ||
      candidate['usage'] === 'tile' ||
      candidate['usage'] === 'custom') &&
    isPositiveDimension(candidate['width']) &&
    isPositiveDimension(candidate['height']) &&
    (candidate['fit'] === 'cover' ||
      candidate['fit'] === 'contain' ||
      candidate['fit'] === 'stretch') &&
    typeof candidate['inspectTiles'] === 'boolean' &&
    (candidate['targetShape'] === undefined ||
      candidate['targetShape'] === 'square' ||
      candidate['targetShape'] === 'portrait' ||
      candidate['targetShape'] === 'landscape' ||
      candidate['targetShape'] === 'custom')
  );
}

/**
 * A profile with dimensions grouped for APIs that prefer a size object.
 *
 * Grouped profiles omit top-level width/height entirely, so a profile cannot
 * silently carry contradictory duplicate dimensions.
 */
export type RenderProfileDimensions = Omit<RenderProfile, 'width' | 'height'> & {
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly [renderProfileDimensionsBrand]: 'RenderProfileDimensions';
};

/**
 * Build a grouped profile without duplicating top-level width/height fields.
 * The opaque return prevents callers from constructing contradictory objects
 * by spreading a full `RenderProfile` into the grouped form.
 */
export function createRenderProfileDimensions(
  profile: Omit<RenderProfile, 'width' | 'height'>,
  dimensions: Readonly<{ width: number; height: number }>,
): RenderProfileDimensions {
  return {
    ...profile,
    dimensions: {
      width: toPositiveDimension(dimensions.width),
      height: toPositiveDimension(dimensions.height),
    },
  } as unknown as RenderProfileDimensions;
}

/** Canonical profile version used when serializing a profile snapshot. */
export const RENDER_PROFILE_VERSION = 'render-profile-v1' as const;

export type RenderProfileVersion = typeof RENDER_PROFILE_VERSION;
