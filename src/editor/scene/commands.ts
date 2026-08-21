/**
 * V0.3 scene commands.
 *
 * The scene itself remains the only durable document. Commands receive an
 * isolated scene, make one small edit, validate/canonicalize it, and either
 * return a complete candidate or a typed rejection. This keeps every user
 * gesture suitable for one atomic undo entry.
 */

import {
  ARTBOARD_FIT_MODES,
  ARTBOARD_RATIOS,
  canonicalSceneV03Bytes,
  GRAIN_KINDS,
  INTERACTION_MODES,
  isSceneV03,
  isSceneV03Id,
  normalizeSceneV03,
  sceneV03IdFromBytes,
  validateBoundary,
  validateSceneV03,
  type ArtboardFitMode,
  type ArtboardRatio,
  type Boundary,
  type CanonicalSceneColor,
  type GrainStyle,
  type GroupId,
  type GroupTransform,
  type InteractionMode,
  type MaterialFill,
  type MaterialId,
  type PaletteEntryId,
  type SceneGroup,
  type SceneMaterial,
  type SceneNode,
  type ScenePaletteEntry,
  type ScenePoint,
  type SceneV03,
  type SceneV03Id,
  type SceneV03IdKind,
  type SceneV03ValidationDiagnostic,
} from '../../domain';
import { cloneRecipe, type CandidateResult, type DesignCommand } from '../state/commands';
import { compileSceneRenderIR, SCENE_WORLD_SIZE, transformSceneRenderPoint } from '../../renderers';

export type SceneCommandDiagnostic = SceneV03ValidationDiagnostic & {
  readonly recovery: string;
};

export type SceneCommandContext = {
  readonly createId: (kind: SceneV03IdKind) => SceneV03Id;
};

export type SceneIdSequence = { value: number };

export type SceneLayerTransformPatch = {
  readonly translation?: Partial<ScenePoint>;
  readonly scale?: Partial<ScenePoint>;
  readonly rotationDeg?: number;
};

export type ScenePaletteEntryPatch = {
  readonly name?: string;
  readonly color?: CanonicalSceneColor;
};

/** A palette remix intentionally preserves palette IDs, names, and material links. */
export type ScenePaletteRemix = readonly CanonicalSceneColor[];

export type SceneArtboardPatch = {
  readonly ratio?: ArtboardRatio;
  readonly fitMode?: ArtboardFitMode;
};

export type SceneMaterialPatch = {
  readonly fill?: MaterialFill;
  readonly opacity?: number;
  readonly edgeFeather?: number;
  readonly bloom?: number;
  readonly interaction?: InteractionMode;
  /** An explicit undefined removes the optional grain overlay. */
  readonly grain?: GrainStyle | undefined;
};

const ID_BYTES = 16;
const MAX_ID_ALLOCATION_ATTEMPTS = 64;
const MAX_NAME_LENGTH = 80;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;

/** Empty breathing room retained around content by the explicit Reframe action. */
export const SCENE_REFRAME_SAFE_PADDING = 0.08;

const diagnostic = (
  code: string,
  path: string,
  message: string,
  recovery = 'Keep the last valid composition and correct the value before trying again.',
): SceneCommandDiagnostic => ({ code, path, message, recovery });

const failure = (
  ...diagnostics: SceneCommandDiagnostic[]
): CandidateResult<SceneV03, SceneCommandDiagnostic> => ({ kind: 'failure', diagnostics });

function validationFailure(
  diagnostics: readonly SceneV03ValidationDiagnostic[],
): CandidateResult<SceneV03, SceneCommandDiagnostic> {
  return failure(
    ...diagnostics.map((issue) => ({
      ...issue,
      recovery: 'Correct the invalid scene value and try again.',
    })),
  );
}

function command(
  kind: string,
  summary: string,
  prepare: (current: SceneV03) => CandidateResult<SceneV03, SceneCommandDiagnostic>,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return { kind, summary, prepare };
}

function nextIdBytes(sequence: SceneIdSequence): Uint8Array {
  const bytes = new Uint8Array(ID_BYTES);
  new DataView(bytes.buffer).setUint32(ID_BYTES - 4, sequence.value++, false);
  return bytes;
}

/** Deterministic ID context for browser sessions and reproducible tests. */
export function createSceneCommandContext(sequence: SceneIdSequence): SceneCommandContext {
  return {
    createId: (kind) => sceneV03IdFromBytes(kind, nextIdBytes(sequence)),
  };
}

