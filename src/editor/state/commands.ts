/**
 * Framework-independent command contracts used by the editor reducer.
 *
 * Commands are deliberately small: they receive an isolated draft and return
 * either a canonical candidate or a typed preparation failure.  Persistence,
 * rendering, React, and browser APIs do not belong in this module.
 */

export type CanonicalBytes = ReadonlyArray<number> | Uint8Array;

export type CandidateSuccess<Recipe> = {
  readonly kind: 'success';
  readonly candidate: Recipe;
  readonly canonicalBytes: CanonicalBytes;
  readonly summary?: string;
};

export type CandidateFailure<Diagnostic = unknown> = {
  readonly kind: 'failure';
  readonly diagnostics: readonly Diagnostic[];
};

export type CandidateResult<Recipe, Diagnostic = unknown> =
  CandidateSuccess<Recipe> | CandidateFailure<Diagnostic>;

export type RecipeCanonicalizer<Recipe> = (recipe: Recipe) => CanonicalBytes;

export type DesignCommand<Recipe, Diagnostic = unknown> = {
  readonly kind: string;
  readonly prepare: (current: Recipe) => CandidateResult<Recipe, Diagnostic>;
  /** Optional serializer override for opaque/generic recipes. */
  readonly canonicalize?: RecipeCanonicalizer<Recipe>;
  /** A command-level fallback when the candidate does not provide a summary. */
  readonly summary?: string;
};

/**
 * Clone a recipe at every reducer boundary.  `structuredClone` is available in
 * the supported Node/browser runtimes; the JSON fallback keeps the seam useful
 * in small test hosts that omit it.
 */
export function cloneRecipe<Recipe>(recipe: Recipe): Recipe {
  const clone = globalThis.structuredClone;
  if (typeof clone === 'function') return clone(recipe);

  return cloneJsonValue(recipe) as Recipe;
}

function cloneJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item));

  const object = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object)) copy[key] = cloneJsonValue(child);
  return copy;
}

export function cloneCanonicalBytes(bytes: CanonicalBytes): Uint8Array {
  if (!isCanonicalBytes(bytes)) {
    throw new TypeError('Canonical bytes must be a non-empty sequence of octets');
  }
  return Uint8Array.from(bytes);
}

export function isCanonicalBytes(value: unknown): value is CanonicalBytes {
  if (value instanceof Uint8Array) {
    if (value.length === 0) return false;
    return true;
  }
  if (!Array.isArray(value) || value.length === 0) return false;
  const bytes = value as ReadonlyArray<unknown>;
  for (let index = 0; index < bytes.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
    const byte = bytes[index];
    if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      return false;
    }
  }
  return true;
}

/**
 * Deterministic serializer for generic test/domain seams.  Domain commands
 * should provide canonical bytes from the recipe canonicalizer; this fallback
 * only prevents history from sharing mutable byte arrays when a command is
 * intentionally generic.
 */
export function fallbackCanonicalBytes<Recipe>(recipe: Recipe): CanonicalBytes {
  const encoder = new TextEncoder();
  return encoder.encode(stableJsonString(recipe));
}

function stableJsonString(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Cannot serialize a non-finite value');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === undefined) return 'null';
  if (value instanceof Uint8Array) {
    return `[${Array.from(value, (byte) => String(byte)).join(',')}]`;
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonString(item)).join(',')}]`;

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort(compareUtf16);
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJsonString(object[key])}`)
      .join(',')}}`;
  }

  throw new TypeError(`Cannot serialize a value of type ${typeof value}`);
}

function compareUtf16(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
