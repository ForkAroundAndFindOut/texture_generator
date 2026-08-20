import { normalizeSceneV03, quantizeSceneV03Number } from './normalize';
import type { SceneV03 } from './types';
import { assertSceneV03 } from './validate';

const utf8Encoder = new TextEncoder();

function compareUtf16(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function serializeNumber(value: number): string {
  const normalized = quantizeSceneV03Number(value);
  const serialized = normalized.toFixed(6);
  return serialized === '-0.000000' ? '0.000000' : serialized;
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return serializeNumber(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError('Canonical scene arrays must not be sparse.');
      }
    }
    return '[' + value.map((item) => serializeValue(item)).join(',') + ']';
  }

  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical scene objects must be plain JSON objects.');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Canonical scene objects must not contain symbol keys.');
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareUtf16);
    return (
      '{' +
      keys.map((key) => JSON.stringify(key) + ':' + serializeValue(record[key])).join(',') +
      '}'
    );
  }

  throw new TypeError('Cannot canonically serialize a value of type ' + typeof value + '.');
}

/** Stable, validated JSON for durable scene state, hashing, and Scene JSON export. */
export function canonicalSceneV03String(value: SceneV03): string {
  assertSceneV03(value);
  return serializeValue(normalizeSceneV03(value));
}

export function canonicalSceneV03Bytes(value: SceneV03): Uint8Array {
  return utf8Encoder.encode(canonicalSceneV03String(value));
}

/** Export-file bytes are canonical UTF-8 followed by exactly one LF. */
export function canonicalSceneV03FileBytes(value: SceneV03): Uint8Array {
  const canonical = canonicalSceneV03Bytes(value);
  const bytes = new Uint8Array(canonical.length + 1);
  bytes.set(canonical);
  bytes[canonical.length] = 0x0a;
  return bytes;
}
