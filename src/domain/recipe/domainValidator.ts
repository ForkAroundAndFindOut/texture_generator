import { isStableId } from './ids';
import type { ValidationDiagnostic, ValidationResult } from './diagnostics';
import type { TextureRecipe } from './types';

/**
 * A domain diagnostic is deliberately independent from TypeBox/Ajv.  Shape
 * validation runs before this module in the import pipeline, but this module
 * remains defensive because editor commands can hand it an in-memory value.
 */
export type { ValidationDiagnostic, ValidationResult } from './diagnostics';

// Deliberately use an indexable unknown boundary for defensive runtime input.
// The public function remains typed as TextureRecipe; this local representation
// lets us inspect malformed values without asserting schema validity first.
type JsonRecord = {
  [key: string]: any;
  anchors?: any;
  asymmetry?: any;
  appearance?: any;
  base?: any;
  baseSize?: any;
  band?: any;
  blendMode?: any;
  canvas?: any;
  color?: any;
  colorSource?: any;
  components?: any;
  contrast?: any;
  contour?: any;
  dx?: any;
  dy?: any;
  effects?: any;
  endCap?: any;
  generatorVersion?: any;
  grain?: any;
  height?: any;
  hex?: any;
  highlight?: any;
  id?: any;
  inHandle?: any;
  inputRecipeHash?: any;
  kind?: any;
  label?: any;
  lockDigest?: any;
  locks?: any;
  name?: any;
  opacity?: any;
  operation?: any;
  outHandle?: any;
  palette?: any;
  paletteId?: any;
  provenance?: any;
  rangesProfile?: any;
  rotationDeg?: any;
  schemaVersion?: any;
  scope?: any;
  seed?: any;
  segmentToNext?: any;
  selectedComponentIds?: any;
  softness?: any;
  softnessBias?: any;
  shuffleLocks?: any;
  taper?: any;
  tileMode?: any;
  transform?: any;
  translation?: any;
  type?: any;
  uniformScale?: any;
  value?: any;
  width?: any;
  x?: any;
  y?: any;
};
type Point = { x: number; y: number };
type FlatContour = Point[][];

const UINT32_MAX = 0xffff_ffff;
const CONTOUR_MIN_ANCHORS = 10;
const CONTOUR_MAX_ANCHORS = 64;
const GEOMETRY_EPSILON = 1e-10;
const CUBIC_SUBDIVISIONS = 16;

const SCOPE_KEYS = [
  'baseColor',
  'baseOpacity',
  'paletteCount',
  'paletteValues',
  'componentCount',
  'componentColors',
  'componentGeometry',
  'anchorCount',
  'translation',
  'rotation',
  'uniformScale',
  'aspect',
  'effects',
] as const;

const asRecord = (value: unknown): JsonRecord | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const samePoint = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;

const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const between = (value: number, a: number, b: number): boolean =>
  value >= Math.min(a, b) - GEOMETRY_EPSILON && value <= Math.max(a, b) + GEOMETRY_EPSILON;

const onSegment = (a: Point, b: Point, point: Point): boolean =>
  Math.abs(cross(a, b, point)) <= GEOMETRY_EPSILON &&
  between(point.x, a.x, b.x) &&
  between(point.y, a.y, b.y);

type SegmentIntersection = { intersects: boolean; point?: Point };

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): SegmentIntersection {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return { intersects: true };
  }

  for (const point of [c, d, a, b]) {
    if (onSegment(a, b, point) && onSegment(c, d, point)) return { intersects: true, point };
  }
  return { intersects: false };
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const oneMinusT = 1 - t;
  const a = oneMinusT * oneMinusT * oneMinusT;
  const b = 3 * oneMinusT * oneMinusT * t;
  const c = 3 * oneMinusT * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function contourSegments(anchors: readonly JsonRecord[]): FlatContour {
  return anchors.map((anchor, index) => {
    const next = anchors[(index + 1) % anchors.length];
    if (next === undefined) return [];
    const start: Point = { x: Number(anchor.x), y: Number(anchor.y) };
    const end: Point = { x: Number(next.x), y: Number(next.y) };
    const bend = asRecord(anchor.segmentToNext);
    if (bend?.kind !== 'cubic') return [start, end];

    const outHandle = asRecord(bend.outHandle);
    const inHandle = asRecord(bend.inHandle);
    if (outHandle === null || inHandle === null) return [start, end];
    const control1: Point = {
      x: start.x + Number(outHandle.dx),
      y: start.y + Number(outHandle.dy),
    };
    const control2: Point = {
      x: end.x + Number(inHandle.dx),
      y: end.y + Number(inHandle.dy),
    };
    return Array.from({ length: CUBIC_SUBDIVISIONS + 1 }, (_, part) =>
      cubicPoint(start, control1, control2, end, part / CUBIC_SUBDIVISIONS),
    );
  });
}