function allSceneIds(scene: SceneV03): Set<string> {
  const ids = new Set<string>([scene.id]);
  for (const entry of scene.palette) ids.add(entry.id);

  const visit = (node: SceneNode): void => {
    ids.add(node.id);
    if (node.kind === 'group') node.children.forEach(visit);
  };
  scene.rootGroups.forEach(visit);
  return ids;
}

function allocateId(
  scene: SceneV03,
  context: SceneCommandContext,
  kind: SceneV03IdKind,
  usedIds = allSceneIds(scene),
): SceneV03Id | SceneCommandDiagnostic {
  if (context === null || typeof context !== 'object' || typeof context.createId !== 'function') {
    return diagnostic(
      'invalid-command-context',
      '/createId',
      'A v0.3 stable ID factory is required for this edit.',
      'Restore the editor session and retry the edit.',
    );
  }
  try {
    for (let attempt = 0; attempt < MAX_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
      const id = context.createId(kind);
      if (!isSceneV03Id(id, kind)) {
        return diagnostic(
          'invalid-stable-id',
          '/id',
          'The scene ID factory returned a malformed ' + kind + ' ID.',
          'Use a stable v0.3 ID factory and retry.',
        );
      }
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      return id;
    }
    return diagnostic(
      'duplicate-id',
      '/id',
      'The scene ID factory could not allocate an unused ID.',
      'Retry the edit so a fresh stable ID can be allocated.',
    );
  } catch {
    return diagnostic(
      'scene-id-unavailable',
      '/id',
      'A fresh scene ID could not be allocated.',
      'Retry the edit after the editor session is available.',
    );
  }
}

function isDiagnostic(value: unknown): value is SceneCommandDiagnostic {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { readonly code?: unknown }).code === 'string'
  );
}

function normalizedName(value: string, path: string): string | SceneCommandDiagnostic {
  const name = value.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return diagnostic(
      'invalid-name',
      path,
      'Layer and palette names must contain 1 to ' + MAX_NAME_LENGTH + ' characters.',
      'Use a short descriptive name.',
    );
  }
  return name;
}

function normalizedColor(
  value: string,
  path: string,
): CanonicalSceneColor | SceneCommandDiagnostic {
  if (!COLOR_PATTERN.test(value)) {
    return diagnostic(
      'invalid-color',
      path,
      'Colors must use a six-digit hex value such as #5B8CFF.',
      'Enter a six-digit hex color.',
    );
  }
  return value.toUpperCase();
}

function finalize(
  candidate: SceneV03,
  summary: string,
): CandidateResult<SceneV03, SceneCommandDiagnostic> {
  try {
    const normalized = normalizeSceneV03(cloneRecipe(candidate));
    const validation = validateSceneV03(normalized);
    if (!validation.ok) return validationFailure(validation.diagnostics);
    return {
      kind: 'success',
      candidate: normalized,
      canonicalBytes: canonicalSceneV03Bytes(normalized),
      summary,
    };
  } catch {
    return failure(
      diagnostic(
        'invalid-scene-candidate',
        '/',
        'The edit could not produce a valid v0.3 composition.',
      ),
    );
  }
}

function findRootGroup(
  scene: SceneV03,
  id: GroupId,
): { group: SceneGroup; index: number } | undefined {
  const index = scene.rootGroups.findIndex((group) => group.id === id);
  const group = index < 0 ? undefined : scene.rootGroups[index];
  return group === undefined ? undefined : { group, index };
}

function rootGroupFailure(id: GroupId): CandidateResult<SceneV03, SceneCommandDiagnostic> {
  return failure(
    diagnostic(
      'unknown-layer-target',
      '/rootGroups',
      'The selected top-level layer no longer exists.',
      'Select an existing layer and try again.',
    ),
  );
}

function cloneNodeWithFreshIds(
  node: SceneNode,
  scene: SceneV03,
  context: SceneCommandContext,
  usedIds: Set<string>,
): SceneNode | SceneCommandDiagnostic {
  const kind: SceneV03IdKind = node.kind === 'group' ? 'group' : 'material';
  const id = allocateId(scene, context, kind, usedIds);
  if (isDiagnostic(id)) return id;

  if (node.kind === 'material') return { ...cloneRecipe(node), id };

  const children: SceneNode[] = [];
  for (const child of node.children) {
    const clone = cloneNodeWithFreshIds(child, scene, context, usedIds);
    if (isDiagnostic(clone)) return clone;
    children.push(clone);
  }
  return { ...cloneRecipe(node), id, children };
}

function copyName(name: string): string {
  const suffix = ' copy';
  return name.length + suffix.length <= MAX_NAME_LENGTH
    ? name + suffix
    : name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
}

