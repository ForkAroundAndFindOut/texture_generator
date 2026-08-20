import type { AnchorId, ComponentId, PaletteId } from './types';

const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ID_BODY_LENGTH = 26;
const ID_BYTE_LENGTH = 16;
const PREFIX_BY_KIND = { palette: 'pal', component: 'cmp', anchor: 'anc' } as const;

export type StableIdKind = keyof typeof PREFIX_BY_KIND;
export type StableId = PaletteId | ComponentId | AnchorId;

type IdForKind<Kind extends StableIdKind> = Kind extends 'palette'
  ? PaletteId
  : Kind extends 'component'
    ? ComponentId
    : AnchorId;

export interface ManualIdCryptoPort {
  getRandomValues<T extends ArrayBufferView<ArrayBuffer>>(array: T): T;
}

export interface DeterministicIdPort {
  deriveBytes(kind: StableIdKind, stablePath: string): Uint8Array | Promise<Uint8Array>;
}

export type ParsedStableId = {
  [Kind in StableIdKind]: { kind: Kind; id: IdForKind<Kind>; bytes: Uint8Array };
}[StableIdKind];

function assertIdBytes(bytes: Uint8Array): void {
  if (bytes.length !== ID_BYTE_LENGTH) {
    throw new RangeError(`Stable IDs require exactly ${ID_BYTE_LENGTH} bytes`);
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

function decodeCrockford128(body: string): Uint8Array | null {
  if (body.length !== ID_BODY_LENGTH || body[0] === undefined || body[0] > '7') return null;

  let value = 0n;
  for (const character of body) {
    const digit = CROCKFORD_ALPHABET.indexOf(character);
    if (digit < 0) return null;
    value = (value << 5n) | BigInt(digit);
  }

  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  for (let index = ID_BYTE_LENGTH - 1; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return value === 0n ? bytes : null;
}

export function stableIdFromBytes<Kind extends StableIdKind>(
  kind: Kind,
  bytes: Uint8Array,
): IdForKind<Kind> {
  return `${PREFIX_BY_KIND[kind]}_${encodeCrockford128(bytes)}` as IdForKind<Kind>;
}

export function parseStableId(value: string): ParsedStableId | null {
  const separator = value.indexOf('_');
  if (separator < 0) return null;
  const prefix = value.slice(0, separator);
  const bytes = decodeCrockford128(value.slice(separator + 1));
  if (bytes === null) return null;

  for (const kind of Object.keys(PREFIX_BY_KIND) as StableIdKind[]) {
    if (PREFIX_BY_KIND[kind] === prefix) {
      return { kind, id: value as IdForKind<typeof kind>, bytes } as ParsedStableId;
    }
  }
  return null;
}

export function isStableId(value: string, kind?: StableIdKind): value is StableId {
  const parsed = parseStableId(value);
  return parsed !== null && (kind === undefined || parsed.kind === kind);
}

export function parsePaletteId(value: string): PaletteId | null {
  return isStableId(value, 'palette') ? (value as PaletteId) : null;
}

export function parseComponentId(value: string): ComponentId | null {
  return isStableId(value, 'component') ? (value as ComponentId) : null;
}

export function parseAnchorId(value: string): AnchorId | null {
  return isStableId(value, 'anchor') ? (value as AnchorId) : null;
}

function defaultManualCryptoPort(): ManualIdCryptoPort {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error('Manual stable ID creation requires Web Crypto getRandomValues');
  }
  return globalThis.crypto;
}

export function createManualId<Kind extends StableIdKind>(
  kind: Kind,
  port: ManualIdCryptoPort = defaultManualCryptoPort(),
): IdForKind<Kind> {
  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  port.getRandomValues(bytes);
  return stableIdFromBytes(kind, bytes);
}

export async function createDeterministicId<Kind extends StableIdKind>(
  kind: Kind,
  stablePath: string,
  port: DeterministicIdPort,
): Promise<IdForKind<Kind>> {
  const bytes = await port.deriveBytes(kind, stablePath);
  return stableIdFromBytes(kind, bytes);
}
