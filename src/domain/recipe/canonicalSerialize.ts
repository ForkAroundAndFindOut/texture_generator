import { normalizeRecipe, quantizeRecipeNumber } from './normalize';
import type { TextureRecipe } from './types';

const utf8Encoder = new TextEncoder();

function compareUtf16(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function serializeString(value: string): string {
  return JSON.stringify(value);
}

function serializeNumber(value: number): string {
  const normalized = quantizeRecipeNumber(value);
  const serialized = normalized.toFixed(6);
  if (serialized.includes('e') || serialized.includes('E')) {
    throw new RangeError('Canonical recipe numbers must serialize without an exponent');
  }
  return serialized === '-0.000000' ? '0.000000' : serialized;
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return serializeString(value);
  if (typeof value === 'number') return serializeNumber(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError('Canonical recipe arrays must not be sparse');
      }
    }
    return `[${value.map((item) => serializeValue(item)).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical recipe objects must be plain JSON objects');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Canonical recipe objects must not contain symbol keys');
    }

    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort(compareUtf16);
    return `{${keys
      .map((key) => `${serializeString(key)}:${serializeValue(object[key])}`)
      .join(',')}}`;
  }

  throw new TypeError(`Cannot canonically serialize a value of type ${typeof value}`);
}

export function canonicalRecipeString(value: TextureRecipe): string {
  return serializeValue(normalizeRecipe(value));
}

/** Canonical state/hash bytes: UTF-8, no BOM and no terminal newline. */
export function canonicalRecipeBytes(value: TextureRecipe): Uint8Array {
  return utf8Encoder.encode(canonicalRecipeString(value));
}

/** Recipe export-file bytes: canonical UTF-8 bytes followed by exactly one LF. */
export function canonicalRecipeFileBytes(value: TextureRecipe): Uint8Array {
  const canonical = canonicalRecipeBytes(value);
  const bytes = new Uint8Array(canonical.length + 1);
  bytes.set(canonical);
  bytes[canonical.length] = 0x0a;
  return bytes;
}