function validateTransformPatch(patch: SceneLayerTransformPatch): SceneCommandDiagnostic[] {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return [
      diagnostic('invalid-transform-patch', '/transform', 'Transform patch must be an object.'),
    ];
  }
  const raw = patch as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (
    keys.length === 0 ||
    keys.some((key) => !['translation', 'scale', 'rotationDeg'].includes(key))
  ) {
    return [
      diagnostic(
        'invalid-transform-patch',
        '/transform',
        'Transform patch must change translation, scale, or rotation.',
      ),
    ];
  }
  const diagnostics: SceneCommandDiagnostic[] = [];
  if (patch.translation !== undefined) {
    const translation = patch.translation as Record<string, unknown>;
    const translationKeys = Object.keys(translation);
    if (
      patch.translation === null ||
      typeof patch.translation !== 'object' ||
      Array.isArray(patch.translation) ||
      translationKeys.length === 0 ||
      translationKeys.some((key) => key !== 'x' && key !== 'y')
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-transform-patch',
          '/transform/translation',
          'Translation patch is invalid.',
        ),
      );
    } else {
      for (const axis of ['x', 'y'] as const) {
        const value = patch.translation[axis];
        if (value !== undefined && (!Number.isFinite(value) || value < -2 || value > 3)) {
          diagnostics.push(
            diagnostic(
              'out-of-range-number',
              '/transform/translation/' + axis,
              'Layer translation must be finite and within -2 through 3.',
            ),
          );
        }
      }
    }
  }
  if (patch.scale !== undefined) {
    const scale = patch.scale as Record<string, unknown>;
    const scaleKeys = Object.keys(scale);
    if (
      patch.scale === null ||
      typeof patch.scale !== 'object' ||
      Array.isArray(patch.scale) ||
      scaleKeys.length === 0 ||
      scaleKeys.some((key) => key !== 'x' && key !== 'y')
    ) {
      diagnostics.push(
        diagnostic('invalid-transform-patch', '/transform/scale', 'Scale patch is invalid.'),
      );
    } else {
      for (const axis of ['x', 'y'] as const) {
        const value = patch.scale[axis];
        if (value !== undefined && (!Number.isFinite(value) || value < 0.05 || value > 4)) {
          diagnostics.push(
            diagnostic(
              'out-of-range-number',
              '/transform/scale/' + axis,
              'Layer scale must be finite and within 0.05 through 4.',
            ),
          );
        }
      }
    }
  }
  if (
    patch.rotationDeg !== undefined &&
    (!Number.isFinite(patch.rotationDeg) || patch.rotationDeg < -360 || patch.rotationDeg > 360)
  ) {
    diagnostics.push(
      diagnostic(
        'out-of-range-number',
        '/transform/rotationDeg',
        'Layer rotation must be finite and within -360 through 360 degrees.',
      ),
    );
  }
  return diagnostics;
}

function transformWithPatch(
  transform: GroupTransform,
  patch: SceneLayerTransformPatch,
): GroupTransform {
  return {
    translation: { ...transform.translation, ...patch.translation },
    scale: { ...transform.scale, ...patch.scale },
    rotationDeg: patch.rotationDeg ?? transform.rotationDeg,
  };
}

const DEFAULT_NEW_LAYER_TRANSFORM: GroupTransform = {
  translation: { x: 0.5, y: 0.5 },
  scale: { x: 1, y: 1 },
  rotationDeg: 0,
};

function validateCompleteGroupTransform(transform: GroupTransform): SceneCommandDiagnostic[] {
  return validateTransformPatch({
    translation: transform.translation,
    scale: transform.scale,
    rotationDeg: transform.rotationDeg,
  });
}

function addSceneLayerWithTransformCommand(
  materialTemplate: SceneMaterial,
  transform: GroupTransform,
  context: SceneCommandContext,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-add', 'Add layer', (current) => {
    const transformDiagnostics = validateCompleteGroupTransform(transform);
    if (transformDiagnostics.length > 0) return failure(...transformDiagnostics);
    const usedIds = allSceneIds(current);
    const groupId = allocateId(current, context, 'group', usedIds);
    if (isDiagnostic(groupId)) return failure(groupId);
    const materialId = allocateId(current, context, 'material', usedIds);
    if (isDiagnostic(materialId)) return failure(materialId);
    const name = normalizedName(materialTemplate.name, '/material/name');
    if (isDiagnostic(name)) return failure(name);

    const material: SceneMaterial = { ...cloneRecipe(materialTemplate), id: materialId, name };
    const group: SceneGroup = {
      kind: 'group',
      id: groupId,
      name,
      visible: true,
      transform: cloneRecipe(transform),
      children: [material],
    };
    return finalize(
      { ...cloneRecipe(current), rootGroups: [...current.rootGroups.map(cloneRecipe), group] },
      'Add layer',
    );
  });
}

