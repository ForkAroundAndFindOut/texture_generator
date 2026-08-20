import type { SceneV03Id, SceneV03IdKind } from './types';

const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ID_BODY_LENGTH = 26;
const ID_BYTE_LENGTH = 16;
const PREFIX_BY_KIND = {
  scene: 'scn',
  palette: 'pal',
  group: 'grp',
  material: 'mat',
} as const;

export interface SceneV03IdCryptoPort {
  getRandomValues<T extends ArrayBufferView<ArrayBuffer>>(array: T): T;
}

function assertIdBytes(bytes: Uint8Array): void {
  if (bytes.length !== ID_BYTE_LENGTH) {
    throw new RangeError('Scene IDs require exactly ' + ID_BYTE_LENGTH + ' bytes.');
  }
}

function encodeCrockford128(bytes: Uint8Array): string {
  assertIdBytes(bytes);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  const encoded = Array<string>(ID_BODY_LENGTH);
  for (let index = ID_BODY_LENGTH - 1; index >= 0; index -= 1) {
    encoded[index] = CROCKFORD_ALPHABET[Number(value & 31n)]!;
    value >>= 5n;
  }
  return encoded.join('');
}

function defaultCryptoPort(): SceneV03IdCryptoPort {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error('Scene ID creation requires Web Crypto getRandomValues.');
  }
  return globalThis.crypto;
}

export function sceneV03IdFromBytes(kind: SceneV03IdKind, bytes: Uint8Array): SceneV03Id {
  return PREFIX_BY_KIND[kind] + '_' + encodeCrockford128(bytes);
}

export function createSceneV03Id(
  kind: SceneV03IdKind,
  port: SceneV03IdCryptoPort = defaultCryptoPort(),
): SceneV03Id {
  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  port.getRandomValues(bytes);
  return sceneV03IdFromBytes(kind, bytes);
}

export function isSceneV03Id(value: string, kind?: SceneV03IdKind): value is SceneV03Id {
  const separator = value.indexOf('_');
  if (separator <= 0) return false;

  const prefix = value.slice(0, separator);
  const body = value.slice(separator + 1);
  if (body.length !== ID_BODY_LENGTH || body[0] === undefined || body[0] > '7') return false;
  if (![...body].every((character) => CROCKFORD_ALPHABET.includes(character))) return false;

  if (kind === undefined) return Object.values(PREFIX_BY_KIND).includes(prefix as 'scn');
  return prefix === PREFIX_BY_KIND[kind];
}
