import { validateBoundary } from '../geometry/boundary';

import { isSceneV03Id } from './ids';
import {
  ARTBOARD_FIT_MODES,
  ARTBOARD_RATIOS,
  GRAIN_KINDS,
  INTERACTION_MODES,
  SCENE_V03_SCHEMA_VERSION,
  type SceneV03,
  type SceneV03IdKind,
} from './types';

const COLOR_PATTERN = /^#[0-9A-F]{6}$/u;
const MAX_NAME_LENGTH = 80;
const MAX_GROUP_DEPTH = 64;
const MAX_UINT32 = 4_294_967_295;

type JsonRecord = Record<string, unknown>;

export type SceneV03ValidationDiagnostic = {
  code: string;
  path: string;
  message: string;
  recovery: string;
  entityId?: string;
};

export type SceneV03ValidationResult =
  { ok: true } | { ok: false; diagnostics: SceneV03ValidationDiagnostic[] };

type ValidationContext = {
  diagnostics: SceneV03ValidationDiagnostic[];
  seenIds: Set<string>;
  paletteIds: Set<string>;
  paletteReferences: Array<{ id: string; path: string }>;
};

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const hasOwn = (value: JsonRecord, key: string): boolean => Object.hasOwn(value, key);

function add(
  context: ValidationContext,
  code: string,
  path: string,
  message: string,
  recovery: string,
  entityId?: string,
): void {
  context.diagnostics.push({
    code,
    path,
    message,
    recovery,
    ...(entityId === undefined ? {} : { entityId }),
  });
}

function checkRecord(
  context: ValidationContext,
  value: unknown,
  path: string,
  message: string,
): JsonRecord | null {
  const record = asRecord(value);
  if (record === null) {
    add(context, 'invalid-object', path, message, 'Provide an object with the documented fields.');
  }
  return record;
}

function checkKeys(
  context: ValidationContext,
  record: JsonRecord,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  for (const key of required) {
    if (!hasOwn(record, key)) {
      add(
        context,
        'missing-property',
        path + '/' + key,
        'Scene data is missing required property ' + key + '.',
        'Add the required property and try again.',
      );
    }
  }

  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      add(
        context,
        'unknown-property',
        path + '/' + key,
        'Scene data has an unsupported property ' + key + '.',
        'Remove the unsupported property or use a supported scene version.',
      );
    }
  }
}

function checkString(
  context: ValidationContext,
  value: unknown,
  path: string,
  minLength = 0,
  maxLength = Number.POSITIVE_INFINITY,
): string | null {
  if (typeof value !== 'string') {
    add(context, 'invalid-string', path, 'Expected a string.', 'Provide a text value.');
    return null;
  }
  if (value.length < minLength || value.length > maxLength) {
    add(
      context,
      'invalid-string-length',
      path,
      'Text is outside the supported length.',
      'Use between ' + minLength + ' and ' + maxLength + ' characters.',
    );
    return null;
  }
  return value;
}

function checkName(context: ValidationContext, value: unknown, path: string): void {
  const text = checkString(context, value, path, 1, MAX_NAME_LENGTH);
  if (text !== null && text.trim().length === 0) {
    add(context, 'blank-name', path, 'A name cannot be blank.', 'Enter a descriptive name.');
  }
}

function checkBoolean(context: ValidationContext, value: unknown, path: string): void {
  if (typeof value !== 'boolean') {
    add(context, 'invalid-boolean', path, 'Expected true or false.', 'Choose a boolean value.');
  }
}

function checkNumber(
  context: ValidationContext,
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    add(context, 'invalid-number', path, 'Expected a finite number.', 'Provide a finite number.');
    return;
  }
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    add(
      context,
      'out-of-range-number',
      path,
      'Number is outside the supported range.',
      'Use a value from ' + minimum + ' through ' + maximum + '.',
    );
  }
}

function checkColor(context: ValidationContext, value: unknown, path: string): void {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    add(
      context,
      'invalid-color',
      path,
      'Color must use uppercase six-digit #RRGGBB.',
      'Use an uppercase color such as #AABBCC.',
    );
  }
}