/**
 * Adds a material in a fresh top-level layer group at the front of the scene.
 * Arrays are back-to-front, so appending here is the durable z-order rule that
 * guarantees a newly added shape starts above every existing shape.
 */
export function addSceneLayerCommand(
  materialTemplate: SceneMaterial,
  context: SceneCommandContext,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return addSceneLayerWithTransformCommand(materialTemplate, DEFAULT_NEW_LAYER_TRANSFORM, context);
}

/** Adds a new topmost material at an explicit validated transform, in one undo entry. */
export function addSceneLayerAtTransformCommand(
  materialTemplate: SceneMaterial,
  transform: GroupTransform,
  context: SceneCommandContext,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return addSceneLayerWithTransformCommand(materialTemplate, transform, context);
}

/** Duplicates one top-level layer and appends its copy at the front. */
export function duplicateSceneLayerCommand(
  groupId: GroupId,
  context: SceneCommandContext,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-duplicate', 'Duplicate layer', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    const clone = cloneNodeWithFreshIds(target.group, current, context, allSceneIds(current));
    if (isDiagnostic(clone) || clone.kind !== 'group') {
      return failure(
        isDiagnostic(clone)
          ? clone
          : diagnostic(
              'invalid-layer-copy',
              '/rootGroups',
              'The selected layer could not be duplicated.',
            ),
      );
    }
    const duplicated: SceneGroup = { ...clone, name: copyName(clone.name) };
    return finalize(
      { ...cloneRecipe(current), rootGroups: [...current.rootGroups.map(cloneRecipe), duplicated] },
      'Duplicate layer',
    );
  });
}

/** Deletes exactly one top-level layer. */
export function deleteSceneLayerCommand(
  groupId: GroupId,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-delete', 'Delete layer', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    return finalize(
      {
        ...cloneRecipe(current),
        rootGroups: current.rootGroups.filter((group) => group.id !== groupId).map(cloneRecipe),
      },
      'Delete layer',
    );
  });
}

/** Renames a top-level layer without changing its material or transform. */
export function renameSceneLayerCommand(
  groupId: GroupId,
  name: string,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-rename', 'Rename layer', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    const nextName = normalizedName(name, '/rootGroups/' + target.index + '/name');
    if (isDiagnostic(nextName)) return failure(nextName);
    const rootGroups = current.rootGroups.map((group) =>
      group.id === groupId ? { ...cloneRecipe(group), name: nextName } : cloneRecipe(group),
    );
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Rename layer');
  });
}

/** Sets top-level visibility instead of hiding a shape by mutating opacity. */
export function setSceneLayerVisibilityCommand(
  groupId: GroupId,
  visible: boolean,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-visibility', visible ? 'Show layer' : 'Hide layer', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    if (typeof visible !== 'boolean') {
      return failure(
        diagnostic(
          'invalid-visibility',
          '/rootGroups/' + target.index + '/visible',
          'Visibility must be true or false.',
        ),
      );
    }
    const rootGroups = current.rootGroups.map((group) =>
      group.id === groupId ? { ...cloneRecipe(group), visible } : cloneRecipe(group),
    );
    return finalize({ ...cloneRecipe(current), rootGroups }, visible ? 'Show layer' : 'Hide layer');
  });
}

/** Reorders a top-level layer; the last array item is frontmost. */
export function reorderSceneLayerCommand(
  groupId: GroupId,
  targetIndex: number,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-reorder', 'Reorder layer', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= current.rootGroups.length
    ) {
      return failure(
        diagnostic(
          'invalid-layer-index',
          '/rootGroups',
          'Layer order must be an index within the current layer list.',
        ),
      );
    }
    if (target.index === targetIndex) {
      return failure(
        diagnostic(
          'no-change',
          '/rootGroups/' + target.index,
          'Layer is already at that order position.',
        ),
      );
    }
    const rootGroups = current.rootGroups.map(cloneRecipe);
    const [moved] = rootGroups.splice(target.index, 1);
    if (moved === undefined) return rootGroupFailure(groupId);
    rootGroups.splice(targetIndex, 0, moved);
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Reorder layer');
  });
}

