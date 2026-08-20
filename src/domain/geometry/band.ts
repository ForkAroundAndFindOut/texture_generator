import { isStableId } from '../recipe/ids';
import type {
  Band,
  BandComponentLocks,
  BandShape,
  ColorValue,
  ComponentAppearance,
  ComponentColorSource,
  ComponentId,
  ComponentTransform,
} from '../recipe/types';

/** Renderer-neutral structural PathIR contract owned by the domain boundary. */
type QuantizedNumber = number;
type MatrixIR = Readonly<Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', QuantizedNumber>>;
type PathCommand =
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
type ClosedPathCommands = readonly [
  Extract<PathCommand, { kind: 'move' }>,
  ...Array<Extract<PathCommand, { kind: 'line' | 'cubic' }>>,
  Extract<PathCommand, { kind: 'close' }>,
];
export interface PathIR {
  readonly kind: 'path';
  readonly version: 'path-ir-v1';
  readonly commands: ClosedPathCommands;
  readonly matrix: MatrixIR;
  readonly sourceComponentId?: ComponentId;
  readonly sourceAnchorIds?: readonly string[];
}

const PATH_IR_VERSION = 'path-ir-v1' as const;
const QUANTIZATION_SCALE = 1_000_000;
const quantizeNumber = (value: number): QuantizedNumber => {
  if (!Number.isFinite(value)) throw new RangeError('Geometry values must be finite.');
  const rounded = Math.round(value * QUANTIZATION_SCALE) / QUANTIZATION_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Optional overrides accepted by the deterministic Band factory. */
export interface BandFactoryOverrides {
  name?: string;
  transform?: {
    translation?: Partial<ComponentTransform['translation']>;
    baseSize?: Partial<ComponentTransform['baseSize']>;
    rotationDeg?: ComponentTransform['rotationDeg'];
    uniformScale?: ComponentTransform['uniformScale'];
  };
  appearance?: Partial<ComponentAppearance>;
  colorSource?: ComponentColorSource;
  locks?: Partial<BandComponentLocks>;
  band?: Partial<BandShape>;
}

/** Inputs for creating a detached, deterministic Band. */
export type BandFactoryOptions = BandFactoryOverrides & {
  id: ComponentId;
  overrides?: BandFactoryOverrides;
};

const DEFAULT_TRANSFORM: ComponentTransform = {
  translation: { x: 0.55, y: 0.55 },
  baseSize: { width: 1.2, height: 0.18 },
  rotationDeg: 32,
  uniformScale: 1,
};

const DEFAULT_APPEARANCE: ComponentAppearance = {
  softness: 0.48,
  highlight: 0.42,
  grain: 0.06,
  asymmetry: -0.15,
  blendMode: 'screen',
};

const DEFAULT_COLOR: ColorValue = { hex: '#FDA4AF', opacity: 0.74 };

const DEFAULT_LOCKS: BandComponentLocks = {
  identity: false,
  colorSource: false,
  geometry: false,
  translation: false,
  rotation: false,
  uniformScale: false,
  aspect: false,
};

const DEFAULT_BAND: BandShape = { endCap: 'round', taper: 0.24 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

function assertTransform(value: unknown): asserts value is ComponentTransform {
  if (!isRecord(value)) throw new RangeError('Band transform must be an object.');
  const translation = value['translation'];
  const baseSize = value['baseSize'];
  if (
    !isRecord(translation) ||
    !finiteInRange(translation['x'], -2, 3) ||
    !finiteInRange(translation['y'], -2, 3)
  ) {
    throw new RangeError('Band translation must be finite and within [-2, 3].');
  }
  if (
    !isRecord(baseSize) ||
    !finiteInRange(baseSize['width'], 0.001, 4) ||
    !finiteInRange(baseSize['height'], 0.001, 4)
  ) {
    throw new RangeError('Band base size must be finite and within (0, 4].');
  }
  if (!finiteInRange(value['rotationDeg'], -180, 180) || value['rotationDeg'] === 180) {
    throw new RangeError('Band rotation must be finite and in [-180, 180).');
  }
  if (!finiteInRange(value['uniformScale'], 0.05, 4)) {
    throw new RangeError('Band scale must be finite and within [0.05, 4].');
  }
}

function assertBand(value: unknown): asserts value is Band {
  if (!isRecord(value) || value['type'] !== 'band')
    throw new TypeError('Expected a Band component.');
  const id = value['id'];
  if (typeof id !== 'string' || !isStableId(id, 'component')) {
    throw new RangeError('Band id must be a stable component id.');
  }
  const name = value['name'];
  if (typeof name !== 'string' || name.length < 1 || name.length > 80) {
    throw new RangeError('Band name must contain 1-80 characters.');
  }
  assertTransform(value['transform']);

  const appearance = value['appearance'];
  if (
    !isRecord(appearance) ||
    !finiteInRange(appearance['softness'], 0, 1) ||
    !finiteInRange(appearance['highlight'], 0, 1) ||
    !finiteInRange(appearance['grain'], 0, 1) ||
    !finiteInRange(appearance['asymmetry'], -1, 1) ||
    !['normal', 'multiply', 'screen', 'overlay', 'soft-light'].includes(
      String(appearance['blendMode']),
    )
  ) {
    throw new RangeError('Band appearance is invalid.');
  }

  const colorSource = value['colorSource'];
  if (!isRecord(colorSource) || !['palette', 'local'].includes(String(colorSource['kind']))) {
    throw new RangeError('Band color source is invalid.');
  }
  if (colorSource['kind'] === 'palette') {
    if (
      typeof colorSource['paletteId'] !== 'string' ||
      !isStableId(colorSource['paletteId'], 'palette')
    ) {
      throw new RangeError('Band palette reference is invalid.');
    }
  } else {
    const local = colorSource['value'];
    if (
      !isRecord(local) ||
      typeof local['hex'] !== 'string' ||
      !/^#[0-9A-F]{6}$/u.test(local['hex']) ||
      !finiteInRange(local['opacity'], 0, 1)
    ) {
      throw new RangeError('Band local color is invalid.');
    }
  }

  const locks = value['locks'];
  if (
    !isRecord(locks) ||
    !Object.keys(DEFAULT_LOCKS).every((key) => typeof locks[key] === 'boolean')
  ) {
    throw new RangeError('Band locks are invalid.');
  }

  const band = value['band'];
  if (
    !isRecord(band) ||
    !['round', 'flat'].includes(String(band['endCap'])) ||
    !finiteInRange(band['taper'], 0, 1)
  ) {
    throw new RangeError('Band shape is invalid.');
  }
}

function mergeFactoryOverrides(
  topLevel: BandFactoryOverrides,
  nested: BandFactoryOverrides | undefined,
): BandFactoryOverrides {
  const merged = { ...(nested ?? {}), ...topLevel };
  return {
    ...merged,
    transform: {
      ...(nested?.transform ?? {}),
      ...(topLevel.transform ?? {}),
      translation: {
        ...(nested?.transform?.translation ?? {}),
        ...(topLevel.transform?.translation ?? {}),
      },
      baseSize: {
        ...(nested?.transform?.baseSize ?? {}),
        ...(topLevel.transform?.baseSize ?? {}),
      },
    },
    appearance: { ...(nested?.appearance ?? {}), ...(topLevel.appearance ?? {}) },
    locks: { ...(nested?.locks ?? {}), ...(topLevel.locks ?? {}) },
    band: { ...(nested?.band ?? {}), ...(topLevel.band ?? {}) },
  };
}

/** Create a schema-valid, detached Band without using ambient randomness. */
export function createBand(options: BandFactoryOptions): Band {
  if (!isRecord(options)) throw new TypeError('Band factory options must be an object.');
  const { id, overrides, ...topLevel } = options;
  if (typeof id !== 'string' || !isStableId(id, 'component')) {
    throw new RangeError('Band id must be a stable component id.');
  }
  const merged = mergeFactoryOverrides(topLevel, overrides);

  const candidate: Band = {
    id,
    name: merged.name ?? 'Accent band',
    type: 'band',
    transform: {
      translation: {
        x: merged.transform?.translation?.x ?? DEFAULT_TRANSFORM.translation.x,
        y: merged.transform?.translation?.y ?? DEFAULT_TRANSFORM.translation.y,
      },
      baseSize: {
        width: merged.transform?.baseSize?.width ?? DEFAULT_TRANSFORM.baseSize.width,
        height: merged.transform?.baseSize?.height ?? DEFAULT_TRANSFORM.baseSize.height,
      },
      rotationDeg: merged.transform?.rotationDeg ?? DEFAULT_TRANSFORM.rotationDeg,
      uniformScale: merged.transform?.uniformScale ?? DEFAULT_TRANSFORM.uniformScale,
    },
    appearance: {
      softness: merged.appearance?.softness ?? DEFAULT_APPEARANCE.softness,
      highlight: merged.appearance?.highlight ?? DEFAULT_APPEARANCE.highlight,
      grain: merged.appearance?.grain ?? DEFAULT_APPEARANCE.grain,
      asymmetry: merged.appearance?.asymmetry ?? DEFAULT_APPEARANCE.asymmetry,
      blendMode: merged.appearance?.blendMode ?? DEFAULT_APPEARANCE.blendMode,
    },
    colorSource: merged.colorSource ?? { kind: 'local', value: { ...DEFAULT_COLOR } },
    locks: { ...DEFAULT_LOCKS, ...(merged.locks ?? {}) },
    band: { ...DEFAULT_BAND, ...(merged.band ?? {}) },
  };

  assertBand(candidate);
  return candidate;
}

const componentMatrix = (transform: ComponentTransform): MatrixIR => {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scaleX = transform.baseSize.width * transform.uniformScale;
  const scaleY = transform.baseSize.height * transform.uniformScale;
  const a = cosine * scaleX;
  const b = sine * scaleX;
  const c = -sine * scaleY;
  const d = cosine * scaleY;
  return {
    a: quantizeNumber(a),
    b: quantizeNumber(b),
    c: quantizeNumber(c),
    d: quantizeNumber(d),
    e: quantizeNumber(transform.translation.x - (a + c) / 2),
    f: quantizeNumber(transform.translation.y - (b + d) / 2),
  };
};

const point = (x: number, y: number): PathCommand => ({
  kind: 'line',
  x: quantizeNumber(x),
  y: quantizeNumber(y),
});

/** Compile a parametric Band into the shared closed PathIR representation. */
export function compileBandGeometry(band: Band): PathIR {
  assertBand(band);
  const taper = band.band.taper;
  const endHalfWidth = 0.5 * (1 - taper * 0.75);
  const centerY = 0.5;
  const leftX = 0;
  const rightX = 1;
  const commands: PathCommand[] = [
    { kind: 'move', x: quantizeNumber(leftX), y: quantizeNumber(centerY - endHalfWidth) },
  ];

  if (band.band.endCap === 'flat') {
    commands.push(
      point(rightX, centerY - endHalfWidth),
      point(rightX, centerY + endHalfWidth),
      point(leftX, centerY + endHalfWidth),
    );
  } else {
    // A fixed kappa approximation keeps the round-cap shape deterministic and
    // backend-neutral while retaining the parametric Band contract.
    const kappa = 0.5522847498;
    commands.push(point(rightX, centerY - endHalfWidth));
    commands.push({
      kind: 'cubic',
      c1x: quantizeNumber(rightX + endHalfWidth * kappa),
      c1y: quantizeNumber(centerY - endHalfWidth),
      c2x: quantizeNumber(rightX + endHalfWidth * kappa),
      c2y: quantizeNumber(centerY + endHalfWidth),
      x: quantizeNumber(rightX),
      y: quantizeNumber(centerY + endHalfWidth),
    });
    commands.push(point(leftX, centerY + endHalfWidth));
    commands.push({
      kind: 'cubic',
      c1x: quantizeNumber(leftX - endHalfWidth * kappa),
      c1y: quantizeNumber(centerY + endHalfWidth),
      c2x: quantizeNumber(leftX - endHalfWidth * kappa),
      c2y: quantizeNumber(centerY - endHalfWidth),
      x: quantizeNumber(leftX),
      y: quantizeNumber(centerY - endHalfWidth),
    });
  }

  commands.push({ kind: 'close' });
  return {
    kind: 'path',
    version: PATH_IR_VERSION,
    commands: commands as unknown as ClosedPathCommands,
    matrix: componentMatrix(band.transform),
    sourceComponentId: band.id,
  };
}