function checkId(
  context: ValidationContext,
  value: unknown,
  kind: SceneV03IdKind,
  path: string,
): string | null {
  if (typeof value !== 'string' || !isSceneV03Id(value, kind)) {
    add(
      context,
      'invalid-id',
      path,
      'Scene identity has an invalid ' + kind + ' ID.',
      'Use a lowercase stable ' + kind + ' ID.',
    );
    return null;
  }
  if (context.seenIds.has(value)) {
    add(
      context,
      'duplicate-id',
      path,
      'Scene identity ' + value + ' is duplicated.',
      'Give each durable identity a unique value.',
      value,
    );
  }
  context.seenIds.add(value);
  return value;
}

function checkPaletteReference(
  context: ValidationContext,
  value: unknown,
  path: string,
): string | null {
  if (typeof value !== 'string' || !isSceneV03Id(value, 'palette')) {
    add(
      context,
      'invalid-palette-reference',
      path,
      'Palette fill must reference a valid palette ID.',
      'Choose a palette color or use a custom color.',
    );
    return null;
  }
  context.paletteReferences.push({ id: value, path });
  return value;
}

function checkPoint(
  context: ValidationContext,
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): void {
  const point = checkRecord(context, value, path, 'Point must be an object.');
  if (point === null) return;
  checkKeys(context, point, path, ['x', 'y']);
  checkNumber(context, point['x'], path + '/x', minimum, maximum);
  checkNumber(context, point['y'], path + '/y', minimum, maximum);
}

function checkTransform(context: ValidationContext, value: unknown, path: string): void {
  const transform = checkRecord(context, value, path, 'Group transform must be an object.');
  if (transform === null) return;
  checkKeys(context, transform, path, ['translation', 'uniformScale', 'rotationDeg']);
  checkPoint(context, transform['translation'], path + '/translation', -2, 3);
  checkNumber(context, transform['uniformScale'], path + '/uniformScale', 0.05, 4);
  checkNumber(context, transform['rotationDeg'], path + '/rotationDeg', -180, 179.999999);
}

function checkBoundary(context: ValidationContext, value: unknown, path: string): void {
  const boundary = checkRecord(context, value, path, 'Boundary must be an object.');
  if (boundary === null) return;
  checkKeys(context, boundary, path, ['vertices']);
  const validation = validateBoundary(boundary);
  if (validation.ok) return;
  for (const issue of validation.issues) {
    add(
      context,
      issue.code,
      path + (issue.path === '/' ? '' : issue.path),
      issue.message,
      'Provide one simple closed Boundary with 3 to 64 normalized vertices.',
    );
  }
}

function checkGeometry(context: ValidationContext, value: unknown, path: string): void {
  const geometry = checkRecord(context, value, path, 'Geometry must be an object.');
  if (geometry === null) return;
  checkKeys(context, geometry, path, ['kind', 'boundary']);
  if (geometry['kind'] !== 'boundary') {
    add(
      context,
      'invalid-geometry-kind',
      path + '/kind',
      'V0.3 materials must use Boundary geometry.',
      'Use a Boundary geometry value.',
    );
  }
  checkBoundary(context, geometry['boundary'], path + '/boundary');
}

function checkFill(context: ValidationContext, value: unknown, path: string): void {
  const fill = checkRecord(context, value, path, 'Fill must be an object.');
  if (fill === null) return;
  const kind = fill['kind'];
  if (kind === 'palette') {
    checkKeys(context, fill, path, ['kind', 'paletteId']);
    checkPaletteReference(context, fill['paletteId'], path + '/paletteId');
    return;
  }
  if (kind === 'local') {
    checkKeys(context, fill, path, ['kind', 'color']);
    checkColor(context, fill['color'], path + '/color');
    return;
  }
  checkKeys(context, fill, path, ['kind']);
  add(
    context,
    'invalid-fill-kind',
    path + '/kind',
    'Fill kind is unsupported.',
    'Choose a palette color or custom color.',
  );
}

function checkGrain(context: ValidationContext, value: unknown, path: string): void {
  const grain = checkRecord(context, value, path, 'Grain style must be an object.');
  if (grain === null) return;
  checkKeys(context, grain, path, ['kind', 'amount', 'scale', 'seed']);
  if (typeof grain['kind'] !== 'string' || !GRAIN_KINDS.includes(grain['kind'] as 'grain')) {
    add(
      context,
      'invalid-grain-kind',
      path + '/kind',
      'Grain kind is unsupported.',
      'Use grain, paper, or film.',
    );
  }
  checkNumber(context, grain['amount'], path + '/amount', 0, 1);
  checkNumber(context, grain['scale'], path + '/scale', 0, 1);
  checkNumber(context, grain['seed'], path + '/seed', 0, MAX_UINT32, true);
}