/** Applies a bounded transform patch to a top-level layer. */
export function updateSceneLayerTransformCommand(
  groupId: GroupId,
  patch: SceneLayerTransformPatch,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-layer-transform', 'Update layer transform', (current) => {
    const target = findRootGroup(current, groupId);
    if (target === undefined) return rootGroupFailure(groupId);
    const diagnostics = validateTransformPatch(patch);
    if (diagnostics.length > 0) return failure(...diagnostics);
    const rootGroups = current.rootGroups.map((group) =>
      group.id === groupId
        ? { ...cloneRecipe(group), transform: transformWithPatch(group.transform, patch) }
        : cloneRecipe(group),
    );
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Update layer transform');
  });
}

/** Updates a named palette swatch. Palette references remain stable by ID. */
export function updateScenePaletteEntryCommand(
  paletteId: PaletteEntryId,
  patch: ScenePaletteEntryPatch,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-palette-update', 'Update palette color', (current) => {
    const index = current.palette.findIndex((entry) => entry.id === paletteId);
    if (index < 0) {
      return failure(
        diagnostic(
          'unknown-palette-target',
          '/palette',
          'The selected palette color no longer exists.',
        ),
      );
    }
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      return failure(
        diagnostic(
          'invalid-palette-patch',
          '/palette/' + index,
          'Palette patch must be an object.',
        ),
      );
    }
    const rawPatch = patch as Record<string, unknown>;
    const keys = Object.keys(rawPatch);
    if (keys.length === 0 || keys.some((key) => key !== 'name' && key !== 'color')) {
      return failure(
        diagnostic(
          'invalid-palette-patch',
          '/palette/' + index,
          'Change a palette name, color, or both.',
        ),
      );
    }
    const existing = current.palette[index]!;
    const name =
      patch.name === undefined
        ? existing.name
        : normalizedName(patch.name, '/palette/' + index + '/name');
    if (isDiagnostic(name)) return failure(name);
    const color =
      patch.color === undefined
        ? existing.color
        : normalizedColor(patch.color, '/palette/' + index + '/color');
    if (isDiagnostic(color)) return failure(color);
    const palette = current.palette.map((entry) =>
      entry.id === paletteId
        ? ({ ...cloneRecipe(entry), name, color } satisfies ScenePaletteEntry)
        : cloneRecipe(entry),
    );
    return finalize({ ...cloneRecipe(current), palette }, 'Update palette color');
  });
}

/**
 * Recolors every existing palette entry as one atomic composition action.
 *
 * Keeping entry IDs in place is essential: palette-linked materials respond
 * immediately, while local material fills remain deliberately untouched.
 */
export function remixScenePaletteCommand(
  colors: ScenePaletteRemix,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-palette-remix', 'Remix palette', (current) => {
    if (!Array.isArray(colors) || colors.length !== current.palette.length) {
      return failure(
        diagnostic(
          'invalid-palette-remix',
          '/palette',
          `A palette remix needs exactly ${current.palette.length} colors.`,
        ),
      );
    }
    const normalizedColors: CanonicalSceneColor[] = [];
    for (const [index, color] of colors.entries()) {
      const normalized = normalizedColor(color, '/palette/' + index + '/color');
      if (isDiagnostic(normalized)) return failure(normalized);
      normalizedColors.push(normalized);
    }
    if (current.palette.every((entry, index) => entry.color === normalizedColors[index])) {
      return failure(
        diagnostic(
          'no-change',
          '/palette',
          'This remix already matches the active palette.',
          'Choose Remix palette again to try the next composition of colors.',
        ),
      );
    }
    const palette = current.palette.map((entry, index) => ({
      ...cloneRecipe(entry),
      color: normalizedColors[index]!,
    }));
    return finalize({ ...cloneRecipe(current), palette }, 'Remix palette');
  });
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateUnitMaterialNumber(
  value: unknown,
  path: string,
  label: string,
): SceneCommandDiagnostic | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return diagnostic(
      'out-of-range-number',
      path,
      label + ' must be a finite value from 0 through 1.',
    );
  }
  return undefined;
}

function validateMaterialFill(scene: SceneV03, value: unknown): SceneCommandDiagnostic | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return diagnostic('invalid-fill', '/material/fill', 'Material fill must be a color source.');
  }
  const fill = value as Record<string, unknown>;
  if (fill['kind'] === 'palette') {
    if (
      Object.keys(fill).some((key) => key !== 'kind' && key !== 'paletteId') ||
      typeof fill['paletteId'] !== 'string'
    ) {
      return diagnostic(
        'invalid-fill',
        '/material/fill',
        'Palette fill must name one palette color.',
      );
    }
    if (!scene.palette.some((entry) => entry.id === fill['paletteId'])) {
      return diagnostic(
        'missing-palette-reference',
        '/material/fill/paletteId',
        'That palette color no longer exists in this scene.',
      );
    }
    return undefined;
  }
  if (fill['kind'] === 'local') {
    if (
      Object.keys(fill).some((key) => key !== 'kind' && key !== 'color') ||
      typeof fill['color'] !== 'string'
    ) {
      return diagnostic(
        'invalid-fill',
        '/material/fill',
        'Custom fill must contain one hex color.',
      );
    }
    const color = normalizedColor(fill['color'], '/material/fill/color');
    return isDiagnostic(color) ? color : undefined;
  }
  return diagnostic(
    'invalid-fill',
    '/material/fill/kind',
    'Choose a palette color or a custom hex color for this material.',
  );
}