function contourIsSimple(segments: FlatContour): boolean {
  const edgeCount = segments.length;
  for (let edgeA = 0; edgeA < edgeCount; edgeA += 1) {
    const polylineA = segments[edgeA] ?? [];
    for (let edgeB = edgeA; edgeB < edgeCount; edgeB += 1) {
      const polylineB = segments[edgeB] ?? [];
      if (edgeA === edgeB) {
        // A cubic can loop back into itself.  Adjacent subdivisions share a
        // vertex by construction and are therefore intentionally skipped.
        for (let segmentA = 0; segmentA + 1 < polylineA.length; segmentA += 1) {
          for (let segmentB = segmentA + 2; segmentB + 1 < polylineA.length; segmentB += 1) {
            const intersection = segmentIntersection(
              polylineA[segmentA]!,
              polylineA[segmentA + 1]!,
              polylineA[segmentB]!,
              polylineA[segmentB + 1]!,
            );
            if (intersection.intersects) return false;
          }
        }
        continue;
      }

      const adjacent = edgeB === edgeA + 1 || (edgeA === 0 && edgeB === edgeCount - 1);
      for (let segmentA = 0; segmentA + 1 < polylineA.length; segmentA += 1) {
        for (let segmentB = 0; segmentB + 1 < polylineB.length; segmentB += 1) {
          const intersection = segmentIntersection(
            polylineA[segmentA]!,
            polylineA[segmentA + 1]!,
            polylineB[segmentB]!,
            polylineB[segmentB + 1]!,
          );
          if (!intersection.intersects) continue;
          if (!adjacent) return false;

          const shared = edgeB === edgeA + 1 ? polylineA[polylineA.length - 1] : polylineA[0];
          if (intersection.point === undefined || shared === undefined) return false;
          if (!samePoint(intersection.point, shared)) return false;
        }
      }
    }
  }
  return true;
}

function polygonArea(anchors: readonly JsonRecord[]): number {
  let area = 0;
  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index];
    const next = anchors[(index + 1) % anchors.length];
    if (current === undefined || next === undefined) continue;
    area += Number(current.x) * Number(next.y) - Number(next.x) * Number(current.y);
  }
  return area / 2;
}