function checkMaterial(context: ValidationContext, value: unknown, path: string): void {
  const material = checkRecord(context, value, path, 'Material layer must be an object.');
  if (material === null) return;
  checkKeys(
    context,
    material,
    path,
    [
      'kind',
      'id',
      'name',
      'visible',
      'geometry',
      'fill',
      'opacity',
      'edgeFeather',
      'bloom',
      'interaction',
    ],
    ['grain'],
  );
  if (material['kind'] !== 'material') {
    add(
      context,
      'invalid-node-kind',
      path + '/kind',
      'Expected a material layer.',
      'Use material.',
    );
  }
  checkId(context, material['id'], 'material', path + '/id');
  checkName(context, material['name'], path + '/name');
  checkBoolean(context, material['visible'], path + '/visible');
  checkGeometry(context, material['geometry'], path + '/geometry');
  checkFill(context, material['fill'], path + '/fill');
  checkNumber(context, material['opacity'], path + '/opacity', 0, 1);
  checkNumber(context, material['edgeFeather'], path + '/edgeFeather', 0, 1);
  checkNumber(context, material['bloom'], path + '/bloom', 0, 1);
  if (
    typeof material['interaction'] !== 'string' ||
    !INTERACTION_MODES.includes(material['interaction'] as 'paint')
  ) {
    add(
      context,
      'invalid-interaction',
      path + '/interaction',
      'Interaction is unsupported.',
      'Choose Paint, Glow, Shade, Texture, Keep base hue, or Colorize.',
    );
  }
  if (hasOwn(material, 'grain')) checkGrain(context, material['grain'], path + '/grain');
}

function checkGroup(
  context: ValidationContext,
  value: unknown,
  path: string,
  depth: number,
  ancestors: Set<object>,
): void {
  const group = checkRecord(context, value, path, 'Group must be an object.');
  if (group === null) return;
  if (ancestors.has(group)) {
    add(
      context,
      'group-cycle',
      path,
      'A group cannot contain itself through its descendants.',
      'Remove the cyclic child relationship.',
    );
    return;
  }
  if (depth > MAX_GROUP_DEPTH) {
    add(
      context,
      'group-depth-exceeded',
      path,
      'Group nesting is too deep.',
      'Flatten the group structure to 64 levels or fewer.',
    );
    return;
  }

  ancestors.add(group);
  checkKeys(context, group, path, ['kind', 'id', 'name', 'visible', 'transform', 'children']);
  if (group['kind'] !== 'group') {
    add(context, 'invalid-node-kind', path + '/kind', 'Expected a group.', 'Use group.');
  }
  checkId(context, group['id'], 'group', path + '/id');
  checkName(context, group['name'], path + '/name');
  checkBoolean(context, group['visible'], path + '/visible');
  checkTransform(context, group['transform'], path + '/transform');

  const children = group['children'];
  if (!Array.isArray(children)) {
    add(
      context,
      'invalid-children',
      path + '/children',
      'Group children must be an array.',
      'Provide an ordered child array.',
    );
  } else {
    children.forEach((child, index) => {
      const childPath = path + '/children/' + index;
      const childRecord = asRecord(child);
      if (childRecord === null) {
        add(
          context,
          'invalid-node',
          childPath,
          'Group child must be an object.',
          'Use a group or material layer.',
        );
        return;
      }
      if (childRecord['kind'] === 'group') {
        checkGroup(context, childRecord, childPath, depth + 1, ancestors);
      } else if (childRecord['kind'] === 'material') {
        checkMaterial(context, childRecord, childPath);
      } else {
        add(
          context,
          'invalid-node-kind',
          childPath + '/kind',
          'Group children must be groups or material layers.',
          'Use group or material.',
        );
      }
    });
  }
  ancestors.delete(group);
}