function validateGrain(value: unknown): SceneCommandDiagnostic | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return diagnostic(
      'invalid-grain',
      '/material/grain',
      'Grain must be a complete overlay definition.',
    );
  }
  const grain = value as Record<string, unknown>;
  if (
    Object.keys(grain).some((key) => !['kind', 'amount', 'scale', 'seed'].includes(key)) ||
    typeof grain['kind'] !== 'string' ||
    !GRAIN_KINDS.includes(grain['kind'] as (typeof GRAIN_KINDS)[number])
  ) {
    return diagnostic('invalid-grain', '/material/grain/kind', 'Choose grain, paper, or film.');
  }
  const amount = validateUnitMaterialNumber(
    grain['amount'],
    '/material/grain/amount',
    'Grain amount',
  );
  if (amount !== undefined) return amount;
  const scale = validateUnitMaterialNumber(grain['scale'], '/material/grain/scale', 'Grain scale');
  if (scale !== undefined) return scale;
  if (
    typeof grain['seed'] !== 'number' ||
    !Number.isInteger(grain['seed']) ||
    grain['seed'] < 0 ||
    grain['seed'] > 4_294_967_295
  ) {
    return diagnostic(
      'invalid-grain',
      '/material/grain/seed',
      'Grain seed must be a 32-bit integer.',
    );
  }
  return undefined;
}

function validateMaterialPatch(
  scene: SceneV03,
  patch: SceneMaterialPatch,
): SceneCommandDiagnostic[] {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return [diagnostic('invalid-material-patch', '/material', 'Material patch must be an object.')];
  }
  const raw = patch as Record<string, unknown>;
  const keys = Object.keys(raw);
  const allowed = ['fill', 'opacity', 'edgeFeather', 'bloom', 'interaction', 'grain'];
  if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) {
    return [
      diagnostic(
        'invalid-material-patch',
        '/material',
        'Change fill, opacity, edge fade, bloom, interaction, or grain.',
      ),
    ];
  }
  const diagnostics: SceneCommandDiagnostic[] = [];
  if (patch.fill !== undefined) {
    const issue = validateMaterialFill(scene, patch.fill);
    if (issue !== undefined) diagnostics.push(issue);
  }
  for (const [key, label] of [
    ['opacity', 'Opacity'],
    ['edgeFeather', 'Edge fade'],
    ['bloom', 'Bloom'],
  ] as const) {
    if (raw[key] !== undefined) {
      const issue = validateUnitMaterialNumber(raw[key], '/material/' + key, label);
      if (issue !== undefined) diagnostics.push(issue);
    }
  }
  if (
    patch.interaction !== undefined &&
    !INTERACTION_MODES.includes(patch.interaction as (typeof INTERACTION_MODES)[number])
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-interaction',
        '/material/interaction',
        'Choose Paint, Glow, Shade, Texture, Keep base hue, or Colorize.',
      ),
    );
  }
  if (hasOwn(raw, 'grain')) {
    const issue = validateGrain(raw['grain']);
    if (issue !== undefined) diagnostics.push(issue);
  }
  return diagnostics;
}

function patchMaterialNode(
  node: SceneNode,
  materialId: MaterialId,
  patch: SceneMaterialPatch,
): { readonly node: SceneNode; readonly found: boolean } {
  if (node.kind === 'material') {
    if (node.id !== materialId) return { node: cloneRecipe(node), found: false };
    const material = cloneRecipe(node);
    if (patch.fill !== undefined) material.fill = cloneRecipe(patch.fill);
    if (patch.opacity !== undefined) material.opacity = patch.opacity;
    if (patch.edgeFeather !== undefined) material.edgeFeather = patch.edgeFeather;
    if (patch.bloom !== undefined) material.bloom = patch.bloom;
    if (patch.interaction !== undefined) material.interaction = patch.interaction;
    if (hasOwn(patch, 'grain')) {
      if (patch.grain === undefined) Reflect.deleteProperty(material, 'grain');
      else material.grain = cloneRecipe(patch.grain);
    }
    return { node: material, found: true };
  }

  let found = false;
  const children = node.children.map((child) => {
    const patched = patchMaterialNode(child, materialId, patch);
    found ||= patched.found;
    return patched.node;
  });
  return { node: { ...cloneRecipe(node), children }, found };
}

