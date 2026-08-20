import { isStableId, stableIdFromBytes } from '../recipe/ids';
import type {
  ComponentAppearance,
  ComponentId,
  ComponentTransform,
  Field,
  FieldComponentLocks,
  ShapeAnchor,
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

export interface DefaultFieldFactoryOptions {
  id: ComponentId;
  createAnchorId: (index: number) => ShapeAnchor['id'];
}

const DEFAULT_TRANSFORM: ComponentTransform = {
  translation: { x: 0.5, y: 0.5 },
  baseSize: { width: 0.82, height: 0.64 },
  rotationDeg: -12,
  uniformScale: 1,
};

const DEFAULT_APPEARANCE: ComponentAppearance = {
  softness: 0.64,
  highlight: 0.28,
  grain: 0.08,
  asymmetry: 0.12,
  blendMode: 'screen',
};

const DEFAULT_LOCKS: FieldComponentLocks = {
  identity: false,
  colorSource: false,
  geometry: false,
  translation: false,
  rotation: false,
  uniformScale: false,
  aspect: false,
  anchorCount: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

function assertTransform(value: unknown): asserts value is ComponentTransform {
  if (!isRecord(value)) throw new RangeError('Field transform must be an object.');
  const translation = value['translation'];
  const baseSize = value['baseSize'];
  if (
    !isRecord(translation) ||
    !finiteInRange(translation['x'], -2, 3) ||
    !finiteInRange(translation['y'], -2, 3)
  ) {
    throw new RangeError('Field translation must be finite and within [-2, 3].');
  }
  if (
    !isRecord(baseSize) ||
    !finiteInRange(baseSize['width'], 0.001, 4) ||
    !finiteInRange(baseSize['height'], 0.001, 4)
  ) {
    throw new RangeError('Field base size must be finite and within (0, 4].');
  }
  if (!finiteInRange(value['rotationDeg'], -180, 180) || value['rotationDeg'] === 180) {
    throw new RangeError('Field rotation must be finite and in [-180, 180).');
  }
  if (!finiteInRange(value['uniformScale'], 0.05, 4)) {
    throw new RangeError('Field scale must be finite and within [0.05, 4].');
  }
}

const orientation = (a: ShapeAnchor, b: ShapeAnchor, c: ShapeAnchor): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const between = (a: number, b: number, value: number): boolean =>
  value >= Math.min(a, b) && value <= Math.max(a, b);

const segmentsIntersect = (
  a: ShapeAnchor,
  b: ShapeAnchor,
  c: ShapeAnchor,
  d: ShapeAnchor,
): boolean => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const epsilon = 1e-12;
  const onSegment = (start: ShapeAnchor, end: ShapeAnchor, point: ShapeAnchor, value: number) =>
    Math.abs(value) <= epsilon &&
    between(start.x, end.x, point.x) &&
    between(start.y, end.y, point.y);
  if (
    onSegment(a, b, c, abC) ||
    onSegment(a, b, d, abD) ||
    onSegment(c, d, a, cdA) ||
    onSegment(c, d, b, cdB)
  ) {
    return true;
  }
  return abC > epsilon !== abD > epsilon && cdA > epsilon !== cdB > epsilon;
};

function assertField(value: unknown): asserts value is Field {
  if (!isRecord(value) || value['type'] !== 'field')
    throw new TypeError('Expected a Field component.');
  const id = value['id'];
  if (typeof id !== 'string' || !isStableId(id, 'component')) {
    throw new RangeError('Field id must be a stable component id.');
  }
  const name = value['name'];
  if (typeof name !== 'string' || name.length < 1 || name.length > 80) {
    throw new RangeError('Field name must contain 1-80 characters.');
  }
  assertTransform(value['transform']);

  const locks = value['locks'];
  if (
    !isRecord(locks) ||
    !Object.keys(DEFAULT_LOCKS).every((key) => typeof locks[key] === 'boolean')
  ) {
    throw new RangeError('Field locks are invalid.');
  }

  const contour = value['contour'];
  if (!isRecord(contour) || !Array.isArray(contour['anchors'])) {
    throw new RangeError('Field contour must contain anchors.');
  }
  const anchors = contour['anchors'];
  if (anchors.length < 10 || anchors.length > 64) {
    throw new RangeError('Field contours require 10-64 anchors.');
  }

  const seen = new Set<string>();
  const typedAnchors: ShapeAnchor[] = [];
  for (const candidate of anchors) {
    if (!isRecord(candidate)) throw new RangeError('Field anchors must be objects.');
    const anchorId = candidate['id'];
    if (typeof anchorId !== 'string' || !isStableId(anchorId, 'anchor') || seen.has(anchorId)) {
      throw new RangeError('Field anchor ids must be unique stable ids.');
    }
    seen.add(anchorId);
    if (!finiteInRange(candidate['x'], 0, 1) || !finiteInRange(candidate['y'], 0, 1)) {
      throw new RangeError('Field anchor coordinates must be finite normalized values.');
    }
    const segment = candidate['segmentToNext'];
    if (!isRecord(segment) || (segment['kind'] !== 'line' && segment['kind'] !== 'cubic')) {
      throw new RangeError('Field anchor segment must be a line or cubic bend.');
    }
    if (segment['kind'] === 'cubic') {
      for (const handleName of ['outHandle', 'inHandle']) {
        const handle = segment[handleName];
        if (
          !isRecord(handle) ||
          !finiteInRange(handle['dx'], -2, 2) ||
          !finiteInRange(handle['dy'], -2, 2)
        ) {
          throw new RangeError('Field cubic handles must be finite values within [-2, 2].');
        }
      }
    }
    typedAnchors.push(candidate as unknown as ShapeAnchor);
  }

  let area = 0;
  for (let index = 0; index < typedAnchors.length; index += 1) {
    const current = typedAnchors[index]!;
    const next = typedAnchors[(index + 1) % typedAnchors.length]!;
    area += current.x * next.y - next.x * current.y;
    if (current.x === next.x && current.y === next.y) {
      throw new RangeError('Field contours cannot contain consecutive duplicate points.');
    }
  }
  if (Math.abs(area) <= 1e-12) throw new RangeError('Field contour area must be nonzero.');

  for (let first = 0; first < typedAnchors.length; first += 1) {
    const firstNext = (first + 1) % typedAnchors.length;
    for (let second = first + 1; second < typedAnchors.length; second += 1) {
      const secondNext = (second + 1) % typedAnchors.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (
        (first === 0 && secondNext === typedAnchors.length - 1) ||
        (second === 0 && firstNext === typedAnchors.length - 1)
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          typedAnchors[first]!,
          typedAnchors[firstNext]!,
          typedAnchors[second]!,
          typedAnchors[secondNext]!,
        )
      ) {
        throw new RangeError('Field contour must be a simple non-self-intersecting ring.');
      }
    }
  }
}

