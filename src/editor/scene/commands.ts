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
  isSceneV03,
  isSceneV03Id,
  normalizeSceneV03,
  sceneV03IdFromBytes,
  validateSceneV03,
  type ArtboardFitMode,
  type ArtboardRatio,
  type CanonicalSceneColor,
  type GroupId,
  type GroupTransform,
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

export type SceneCommandDiagnostic = SceneV03ValidationDiagnostic & {
  readonly recovery: string;
};

export type SceneCommandContext = {
  readonly createId: (kind: SceneV03IdKind) => SceneV03Id;
};

export type SceneIdSequence = { value: number };

export type SceneLayerTransformPatch = {
  readonly translation?: Partial<ScenePoint>;
  readonly uniformScale?: number;
  readonly rotationDeg?: number;
};

export type ScenePaletteEntryPatch = {
  readonly name?: string;
  readonly color?: CanonicalSceneColor;
};

export type SceneArtboardPatch = {
  readonly ratio?: ArtboardRatio;
  readonly fitMode?: ArtboardFitMode;
};

const ID_BYTES = 16;
const MAX_NAME_LENGTH = 80;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;

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
    const id = context.createId(kind);
    if (!isSceneV03Id(id, kind)) {
      return diagnostic(
        'invalid-stable-id',
        '/id',
        'The scene ID factory returned a malformed ' + kind + ' ID.',
        'Use a stable v0.3 ID factory and retry.',
      );
    }
    if (usedIds.has(id)) {
      return diagnostic(
        'duplicate-id',
        '/id',
        'The scene ID factory returned an ID that is already in use.',
        'Retry the edit so a fresh stable ID can be allocated.',
      );
    }
    usedIds.add(id);
    return id;
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
    keys.some((key) => !['translation', 'uniformScale', 'rotationDeg'].includes(key))
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
  if (
    patch.uniformScale !== undefined &&
    (!Number.isFinite(patch.uniformScale) || patch.uniformScale < 0.05 || patch.uniformScale > 4)
  ) {
    diagnostics.push(
      diagnostic(
        'out-of-range-number',
        '/transform/uniformScale',
        'Layer scale must be finite and within 0.05 through 4.',
      ),
    );
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
    uniformScale: patch.uniformScale ?? transform.uniformScale,
    rotationDeg: patch.rotationDeg ?? transform.rotationDeg,
  };
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
  return command('scene-layer-add', 'Add layer', (current) => {
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
      transform: { translation: { x: 0.5, y: 0.5 }, uniformScale: 1, rotationDeg: 0 },
      children: [material],
    };
    return finalize(
      { ...cloneRecipe(current), rootGroups: [...current.rootGroups.map(cloneRecipe), group] },
      'Add layer',
    );
  });
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