function patchMaterialBoundaryNode(
  node: SceneNode,
  materialId: MaterialId,
  boundary: Boundary,
): { readonly node: SceneNode; readonly found: boolean } {
  if (node.kind === 'material') {
    if (node.id !== materialId) return { node: cloneRecipe(node), found: false };
    return {
      node: {
        ...cloneRecipe(node),
        geometry: { kind: 'boundary', boundary: cloneRecipe(boundary) },
      },
      found: true,
    };
  }

  let found = false;
  const children = node.children.map((child) => {
    const patched = patchMaterialBoundaryNode(child, materialId, boundary);
    found ||= patched.found;
    return patched.node;
  });
  return { node: { ...cloneRecipe(node), children }, found };
}

/** Changes one material's rendering field while retaining its Boundary geometry and z order. */
export function updateSceneMaterialCommand(
  materialId: MaterialId,
  patch: SceneMaterialPatch,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-material-update', 'Update material', (current) => {
    const diagnostics = validateMaterialPatch(current, patch);
    if (diagnostics.length > 0) return failure(...diagnostics);
    let found = false;
    const rootGroups = current.rootGroups.map((group) => {
      const patched = patchMaterialNode(group, materialId, patch);
      found ||= patched.found;
      if (patched.node.kind !== 'group') {
        throw new TypeError('Root scene nodes must remain groups.');
      }
      return patched.node;
    });
    if (!found) {
      return failure(
        diagnostic(
          'unknown-material-target',
          '/rootGroups',
          'The selected material no longer exists.',
        ),
      );
    }
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Update material');
  });
}

/**
 * Updates one material's shared Boundary only when it remains a simple 3-64
 * vertex solid. Invalid pointer edits therefore never replace valid source
 * geometry or create a history entry.
 */
export function updateSceneMaterialBoundaryCommand(
  materialId: MaterialId,
  boundary: Boundary,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-material-boundary', 'Edit Boundary', (current) => {
    const validation = validateBoundary(boundary);
    if (!validation.ok) {
      return failure(
        ...validation.issues.map((issue) =>
          diagnostic(
            issue.code,
            '/material/geometry/boundary' + (issue.path === '/' ? '' : issue.path),
            issue.message,
            'Keep the Boundary as one simple closed body with 3 to 64 points.',
          ),
        ),
      );
    }
    let found = false;
    const rootGroups = current.rootGroups.map((group) => {
      const patched = patchMaterialBoundaryNode(group, materialId, boundary);
      found ||= patched.found;
      if (patched.node.kind !== 'group') {
        throw new TypeError('Root scene nodes must remain groups.');
      }
      return patched.node;
    });
    if (!found) {
      return failure(
        diagnostic(
          'unknown-material-target',
          '/rootGroups',
          'The selected Boundary material no longer exists.',
        ),
      );
    }
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Edit Boundary');
  });
}

/** Changes the canvas ratio/fit without mutating any scene geometry. */
export function updateSceneArtboardCommand(
  patch: SceneArtboardPatch,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-artboard-update', 'Update artboard', (current) => {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      return failure(
        diagnostic('invalid-artboard-patch', '/artboard', 'Artboard patch must be an object.'),
      );
    }
    const rawPatch = patch as Record<string, unknown>;
    const keys = Object.keys(rawPatch);
    if (keys.length === 0 || keys.some((key) => key !== 'ratio' && key !== 'fitMode')) {
      return failure(
        diagnostic('invalid-artboard-patch', '/artboard', 'Change ratio, fit mode, or both.'),
      );
    }
    if (patch.ratio !== undefined && !ARTBOARD_RATIOS.includes(patch.ratio)) {
      return failure(
        diagnostic('invalid-artboard-ratio', '/artboard/ratio', 'Artboard ratio is unsupported.'),
      );
    }
    if (patch.fitMode !== undefined && !ARTBOARD_FIT_MODES.includes(patch.fitMode)) {
      return failure(
        diagnostic('invalid-fit-mode', '/artboard/fitMode', 'Artboard fit mode is unsupported.'),
      );
    }
    return finalize(
      { ...cloneRecipe(current), artboard: { ...current.artboard, ...patch } },
      'Update artboard',
    );
  });
}