function validateRecipeDomain(recipe: TextureRecipe): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const nonFinitePaths = new Set<string>();
  const add = (
    code: string,
    path: string,
    message: string,
    recovery: string,
    entityId?: string,
  ): void => {
    const diagnostic: ValidationDiagnostic = { code, path, message, recovery };
    if (entityId !== undefined) diagnostic.entityId = entityId;
    diagnostics.push(diagnostic);
  };

  const collectNonFinite = (value: unknown, path: string, seen: WeakSet<object>): void => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        nonFinitePaths.add(path);
        add(
          'non-finite-number',
          path,
          `Recipe number at ${path} must be finite.`,
          'Replace NaN or infinity with a finite value within the schema range.',
        );
      }
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => collectNonFinite(entry, `${path}/${index}`, seen));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      collectNonFinite(entry, `${path}/${key}`, seen);
    }
  };

  collectNonFinite(recipe, '', new WeakSet<object>());
  const root = asRecord(recipe);
  if (root === null) {
    add(
      'invalid-recipe',
      '/',
      'Recipe must be an object.',
      'Provide a complete TextureRecipe object.',
    );
    return { ok: false, diagnostics };
  }

  const number = (
    value: unknown,
    path: string,
    min?: number,
    max?: number,
    exclusiveMax = false,
  ): void => {
    if (typeof value !== 'number') {
      add(
        'invalid-number',
        path,
        `Expected a number at ${path}.`,
        'Provide a finite numeric value.',
      );
      return;
    }
    if (nonFinitePaths.has(path)) return;
    if (min !== undefined && value < min) {
      add(
        'out-of-range-number',
        path,
        `Number at ${path} is below ${min}.`,
        'Use a value within the documented range.',
      );
    }
    if (max !== undefined && (exclusiveMax ? value >= max : value > max)) {
      add(
        'out-of-range-number',
        path,
        `Number at ${path} exceeds the allowed range.`,
        'Use a value within the documented range.',
      );
    }
  };
  const integer = (value: unknown, path: string, min: number, max: number): void => {
    number(value, path, min, max);
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
      add(
        'non-integer-number',
        path,
        `Number at ${path} must be an integer.`,
        'Use an integer value.',
      );
    }
  };
  const boolean = (value: unknown, path: string): void => {
    if (typeof value !== 'boolean') {
      add('invalid-boolean', path, `Expected a boolean at ${path}.`, 'Provide true or false.');
    }
  };
  const id = (
    value: unknown,
    kind: 'palette' | 'component' | 'anchor',
    path: string,
    seen: Map<string, string>,
  ): string | null => {
    if (
      typeof value !== 'string' ||
      !isStableId(
        value,
        kind === 'palette' ? 'palette' : kind === 'component' ? 'component' : 'anchor',
      )
    ) {
      add(
        'invalid-stable-id',
        path,
        `Stable ${kind} identity at ${path} is malformed.`,
        'Use the lowercase prefixed 128-bit stable ID format.',
      );
      return null;
    }
    const priorPath = seen.get(value);
    if (priorPath !== undefined) {
      add(
        'duplicate-id',
        path,
        `Stable ${kind} ID ${value} is duplicated.`,
        'Give each durable entity a unique stable ID.',
        value,
      );
    } else {
      seen.set(value, path);
    }
    return value;
  };
  const colorValue = (value: unknown, path: string): void => {
    const color = asRecord(value);
    if (color === null) {
      add(
        'invalid-color-value',
        path,
        `Color value at ${path} must be an object.`,
        'Provide { hex, opacity }.',
      );
      return;
    }
    if (typeof color.hex !== 'string' || !/^#[0-9A-F]{6}$/.test(color.hex)) {
      add(
        'malformed-color',
        `${path}/hex`,
        `Color at ${path}/hex is not canonical uppercase #RRGGBB.`,
        'Use an uppercase six-digit sRGB color.',
      );
    }
    number(color.opacity, `${path}/opacity`, 0, 1);
  };

  const paletteIds = new Map<string, string>();
  const componentIds = new Map<string, string>();
  const anchorIds = new Map<string, string>();
  const paletteIdList: string[] = [];
  const componentIdList: string[] = [];

  if (root.schemaVersion !== '0.1.0') {
    add(
      'unsupported-version',
      '/schemaVersion',
      'Recipe schemaVersion must be 0.1.0.',
      'Migrate the recipe to the supported schema version.',
    );
  }

  const canvas = asRecord(root.canvas);
  if (canvas !== null) {
    integer(canvas.width, '/canvas/width', 16, 8192);
    integer(canvas.height, '/canvas/height', 16, 8192);
    boolean(canvas.tileMode, '/canvas/tileMode');
  }

  const base = asRecord(root.base);
  if (base !== null) {
    colorValue(base.value, '/base/value');
    const locks = asRecord(base.locks);
    if (locks !== null) {
      boolean(locks.color, '/base/locks/color');
      boolean(locks.opacity, '/base/locks/opacity');
    } else {
      add(
        'invalid-locks',
        '/base/locks',
        'Base lock state must be an object with color and opacity booleans.',
        'Provide a complete BaseLocks value.',
      );
    }
  }

  const palette = asArray(root.palette);
  if (palette !== null) {
    palette.forEach((entry, index) => {
      const value = asRecord(entry);
      if (value === null) return;
      const entryId = id(value.id, 'palette', `/palette/${index}/id`, paletteIds);
      if (entryId !== null) paletteIdList.push(entryId);
      if (typeof value.label !== 'string' || value.label.length < 1 || value.label.length > 80) {
        add(
          'invalid-label',
          `/palette/${index}/label`,
          'Palette labels must contain 1-80 characters.',
          'Use a short non-empty label.',
        );
      }
      colorValue(value.value, `/palette/${index}/value`);
      const locks = asRecord(value.locks);
      if (locks !== null) {
        for (const key of ['identity', 'color', 'opacity'])
          boolean(locks[key], `/palette/${index}/locks/${key}`);
      } else {
        add(
          'invalid-locks',
          `/palette/${index}/locks`,
          'Palette lock state must be an object with identity, color, and opacity booleans.',
          'Provide a complete PaletteLocks value.',
        );
      }
    });
  }
  const knownPaletteIds = new Set(paletteIdList);

  const checkTransform = (value: unknown, path: string): void => {
    const transform = asRecord(value);
    if (transform === null) return;
    const translation = asRecord(transform.translation);
    if (translation !== null) {
      number(translation.x, `${path}/translation/x`, -2, 3);
      number(translation.y, `${path}/translation/y`, -2, 3);
    }
    const baseSize = asRecord(transform.baseSize);
    if (baseSize !== null) {
      number(baseSize.width, `${path}/baseSize/width`, 0.001, 4);
      number(baseSize.height, `${path}/baseSize/height`, 0.001, 4);
    }
    number(transform.rotationDeg, `${path}/rotationDeg`, -180, 180, true);
    number(transform.uniformScale, `${path}/uniformScale`, 0.05, 4);
  };
  const checkAppearance = (value: unknown, path: string): void => {
    const appearance = asRecord(value);
    if (appearance === null) return;
    number(appearance.softness, `${path}/softness`, 0, 1);
    number(appearance.highlight, `${path}/highlight`, 0, 1);
    number(appearance.grain, `${path}/grain`, 0, 1);
    number(appearance.asymmetry, `${path}/asymmetry`, -1, 1);
    if (
      !['normal', 'multiply', 'screen', 'overlay', 'soft-light'].includes(
        String(appearance.blendMode),
      )
    ) {
      add(
        'invalid-blend-mode',
        `${path}/blendMode`,
        `Unsupported blend mode at ${path}/blendMode.`,
        'Use one of the supported blend modes.',
      );
    }
  };
  const checkSource = (value: unknown, path: string, componentId?: string): void => {
    const source = asRecord(value);
    if (source === null) return;
    if (source.kind === 'palette') {
      if (typeof source.paletteId !== 'string' || !knownPaletteIds.has(source.paletteId)) {
        add(
          'dangling-palette-reference',
          `${path}/paletteId`,
          `Palette reference ${String(source.paletteId)} does not resolve.`,
          'Choose an existing palette ID or detach the component color.',
          componentId,
        );
      }
      return;
    }
    if (source.kind === 'local') {
      colorValue(source.value, `${path}/value`);
      return;
    }
    add(
      'invalid-color-source',
      `${path}/kind`,
      `Color source kind at ${path} is unsupported.`,
      'Use palette or local color source.',
      componentId,
    );
  };

  const checkContour = (value: unknown, path: string, componentId: string): void => {
    const contour = asRecord(value);
    const anchors = contour === null ? null : asArray(contour.anchors);
    if (anchors === null) {
      add(
        'invalid-contour',
        `${path}/anchors`,
        'Field contour must contain an anchors array.',
        'Provide a simple closed canonical contour.',
        componentId,
      );
      return;
    }
    if (anchors.length < CONTOUR_MIN_ANCHORS || anchors.length > CONTOUR_MAX_ANCHORS) {
      add(
        'invalid-anchor-count',
        `${path}/anchors`,
        `Field contours require ${CONTOUR_MIN_ANCHORS}-${CONTOUR_MAX_ANCHORS} anchors.`,
        'Resample the contour to the supported anchor range.',
        componentId,
      );
    }
    const anchorRecords: JsonRecord[] = [];
    anchors.forEach((rawAnchor, anchorIndex) => {
      const anchor = asRecord(rawAnchor);
      if (anchor === null) return;
      anchorRecords.push(anchor);
      const anchorId = id(anchor.id, 'anchor', `${path}/anchors/${anchorIndex}/id`, anchorIds);
      number(anchor.x, `${path}/anchors/${anchorIndex}/x`, 0, 1);
      number(anchor.y, `${path}/anchors/${anchorIndex}/y`, 0, 1);
      const bend = asRecord(anchor.segmentToNext);
      if (bend?.kind === 'cubic') {
        for (const handleName of ['outHandle', 'inHandle']) {
          const handle = asRecord(bend[handleName]);
          if (handle !== null) {
            number(
              handle.dx,
              `${path}/anchors/${anchorIndex}/segmentToNext/${handleName}/dx`,
              -2,
              2,
            );
            number(
              handle.dy,
              `${path}/anchors/${anchorIndex}/segmentToNext/${handleName}/dy`,
              -2,
              2,
            );
          }
        }
      }
      if (anchorId === null) return;
    });
    if (anchorRecords.length < 3) return;
    for (let index = 0; index < anchorRecords.length; index += 1) {
      const current = anchorRecords[index];
      const next = anchorRecords[(index + 1) % anchorRecords.length];
      if (current === undefined || next === undefined) continue;
      const currentPoint: Point = { x: Number(current.x), y: Number(current.y) };
      const nextPoint: Point = { x: Number(next.x), y: Number(next.y) };
      if (samePoint(currentPoint, nextPoint)) {
        add(
          'duplicate-contour-point',
          `${path}/anchors/${index}`,
          'Contour contains consecutive duplicate points.',
          'Remove duplicate anchors or simplify the contour.',
          componentId,
        );
      }
    }
    if (Math.abs(polygonArea(anchorRecords)) <= GEOMETRY_EPSILON) {
      add(
        'degenerate-contour',
        path,
        'Field contour has zero or negligible signed area.',
        'Draw a non-degenerate closed contour.',
        componentId,
      );
    }
    if (
      anchorRecords.every(
        (anchor) =>
          typeof anchor.x === 'number' &&
          Number.isFinite(anchor.x) &&
          typeof anchor.y === 'number' &&
          Number.isFinite(anchor.y),
      )
    ) {
      if (!contourIsSimple(contourSegments(anchorRecords))) {
        add(
          'self-intersecting-contour',
          path,
          'Field contour must be a simple non-self-intersecting ring.',
          'Resolve crossings and submit one outer contour.',
          componentId,
        );
      }
    }
  };

  const components = asArray(root.components);
  if (components !== null) {
    components.forEach((entry, index) => {
      const component = asRecord(entry);
      if (component === null) return;
      const componentId = id(component.id, 'component', `/components/${index}/id`, componentIds);
      if (componentId !== null) componentIdList.push(componentId);
      checkTransform(component.transform, `/components/${index}/transform`);
      checkAppearance(component.appearance, `/components/${index}/appearance`);
      checkSource(
        component.colorSource,
        `/components/${index}/colorSource`,
        componentId ?? undefined,
      );
      const locks = asRecord(component.locks);
      if (locks !== null) {
        const keys =
          component.type === 'field'
            ? [
                'identity',
                'colorSource',
                'geometry',
                'translation',
                'rotation',
                'uniformScale',
                'aspect',
                'anchorCount',
              ]
            : [
                'identity',
                'colorSource',
                'geometry',
                'translation',
                'rotation',
                'uniformScale',
                'aspect',
              ];
        for (const key of keys) boolean(locks[key], `/components/${index}/locks/${key}`);
      } else {
        add(
          'invalid-locks',
          `/components/${index}/locks`,
          'Component lock state must be an object with the fields for its component type.',
          'Provide a complete component lock value.',
        );
      }
      if (component.type === 'field' && componentId !== null) {
        checkContour(component.contour, `/components/${index}/contour`, componentId);
      } else if (component.type === 'band') {
        const band = asRecord(component.band);
        if (band !== null) {
          if (!['round', 'flat'].includes(String(band.endCap))) {
            add(
              'invalid-band-shape',
              `/components/${index}/band/endCap`,
              'Band endCap must be round or flat.',
              'Use a supported end cap.',
            );
          }
          number(band.taper, `/components/${index}/band/taper`, 0, 1);
        }
      }
    });
  }

  const effects = asRecord(root.effects);
  if (effects !== null) {
    number(effects.grain, '/effects/grain', 0, 1);
    number(effects.contrast, '/effects/contrast', -1, 1);
    number(effects.softnessBias, '/effects/softnessBias', -1, 1);
  }
  const shuffleLocks = asRecord(root.shuffleLocks);
  if (shuffleLocks !== null) {
    for (const key of ['paletteCount', 'componentCount', 'effects'])
      boolean(shuffleLocks[key], `/shuffleLocks/${key}`);
  }

  const provenance = root.provenance === undefined ? null : asRecord(root.provenance);
  if (root.provenance !== undefined && provenance === null) {
    add(
      'invalid-provenance',
      '/provenance',
      'Generator provenance must be an object.',
      'Remove provenance or provide a complete supported record.',
    );
  }
  if (provenance !== null) {
    const operation = provenance.operation;
    if (operation !== 'generate' && operation !== 'shuffle') {
      add(
        'invalid-provenance-operation',
        '/provenance/operation',
        'Provenance operation must be generate or shuffle.',
        'Use a supported generator operation.',
      );
    }
    integer(provenance.seed, '/provenance/seed', 0, UINT32_MAX);
    if (provenance.generatorVersion !== 'xoshiro128ss-v1') {
      add(
        'unsupported-generator-version',
        '/provenance/generatorVersion',
        'Only xoshiro128ss-v1 provenance is supported.',
        'Replay with the matching generator version.',
      );
    }
    if (provenance.rangesProfile !== 'texture-lab-ranges-v1') {
      add(
        'unsupported-ranges-profile',
        '/provenance/rangesProfile',
        'Only texture-lab-ranges-v1 is supported.',
        'Replay with the matching ranges profile.',
      );
    }
    if (
      typeof provenance.inputRecipeHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(provenance.inputRecipeHash)
    ) {
      add(
        'invalid-provenance-hash',
        '/provenance/inputRecipeHash',
        'inputRecipeHash must be lowercase SHA-256 hex.',
        'Provide a 64-character lowercase SHA-256 digest.',
      );
    }
    if (
      typeof provenance.lockDigest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(provenance.lockDigest)
    ) {
      add(
        'invalid-provenance-hash',
        '/provenance/lockDigest',
        'lockDigest must be lowercase SHA-256 hex.',
        'Provide a 64-character lowercase SHA-256 digest.',
      );
    }
    const scope = asRecord(provenance.scope);
    if (scope === null) {
      add(
        'invalid-provenance-scope',
        '/provenance/scope',
        'Provenance scope must be an object.',
        'Provide all AppliedShuffleScope flags.',
      );
    } else {
      for (const key of SCOPE_KEYS) {
        boolean(scope[key], `/provenance/scope/${key}`);
      }
    }

    const selected = asArray(provenance.selectedComponentIds);
    if (selected === null) {
      add(
        'invalid-provenance-selection',
        '/provenance/selectedComponentIds',
        'selectedComponentIds must be an array.',
        'Provide component IDs in canonical component order.',
      );
    } else {
      const selectedSet = new Set<string>();
      let previousIndex = -1;
      selected.forEach((selectedId, index) => {
        if (typeof selectedId !== 'string' || !isStableId(selectedId, 'component')) {
          add(
            'invalid-provenance-target',
            `/provenance/selectedComponentIds/${index}`,
            `Selected component ID ${String(selectedId)} is malformed.`,
            'Select existing components by stable ID.',
          );
          return;
        }
        if (selectedSet.has(selectedId)) {
          add(
            'duplicate-provenance-target',
            `/provenance/selectedComponentIds/${index}`,
            `Selected component ID ${selectedId} is duplicated.`,
            'List each selected component exactly once.',
            selectedId,
          );
          return;
        }
        selectedSet.add(selectedId);
        const componentIndex = componentIdList.indexOf(selectedId);
        if (componentIndex < 0) {
          add(
            'invalid-provenance-target',
            `/provenance/selectedComponentIds/${index}`,
            `Selected component ID ${selectedId} does not exist in the recipe.`,
            'Remove deleted targets or select an existing component.',
            selectedId,
          );
          return;
        }
        if (componentIndex < previousIndex) {
          add(
            'non-canonical-provenance-order',
            `/provenance/selectedComponentIds/${index}`,
            'Selected component IDs must follow canonical component z-order.',
            'Preserve the recipe component array order.',
            selectedId,
          );
        }
        previousIndex = componentIndex;
      });
    }
  }

  return diagnostics.length === 0 ? { ok: true } : { ok: false, diagnostics };
}

export { validateRecipeDomain };