function checkArtboard(context: ValidationContext, value: unknown): void {
  const artboard = checkRecord(context, value, '/artboard', 'Artboard must be an object.');
  if (artboard === null) return;
  checkKeys(context, artboard, '/artboard', ['ratio', 'fitMode']);
  if (
    typeof artboard['ratio'] !== 'string' ||
    !ARTBOARD_RATIOS.includes(artboard['ratio'] as '1:1')
  ) {
    add(
      context,
      'invalid-artboard-ratio',
      '/artboard/ratio',
      'Artboard ratio is unsupported.',
      'Choose 1:1, 2:1, 1:2, 4:3, 16:9, or 21:9.',
    );
  }
  if (
    typeof artboard['fitMode'] !== 'string' ||
    !ARTBOARD_FIT_MODES.includes(artboard['fitMode'] as 'fit')
  ) {
    add(
      context,
      'invalid-fit-mode',
      '/artboard/fitMode',
      'Artboard fit mode is unsupported.',
      'Choose Fit or Cover.',
    );
  }
}

function checkPalette(context: ValidationContext, value: unknown): void {
  if (!Array.isArray(value)) {
    add(
      context,
      'invalid-palette',
      '/palette',
      'Palette must be an array.',
      'Provide 4 to 8 named colors.',
    );
    return;
  }
  if (value.length < 4 || value.length > 8) {
    add(
      context,
      'invalid-palette-count',
      '/palette',
      'V0.3 palettes require 4 to 8 colors.',
      'Provide 4 to 8 named colors.',
    );
  }
  value.forEach((entry, index) => {
    const path = '/palette/' + index;
    const paletteEntry = checkRecord(context, entry, path, 'Palette entry must be an object.');
    if (paletteEntry === null) return;
    checkKeys(context, paletteEntry, path, ['id', 'name', 'color']);
    const id = checkId(context, paletteEntry['id'], 'palette', path + '/id');
    if (id !== null) context.paletteIds.add(id);
    checkName(context, paletteEntry['name'], path + '/name');
    checkColor(context, paletteEntry['color'], path + '/color');
  });
}

export function validateSceneV03(value: unknown): SceneV03ValidationResult {
  const context: ValidationContext = {
    diagnostics: [],
    seenIds: new Set(),
    paletteIds: new Set(),
    paletteReferences: [],
  };
  const scene = checkRecord(context, value, '/', 'Scene must be an object.');
  if (scene === null) return { ok: false, diagnostics: context.diagnostics };

  checkKeys(context, scene, '/', [
    'schemaVersion',
    'id',
    'artboard',
    'background',
    'palette',
    'rootGroups',
  ]);
  if (scene['schemaVersion'] !== SCENE_V03_SCHEMA_VERSION) {
    add(
      context,
      'unsupported-schema-version',
      '/schemaVersion',
      'Scene schemaVersion is not supported.',
      'Use a v0.3 scene document.',
    );
  }
  checkId(context, scene['id'], 'scene', '/id');
  checkArtboard(context, scene['artboard']);
  checkColor(context, scene['background'], '/background');
  checkPalette(context, scene['palette']);

  const rootGroups = scene['rootGroups'];
  if (!Array.isArray(rootGroups)) {
    add(
      context,
      'invalid-root-groups',
      '/rootGroups',
      'rootGroups must be an array.',
      'Provide ordered root groups.',
    );
  } else {
    rootGroups.forEach((group, index) =>
      checkGroup(context, group, '/rootGroups/' + index, 0, new Set()),
    );
  }

  for (const reference of context.paletteReferences) {
    if (!context.paletteIds.has(reference.id)) {
      add(
        context,
        'missing-palette-reference',
        reference.path,
        'Palette reference ' + reference.id + ' does not exist in this scene.',
        'Choose a palette color that exists in the scene.',
        reference.id,
      );
    }
  }

  return context.diagnostics.length === 0
    ? { ok: true }
    : { ok: false, diagnostics: context.diagnostics };
}

export function isSceneV03(value: unknown): value is SceneV03 {
  return validateSceneV03(value).ok;
}

export class SceneV03ValidationError extends Error {
  readonly diagnostics: SceneV03ValidationDiagnostic[];

  constructor(diagnostics: SceneV03ValidationDiagnostic[]) {
    super('Scene v0.3 is invalid.');
    this.name = 'SceneV03ValidationError';
    this.diagnostics = diagnostics;
  }
}

export function assertSceneV03(value: unknown): asserts value is SceneV03 {
  const result = validateSceneV03(value);
  if (!result.ok) throw new SceneV03ValidationError(result.diagnostics);
}