type SceneContentBounds = Readonly<{
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}>;

function visibleSceneContentBounds(scene: SceneV03): SceneContentBounds | undefined {
  const ir = compileSceneRenderIR(scene);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasPoint = false;

  for (const material of ir.materials) {
    if (!material.visible) continue;
    for (const pathCommand of material.path.commands) {
      if (pathCommand.kind !== 'move' && pathCommand.kind !== 'line') continue;
      const point = transformSceneRenderPoint(material.path.matrix, pathCommand);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      hasPoint = true;
    }
  }
  return hasPoint ? { minX, minY, maxX, maxY } : undefined;
}

/**
 * Fits all visible source geometry into the current artboard with safe
 * padding. It is deliberately explicit: changing a ratio never invokes this
 * operation on the user's behalf.
 */
export function reframeSceneContentCommand(): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-content-reframe', 'Reframe visible content', (current) => {
    const bounds = visibleSceneContentBounds(current);
    if (bounds === undefined) {
      return failure(
        diagnostic(
          'no-visible-content',
          '/rootGroups',
          'Reframe needs at least one visible material.',
          'Show or add a material, then reframe the composition.',
        ),
      );
    }
    const sourceWidth = bounds.maxX - bounds.minX;
    const sourceHeight = bounds.maxY - bounds.minY;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return failure(
        diagnostic(
          'invalid-content-bounds',
          '/rootGroups',
          'Reframe could not measure the visible content.',
          'Adjust the visible Boundary and try Reframe again.',
        ),
      );
    }
    const viewBox = compileSceneRenderIR(current).artboard.viewBox;
    const availableWidth = viewBox.width * (1 - SCENE_REFRAME_SAFE_PADDING * 2);
    const availableHeight = viewBox.height * (1 - SCENE_REFRAME_SAFE_PADDING * 2);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    if (!Number.isFinite(scale) || scale <= 0) {
      return failure(
        diagnostic(
          'invalid-reframe-scale',
          '/rootGroups',
          'Reframe could not calculate a safe scale.',
          'Keep a non-zero visible Boundary and try again.',
        ),
      );
    }

    const sourceCenter = {
      x: (bounds.minX + sourceWidth / 2) / SCENE_WORLD_SIZE,
      y: (bounds.minY + sourceHeight / 2) / SCENE_WORLD_SIZE,
    };
    const targetCenter = {
      x: (viewBox.minX + viewBox.width / 2) / SCENE_WORLD_SIZE,
      y: (viewBox.minY + viewBox.height / 2) / SCENE_WORLD_SIZE,
    };
    const rootGroups = current.rootGroups.map((group) => {
      const transform: GroupTransform = {
        translation: {
          x: targetCenter.x + scale * (group.transform.translation.x - sourceCenter.x),
          y: targetCenter.y + scale * (group.transform.translation.y - sourceCenter.y),
        },
        scale: {
          x: group.transform.scale.x * scale,
          y: group.transform.scale.y * scale,
        },
        rotationDeg: group.transform.rotationDeg,
      };
      return { ...cloneRecipe(group), transform };
    });
    const invalidTransform = rootGroups
      .map((group) => validateCompleteGroupTransform(group.transform))
      .find((diagnostics) => diagnostics.length > 0)?.[0];
    if (invalidTransform !== undefined) {
      return failure({
        ...invalidTransform,
        code: 'reframe-out-of-range',
        message: 'Reframe would exceed the safe layer transform limits.',
        recovery: 'Move or scale the current layers closer together, then reframe again.',
      });
    }
    return finalize({ ...cloneRecipe(current), rootGroups }, 'Reframe visible content');
  });
}

/** Updates the opaque canvas background separately from the palette. */
export function updateSceneBackgroundCommand(
  color: CanonicalSceneColor,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-background-update', 'Update background', (current) => {
    const nextColor = normalizedColor(color, '/background');
    if (isDiagnostic(nextColor)) return failure(nextColor);
    return finalize({ ...cloneRecipe(current), background: nextColor }, 'Update background');
  });
}

/**
 * Validates a complete externally supplied scene before replacing the current
 * document. Invalid imports never become a candidate, so the committed scene
 * and local cache stay untouched.
 */
export function replaceSceneV03Command(
  imported: unknown,
): DesignCommand<SceneV03, SceneCommandDiagnostic> {
  return command('scene-replace', 'Replace scene', () => {
    if (!isSceneV03(imported)) {
      const validation = validateSceneV03(imported);
      return validationFailure(validation.ok ? [] : validation.diagnostics);
    }
    return finalize(imported, 'Replace scene');
  });
}