/** Create a deterministic ten-anchor Field with explicit caller-owned IDs. */
export function createDefaultField(options: DefaultFieldFactoryOptions): Field {
  if (
    !isRecord(options) ||
    typeof options.id !== 'string' ||
    typeof options.createAnchorId !== 'function'
  ) {
    throw new TypeError('Field factory requires an id and createAnchorId callback.');
  }
  if (!isStableId(options.id, 'component'))
    throw new RangeError('Field id must be a stable component id.');

  const anchors: ShapeAnchor[] = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
    const anchor = {
      id: options.createAnchorId(index),
      x: quantizeNumber(0.5 + Math.cos(angle) * 0.38),
      y: quantizeNumber(0.5 + Math.sin(angle) * 0.38),
      segmentToNext: { kind: 'line' as const },
    };
    return anchor;
  });

  const paletteId = stableIdFromBytes('palette', new Uint8Array(16));
  const field: Field = {
    id: options.id,
    name: 'Primary field',
    type: 'field',
    transform: {
      translation: { ...DEFAULT_TRANSFORM.translation },
      baseSize: { ...DEFAULT_TRANSFORM.baseSize },
      rotationDeg: DEFAULT_TRANSFORM.rotationDeg,
      uniformScale: DEFAULT_TRANSFORM.uniformScale,
    },
    appearance: { ...DEFAULT_APPEARANCE },
    colorSource: { kind: 'palette', paletteId },
    locks: { ...DEFAULT_LOCKS },
    contour: { anchors },
  };
  assertField(field);
  return field;
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

/** Compile the ordered Field contour into one closed, provenance-carrying PathIR. */
export function compileFieldGeometry(field: Field): PathIR {
  assertField(field);
  const anchors = field.contour.anchors;
  const commands: PathCommand[] = [
    { kind: 'move', x: quantizeNumber(anchors[0]!.x), y: quantizeNumber(anchors[0]!.y) },
  ];

  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index]!;
    const next = anchors[(index + 1) % anchors.length]!;
    if (current.segmentToNext.kind === 'line') {
      commands.push({ kind: 'line', x: quantizeNumber(next.x), y: quantizeNumber(next.y) });
    } else {
      commands.push({
        kind: 'cubic',
        c1x: quantizeNumber(current.x + current.segmentToNext.outHandle.dx),
        c1y: quantizeNumber(current.y + current.segmentToNext.outHandle.dy),
        c2x: quantizeNumber(next.x + current.segmentToNext.inHandle.dx),
        c2y: quantizeNumber(next.y + current.segmentToNext.inHandle.dy),
        x: quantizeNumber(next.x),
        y: quantizeNumber(next.y),
      });
    }
  }

  commands.push({ kind: 'close' });
  return {
    kind: 'path',
    version: PATH_IR_VERSION,
    commands: commands as unknown as ClosedPathCommands,
    matrix: componentMatrix(field.transform),
    sourceComponentId: field.id,
    sourceAnchorIds: anchors.map(({ id }) => id),
  };
}
