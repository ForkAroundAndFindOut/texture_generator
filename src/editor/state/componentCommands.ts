import {
  cloneCanonicalBytes,
  cloneRecipe,
  type CandidateResult,
  type DesignCommand,
} from './commands';
import {
  isStableId,
  normalizeRecipe,
  validateRecipeDomain,
  validateRecipeShape,
  type AnchorId,
  type BlendMode,
  type Component,
  type ComponentAppearance,
  type ComponentId,
  type ComponentTransform,
  type Point,
  type ShapeAnchor,
  type Size,
  type TextureRecipe,
} from '../../domain';

/**
 * The command seam deliberately receives its two impure-ish operations from
 * the caller.  Commands therefore remain deterministic and can be exercised
 * without a renderer, persistence adapter, or random-number implementation.
 */
export type ComponentCommandContext = {
  readonly canonicalize: (recipe: TextureRecipe) => Uint8Array;
  readonly createComponentId: () => ComponentId;
  readonly createAnchorId: (sourceId: ComponentId, anchorIndex: number) => AnchorId;
};

export type ComponentCommandDiagnostic = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly recovery: string;
  readonly entityId?: string;
};

export type ComponentTransformPatch = {
  readonly translation?: Partial<Point>;
  readonly baseSize?: Partial<Size>;
  readonly rotationDeg?: number;
  readonly uniformScale?: number;
};

export type ComponentAppearancePatch = Partial<ComponentAppearance>;
export type FieldAnchorPatch = Partial<Pick<ShapeAnchor, 'x' | 'y'>>;
export type FieldAnchorPoint = Pick<ShapeAnchor, 'x' | 'y'>;
export type BandShapePatch = Partial<
  Pick<Extract<Component, { type: 'band' }>['band'], 'taper' | 'endCap'>
>;

const BLEND_MODES = new Set<BlendMode>(['normal', 'multiply', 'screen', 'overlay', 'soft-light']);

const diagnostic = (
  code: string,
  path: string,
  message: string,
  recovery = 'Correct the value and try again.',
  entityId?: string,
): ComponentCommandDiagnostic => {
  return entityId === undefined
    ? { code, path, message, recovery }
    : { code, path, message, recovery, entityId };
};

const failure = (
  ...diagnostics: ComponentCommandDiagnostic[]
): CandidateResult<TextureRecipe, ComponentCommandDiagnostic> => ({
  kind: 'failure',
  diagnostics,
});

const invalidTarget = (id: string): CandidateResult<TextureRecipe, ComponentCommandDiagnostic> =>
  failure(
    diagnostic(
      'unknown-component-target',
      '/components',
      `Component ${id} does not exist in the current recipe.`,
      'Select an existing component and try again.',
      id,
    ),
  );

const unknownProperty = (path: string): ComponentCommandDiagnostic =>
  diagnostic(
    'unknown-property',
    path,
    `Component command property at ${path} is unsupported.`,
    'Use only the documented component command fields.',
  );

const cloneComponent = (component: Component): Component => cloneRecipe(component);

function allAnchorIds(recipe: TextureRecipe): Set<string> {
  const ids = new Set<string>();
  for (const component of recipe.components) {
    if (component.type !== 'field') continue;
    for (const anchor of component.contour.anchors) ids.add(anchor.id);
  }
  return ids;
}

/** Allocate fresh IDs for a duplicated Field while preserving contour values. */
function remapDuplicatedFieldAnchors(
  duplicate: Component,
  sourceId: ComponentId,
  recipe: TextureRecipe,
  context: ComponentCommandContext,
): ComponentCommandDiagnostic[] {
  if (duplicate.type !== 'field') return [];
  if (typeof context.createAnchorId !== 'function') {
    return [
      diagnostic(
        'anchor-id-unavailable',
        '/components/contour/anchors',
        'A fresh stable anchor identity factory is required to duplicate a Field.',
        'Provide a deterministic anchor ID factory and retry the duplicate.',
      ),
    ];
  }
  const usedIds = allAnchorIds(recipe);
  const diagnostics: ComponentCommandDiagnostic[] = [];
  for (const [index, anchor] of duplicate.contour.anchors.entries()) {
    let id: AnchorId;
    try {
      id = context.createAnchorId(sourceId, index);
    } catch {
      diagnostics.push(
        diagnostic(
          'anchor-id-unavailable',
          `/components/contour/anchors/${index}/id`,
          'A fresh stable anchor identity could not be allocated.',
          'Retry the duplicate operation with an available deterministic ID.',
        ),
      );
      continue;
    }
    if (typeof id !== 'string' || !isStableId(id, 'anchor')) {
      diagnostics.push(
        diagnostic(
          'invalid-stable-id',
          `/components/contour/anchors/${index}/id`,
          'The anchor identity factory returned a malformed ID.',
          'Provide a lowercase prefixed 128-bit stable anchor ID.',
          id,
        ),
      );
      continue;
    }
    if (usedIds.has(id)) {
      diagnostics.push(
        diagnostic(
          'duplicate-id',
          `/components/contour/anchors/${index}/id`,
          `Anchor identity ${id} is already used by another Field.`,
          'Provide a fresh stable anchor identity.',
          id,
        ),
      );
      continue;
    }
    usedIds.add(id);
    anchor.id = id;
  }
  return diagnostics;
}

const componentIndex = (recipe: TextureRecipe, id: ComponentId): number =>
  recipe.components.findIndex((component) => component.id === id);

const validComponentId = (value: unknown): value is ComponentId =>
  typeof value === 'string' && isStableId(value, 'component');

function validComponentIdentityList(recipe: TextureRecipe): ComponentCommandDiagnostic[] {
  const diagnostics: ComponentCommandDiagnostic[] = [];
  const seen = new Set<string>();
  recipe.components.forEach((component, index) => {
    if (!validComponentId(component.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-stable-id',
          `/components/${index}/id`,
          'Component identity is malformed.',
          'Use a lowercase prefixed 128-bit stable component ID.',
        ),
      );
    } else if (seen.has(component.id)) {
      diagnostics.push(
        diagnostic(
          'duplicate-id',
          `/components/${index}/id`,
          `Component identity ${component.id} is duplicated.`,
          'Give each component a unique stable identity.',
          component.id,
        ),
      );
    } else {
      seen.add(component.id);
    }
  });
  return diagnostics;
}

function finalize(
  candidate: TextureRecipe,
  context: ComponentCommandContext,
  kind: string,
  summary: string,
): CandidateResult<TextureRecipe, ComponentCommandDiagnostic> {
  try {
    // Validate a normalized detached value, while returning the detached
    // authored candidate.  This keeps precise editor values stable (including
    // decimal slider values) while ensuring canonical bytes and validation use
    // the exact normalized representation.
    const detached = cloneRecipe(candidate);
    const normalized = normalizeRecipe(cloneRecipe(detached));
    const identities = validComponentIdentityList(normalized);
    if (identities.length > 0) return failure(...identities);

    const shape = validateRecipeShape(normalized);
    if (!shape.ok) return { kind: 'failure', diagnostics: shape.diagnostics };
    const domain = validateRecipeDomain(normalized);
    if (!domain.ok) return { kind: 'failure', diagnostics: domain.diagnostics };

    const canonicalBytes = cloneCanonicalBytes(context.canonicalize(cloneRecipe(normalized)));
    return {
      kind: 'success',
      candidate: detached,
      canonicalBytes,
      summary,
    };
  } catch {
    return failure(
      diagnostic(
        'invalid-component-candidate',
        '/components',
        `Command ${kind} could not produce a valid recipe candidate.`,
        'Correct the component values and try again.',
      ),
    );
  }
}

function ensureRecipeAndContext(
  recipe: TextureRecipe,
  context: ComponentCommandContext,
): ComponentCommandDiagnostic[] {
  if (context === null || typeof context !== 'object') {
    return [diagnostic('invalid-command-context', '/', 'Component command context is required.')];
  }
  if (typeof context.canonicalize !== 'function') {
    return [
      diagnostic(
        'invalid-command-context',
        '/canonicalize',
        'A recipe canonicalizer is required.',
        'Provide a deterministic canonicalize function.',
      ),
    ];
  }
  return validComponentIdentityList(recipe);
}

function command(
  kind: string,
  summary: string,
  prepare: (recipe: TextureRecipe) => CandidateResult<TextureRecipe, ComponentCommandDiagnostic>,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return { kind, summary, prepare };
}

/** Add a detached component at the requested z-order position (or the end). */
export function addComponentCommand(
  component: Component,
  context: ComponentCommandContext,
  targetIndex?: number,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-add', 'Add component', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    if (
      targetIndex !== undefined &&
      (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > current.components.length)
    ) {
      return failure(
        diagnostic(
          'invalid-component-index',
          '/components',
          'Component insertion index is outside the valid z-order bounds.',
          'Choose an integer insertion index from 0 through the component count.',
        ),
      );
    }

    let id: ComponentId;
    try {
      id = context.createComponentId();
    } catch {
      return failure(
        diagnostic(
          'component-id-unavailable',
          '/components',
          'A new stable component identity could not be allocated.',
          'Retry the add operation.',
        ),
      );
    }
    if (!validComponentId(id) || current.components.some((entry) => entry.id === id)) {
      return failure(
        diagnostic(
          'duplicate-id',
          '/components',
          'The component identity factory returned an invalid or already-used ID.',
          'Provide a fresh stable component identity.',
          id,
        ),
      );
    }
    let inserted: Component;
    try {
      inserted = cloneComponent(component);
    } catch {
      return failure(
        diagnostic(
          'invalid-component-candidate',
          '/components',
          'The component to add could not be detached safely.',
          'Provide a schema-valid component value and try again.',
        ),
      );
    }
    inserted.id = id;
    const components = current.components.map(cloneComponent);
    const index = targetIndex ?? components.length;
    components.splice(index, 0, inserted);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-add',
      'Add component',
    );
  });
}

/** Duplicate a component, preserving all values while allocating a new ID. */
export function duplicateComponentCommand(
  targetId: ComponentId,
  context: ComponentCommandContext,
  targetIndex?: number,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-duplicate', 'Duplicate component', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const sourceIndex = componentIndex(current, targetId);
    if (sourceIndex < 0) return invalidTarget(targetId);
    if (
      targetIndex !== undefined &&
      (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > current.components.length)
    ) {
      return failure(
        diagnostic(
          'invalid-component-index',
          '/components',
          'Component insertion index is outside the valid z-order bounds.',
          'Choose an integer insertion index from 0 through the component count.',
        ),
      );
    }

    let id: ComponentId;
    try {
      id = context.createComponentId();
    } catch {
      return failure(
        diagnostic(
          'component-id-unavailable',
          '/components',
          'A new stable component identity could not be allocated.',
          'Retry the duplicate operation.',
        ),
      );
    }
    if (!validComponentId(id) || current.components.some((entry) => entry.id === id)) {
      return failure(
        diagnostic(
          'duplicate-id',
          '/components',
          'The component identity factory returned an invalid or already-used ID.',
          'Provide a fresh stable component identity.',
          id,
        ),
      );
    }
    const duplicate = cloneComponent(current.components[sourceIndex]!);
    const anchorDiagnostics = remapDuplicatedFieldAnchors(duplicate, targetId, current, context);
    if (anchorDiagnostics.length > 0) return failure(...anchorDiagnostics);
    duplicate.id = id;
    const components = current.components.map(cloneComponent);
    components.splice(targetIndex ?? components.length, 0, duplicate);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-duplicate',
      'Duplicate component',
    );
  });
}

/** Remove exactly one component identified by its stable ID. */
export function removeComponentCommand(
  targetId: ComponentId,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-remove', 'Remove component', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const targetIndex = componentIndex(current, targetId);
    if (targetIndex < 0) return invalidTarget(targetId);
    const components = current.components
      .filter((_, index) => index !== targetIndex)
      .map(cloneComponent);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-remove',
      'Remove component',
    );
  });
}

/** Reorder one component by stable ID without changing any component payload. */
export function reorderComponentCommand(
  targetId: ComponentId,
  targetIndex: number,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-reorder', 'Reorder component', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= current.components.length
    ) {
      return failure(
        diagnostic(
          'invalid-component-index',
          '/components',
          'Component reorder index is outside the valid z-order bounds.',
          'Choose an integer index within the current component array.',
        ),
      );
    }
    const sourceIndex = componentIndex(current, targetId);
    if (sourceIndex < 0) return invalidTarget(targetId);
    if (sourceIndex === targetIndex) {
      return failure(
        diagnostic(
          'no-change',
          `/components/${sourceIndex}`,
          'Component is already at the requested z-order position.',
          'Choose a different z-order position.',
          targetId,
        ),
      );
    }
    const components = current.components.map(cloneComponent);
    const [moved] = components.splice(sourceIndex, 1);
    if (moved === undefined)
      return failure(
        diagnostic('invalid-component-target', '/components', 'Component target is unavailable.'),
      );
    components.splice(targetIndex, 0, moved);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-reorder',
      'Reorder component',
    );
  });
}

function patchKeys(value: object): string[] {
  return Object.keys(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePointPatch(value: unknown, path: string): ComponentCommandDiagnostic[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [diagnostic('invalid-patch', path, `Expected an object at ${path}.`)];
  }
  const patch = value as Record<string, unknown>;
  const diagnostics: ComponentCommandDiagnostic[] = [];
  for (const key of patchKeys(patch)) {
    if (key !== 'x' && key !== 'y') diagnostics.push(unknownProperty(`${path}/${key}`));
    const coordinate = patch[key];
    if (!finiteNumber(coordinate) || coordinate < 0 || coordinate > 1) {
      diagnostics.push(
        diagnostic(
          'out-of-range-number',
          `${path}/${key}`,
          `Point coordinate at ${path}/${key} must be finite and within 0..1.`,
          'Use a normalized coordinate between 0 and 1.',
        ),
      );
    }
  }
  if (patchKeys(patch).length === 0)
    diagnostics.push(diagnostic('empty-patch', path, 'Patch must change at least one value.'));
  return diagnostics;
}

function validateSizePatch(value: unknown, path: string): ComponentCommandDiagnostic[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [diagnostic('invalid-patch', path, `Expected an object at ${path}.`)];
  }
  const patch = value as Record<string, unknown>;
  const diagnostics: ComponentCommandDiagnostic[] = [];
  for (const key of patchKeys(patch)) {
    if (key !== 'width' && key !== 'height') diagnostics.push(unknownProperty(`${path}/${key}`));
    const size = patch[key];
    if (!finiteNumber(size) || size < 0.001 || size > 4) {
      diagnostics.push(
        diagnostic(
          'out-of-range-number',
          `${path}/${key}`,
          `Size at ${path}/${key} must be finite and within 0.001..4.`,
          'Use a size within the documented recipe range.',
        ),
      );
    }
  }
  if (patchKeys(patch).length === 0)
    diagnostics.push(diagnostic('empty-patch', path, 'Patch must change at least one value.'));
  return diagnostics;
}

function validateTransformPatch(value: ComponentTransformPatch): ComponentCommandDiagnostic[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [diagnostic('invalid-patch', '/transform', 'Transform patch must be an object.')];
  }
  const patch = value as Record<string, unknown>;
  const diagnostics: ComponentCommandDiagnostic[] = [];
  for (const key of patchKeys(patch)) {
    if (
      key !== 'translation' &&
      key !== 'baseSize' &&
      key !== 'rotationDeg' &&
      key !== 'uniformScale'
    ) {
      diagnostics.push(unknownProperty(`/transform/${key}`));
    }
  }
  if (value.translation !== undefined)
    diagnostics.push(...validatePointPatch(value.translation, '/transform/translation'));
  if (value.baseSize !== undefined)
    diagnostics.push(...validateSizePatch(value.baseSize, '/transform/baseSize'));
  if (
    value.rotationDeg !== undefined &&
    (!finiteNumber(value.rotationDeg) || value.rotationDeg < -180 || value.rotationDeg >= 180)
  ) {
    diagnostics.push(
      diagnostic(
        'out-of-range-number',
        '/transform/rotationDeg',
        'Rotation must be finite, at least -180, and less than 180 degrees.',
        'Use a rotation in the documented range.',
      ),
    );
  }
  if (
    value.uniformScale !== undefined &&
    (!finiteNumber(value.uniformScale) || value.uniformScale < 0.05 || value.uniformScale > 4)
  ) {
    diagnostics.push(
      diagnostic(
        'out-of-range-number',
        '/transform/uniformScale',
        'Uniform scale must be finite and within 0.05..4.',
        'Use a scale within the documented recipe range.',
      ),
    );
  }
  if (patchKeys(patch).length === 0)
    diagnostics.push(
      diagnostic('empty-patch', '/transform', 'Transform patch must change at least one value.'),
    );
  return diagnostics;
}

/** Apply a partial transform patch to one selected component. */
export function updateComponentTransformCommand(
  targetId: ComponentId,
  patch: ComponentTransformPatch,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-transform', 'Update component transform', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const index = componentIndex(current, targetId);
    if (index < 0) return invalidTarget(targetId);
    const patchDiagnostics = validateTransformPatch(patch);
    if (patchDiagnostics.length > 0) return failure(...patchDiagnostics);

    const components = current.components.map(cloneComponent);
    const target = components[index]!;
    const transform: ComponentTransform = {
      ...target.transform,
      ...(patch['translation'] === undefined
        ? {}
        : {
            translation: {
              ...target.transform.translation,
              ...(patch['translation'] as Partial<Point>),
            },
          }),
      ...(patch['baseSize'] === undefined
        ? {}
        : {
            baseSize: {
              ...target.transform.baseSize,
              ...(patch['baseSize'] as Partial<Size>),
            },
          }),
      ...(patch['rotationDeg'] === undefined
        ? {}
        : { rotationDeg: patch['rotationDeg'] as number }),
      ...(patch['uniformScale'] === undefined
        ? {}
        : { uniformScale: patch['uniformScale'] as number }),
    };
    target.transform = transform;
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-transform',
      'Update component transform',
    );
  });
}

function validateAppearancePatch(value: ComponentAppearancePatch): ComponentCommandDiagnostic[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [diagnostic('invalid-patch', '/appearance', 'Appearance patch must be an object.')];
  }
  const patch = value as Record<string, unknown>;
  const diagnostics: ComponentCommandDiagnostic[] = [];
  for (const key of patchKeys(patch)) {
    if (!['softness', 'highlight', 'grain', 'asymmetry', 'blendMode'].includes(key)) {
      diagnostics.push(unknownProperty(`/appearance/${key}`));
      continue;
    }
    const candidate = patch[key];
    if (key === 'blendMode') {
      if (typeof candidate !== 'string' || !BLEND_MODES.has(candidate as BlendMode)) {
        diagnostics.push(
          diagnostic(
            'invalid-blend-mode',
            '/appearance/blendMode',
            'Blend mode is unsupported.',
            'Choose a supported blend mode.',
          ),
        );
      }
      continue;
    }
    const minimum = key === 'asymmetry' ? -1 : 0;
    if (!finiteNumber(candidate) || candidate < minimum || candidate > 1) {
      diagnostics.push(
        diagnostic(
          'out-of-range-number',
          `/appearance/${key}`,
          `Appearance value at /appearance/${key} is outside the supported range.`,
          'Use a finite value within the documented appearance range.',
        ),
      );
    }
  }
  if (patchKeys(patch).length === 0)
    diagnostics.push(
      diagnostic('empty-patch', '/appearance', 'Appearance patch must change at least one value.'),
    );
  return diagnostics;
}

/** Apply a partial appearance patch to one selected component. */
export function updateComponentAppearanceCommand(
  targetId: ComponentId,
  patch: ComponentAppearancePatch,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-appearance', 'Update component appearance', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const index = componentIndex(current, targetId);
    if (index < 0) return invalidTarget(targetId);
    const patchDiagnostics = validateAppearancePatch(patch);
    if (patchDiagnostics.length > 0) return failure(...patchDiagnostics);
    const components = current.components.map(cloneComponent);
    const target = components[index]!;
    target.appearance = { ...target.appearance, ...(patch as Partial<ComponentAppearance>) };
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-appearance',
      'Update component appearance',
    );
  });
}

/** Rename one visible layer without changing its geometry or appearance. */
export function renameComponentCommand(
  targetId: ComponentId,
  name: string,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('component-rename', 'Rename component', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const index = componentIndex(current, targetId);
    if (index < 0) return invalidTarget(targetId);
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      return failure(
        diagnostic(
          'invalid-component-name',
          `/components/${index}/name`,
          'Layer names must contain 1-80 non-space characters.',
          'Enter a short, descriptive layer name.',
          targetId,
        ),
      );
    }
    const components = current.components.map(cloneComponent);
    components[index]!.name = trimmed;
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'component-rename',
      'Rename component',
    );
  });
}

function fieldTarget(
  recipe: TextureRecipe,
  targetId: ComponentId,
): { readonly index: number; readonly field: Extract<Component, { type: 'field' }> } | undefined {
  const index = componentIndex(recipe, targetId);
  const component = index < 0 ? undefined : recipe.components[index];
  if (component?.type !== 'field') return undefined;
  return { index, field: component };
}

function fieldTargetFailure(
  recipe: TextureRecipe,
  targetId: ComponentId,
): CandidateResult<TextureRecipe, ComponentCommandDiagnostic> | undefined {
  const index = componentIndex(recipe, targetId);
  if (index < 0) return invalidTarget(targetId);
  if (recipe.components[index]?.type === 'field') return undefined;
  return failure(
    diagnostic(
      'field-required',
      `/components/${index}`,
      'Anchor editing is available only for Field layers.',
      'Select a Field layer and try again.',
      targetId,
    ),
  );
}

/** Move one Field anchor. Invalid/self-intersecting candidates are rejected by finalize. */
export function updateFieldAnchorCommand(
  targetId: ComponentId,
  anchorId: AnchorId,
  patch: FieldAnchorPatch,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('field-anchor-update', 'Move Field anchor', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const targetFailure = fieldTargetFailure(current, targetId);
    if (targetFailure !== undefined) return targetFailure;
    const target = fieldTarget(current, targetId);
    if (target === undefined) return invalidTarget(targetId);
    const patchDiagnostics = validatePointPatch(
      patch,
      `/components/${target.index}/contour/anchors`,
    );
    if (patchDiagnostics.length > 0) return failure(...patchDiagnostics);
    const anchorIndex = target.field.contour.anchors.findIndex((anchor) => anchor.id === anchorId);
    if (anchorIndex < 0) {
      return failure(
        diagnostic(
          'unknown-anchor-target',
          `/components/${target.index}/contour/anchors`,
          'The selected anchor no longer exists on this Field.',
          'Select an existing anchor and try again.',
          anchorId,
        ),
      );
    }
    const components = current.components.map(cloneComponent);
    const field = components[target.index]! as Extract<Component, { type: 'field' }>;
    const anchor = field.contour.anchors[anchorIndex]!;
    field.contour.anchors[anchorIndex] = { ...anchor, ...patch };
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'field-anchor-update',
      'Move Field anchor',
    );
  });
}

/**
 * Insert an anchor after an existing Field anchor. Callers may provide an
 * explicit normalized point (for a contour click); otherwise insertion uses
 * the midpoint of the adjacent segment.
 */
export function insertFieldAnchorCommand(
  targetId: ComponentId,
  afterAnchorId: AnchorId,
  context: ComponentCommandContext,
  insertionPoint?: FieldAnchorPoint,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('field-anchor-insert', 'Add Field anchor', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const targetFailure = fieldTargetFailure(current, targetId);
    if (targetFailure !== undefined) return targetFailure;
    const target = fieldTarget(current, targetId);
    if (target === undefined) return invalidTarget(targetId);
    const anchors = target.field.contour.anchors;
    if (insertionPoint !== undefined) {
      const pointDiagnostics = validatePointPatch(
        insertionPoint,
        `/components/${target.index}/contour/anchors`,
      );
      const rawPoint = insertionPoint as unknown;
      if (
        rawPoint === null ||
        typeof rawPoint !== 'object' ||
        !Object.prototype.hasOwnProperty.call(rawPoint, 'x') ||
        !Object.prototype.hasOwnProperty.call(rawPoint, 'y')
      ) {
        pointDiagnostics.push(
          diagnostic(
            'incomplete-anchor-point',
            `/components/${target.index}/contour/anchors`,
            'An inserted Field anchor needs both normalized X and Y coordinates.',
            'Click a Field contour segment or use the Add anchor action.',
          ),
        );
      }
      if (pointDiagnostics.length > 0) return failure(...pointDiagnostics);
    }
    if (anchors.length >= 64) {
      return failure(
        diagnostic(
          'anchor-limit-reached',
          `/components/${target.index}/contour/anchors`,
          'A Field can contain at most 64 anchors.',
          'Move or remove an existing anchor instead.',
          targetId,
        ),
      );
    }
    const afterIndex = anchors.findIndex((anchor) => anchor.id === afterAnchorId);
    if (afterIndex < 0) {
      return failure(
        diagnostic(
          'unknown-anchor-target',
          `/components/${target.index}/contour/anchors`,
          'The selected anchor no longer exists on this Field.',
          'Select an existing anchor and try again.',
          afterAnchorId,
        ),
      );
    }
    let nextId: AnchorId;
    try {
      nextId = context.createAnchorId(targetId, afterIndex + 1);
    } catch {
      return failure(
        diagnostic(
          'anchor-id-unavailable',
          `/components/${target.index}/contour/anchors`,
          'A fresh anchor identity could not be allocated.',
          'Retry the add action.',
          targetId,
        ),
      );
    }
    if (!isStableId(nextId, 'anchor') || allAnchorIds(current).has(nextId)) {
      return failure(
        diagnostic(
          'duplicate-id',
          `/components/${target.index}/contour/anchors`,
          'The new anchor identity is invalid or already in use.',
          'Retry the add action with a fresh anchor identity.',
          nextId,
        ),
      );
    }
    const currentAnchor = anchors[afterIndex]!;
    const followingAnchor = anchors[(afterIndex + 1) % anchors.length]!;
    const inserted: ShapeAnchor = {
      id: nextId,
      x: insertionPoint?.x ?? (currentAnchor.x + followingAnchor.x) / 2,
      y: insertionPoint?.y ?? (currentAnchor.y + followingAnchor.y) / 2,
      segmentToNext: { kind: 'line' },
    };
    const components = current.components.map(cloneComponent);
    const field = components[target.index]! as Extract<Component, { type: 'field' }>;
    field.contour.anchors[afterIndex] = { ...currentAnchor, segmentToNext: { kind: 'line' } };
    field.contour.anchors.splice(afterIndex + 1, 0, inserted);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'field-anchor-insert',
      'Add Field anchor',
    );
  });
}

/** Remove one Field anchor while enforcing the bounded v0.2 minimum. */
export function removeFieldAnchorCommand(
  targetId: ComponentId,
  anchorId: AnchorId,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('field-anchor-remove', 'Remove Field anchor', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const targetFailure = fieldTargetFailure(current, targetId);
    if (targetFailure !== undefined) return targetFailure;
    const target = fieldTarget(current, targetId);
    if (target === undefined) return invalidTarget(targetId);
    if (target.field.contour.anchors.length <= 10) {
      return failure(
        diagnostic(
          'anchor-minimum-reached',
          `/components/${target.index}/contour/anchors`,
          'A Field must retain at least 10 anchors.',
          'Move an anchor or add another one before removing.',
          targetId,
        ),
      );
    }
    const anchorIndex = target.field.contour.anchors.findIndex((anchor) => anchor.id === anchorId);
    if (anchorIndex < 0) {
      return failure(
        diagnostic(
          'unknown-anchor-target',
          `/components/${target.index}/contour/anchors`,
          'The selected anchor no longer exists on this Field.',
          'Select an existing anchor and try again.',
          anchorId,
        ),
      );
    }
    const components = current.components.map(cloneComponent);
    const field = components[target.index]! as Extract<Component, { type: 'field' }>;
    field.contour.anchors.splice(anchorIndex, 1);
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'field-anchor-remove',
      'Remove Field anchor',
    );
  });
}

/** Apply the bounded Band geometry controls exposed by the lite inspector. */
export function updateBandShapeCommand(
  targetId: ComponentId,
  patch: BandShapePatch,
  context: ComponentCommandContext,
): DesignCommand<TextureRecipe, ComponentCommandDiagnostic> {
  return command('band-shape-update', 'Update Band shape', (current) => {
    const preflight = ensureRecipeAndContext(current, context);
    if (preflight.length > 0) return failure(...preflight);
    const index = componentIndex(current, targetId);
    if (index < 0) return invalidTarget(targetId);
    const component = current.components[index];
    if (component?.type !== 'band') {
      return failure(
        diagnostic(
          'band-required',
          `/components/${index}`,
          'Band shape controls are available only for Band layers.',
          'Select a Band layer and try again.',
          targetId,
        ),
      );
    }
    const keys = Object.keys(patch);
    if (keys.length === 0 || keys.some((key) => key !== 'taper' && key !== 'endCap')) {
      return failure(diagnostic('invalid-patch', '/band', 'Band shape patch is invalid.'));
    }
    if (
      patch.taper !== undefined &&
      (!finiteNumber(patch.taper) || patch.taper < 0 || patch.taper > 1)
    ) {
      return failure(
        diagnostic(
          'out-of-range-number',
          `/components/${index}/band/taper`,
          'Band taper must be finite and within 0..1.',
          'Use a taper between 0 and 1.',
          targetId,
        ),
      );
    }
    if (patch.endCap !== undefined && patch.endCap !== 'flat' && patch.endCap !== 'round') {
      return failure(
        diagnostic(
          'invalid-band-end-cap',
          `/components/${index}/band/endCap`,
          'Band end cap must be round or flat.',
          'Choose round or flat.',
          targetId,
        ),
      );
    }
    const components = current.components.map(cloneComponent);
    const band = components[index]! as Extract<Component, { type: 'band' }>;
    band.band = { ...band.band, ...patch };
    return finalize(
      { ...cloneRecipe(current), components },
      context,
      'band-shape-update',
      'Update Band shape',
    );
  });
}

/**
 * Normalize ephemeral selection to the recipe's canonical z-order.  This
 * helper intentionally never writes `recipe.provenance` or any other durable
 * recipe field.
 */
export function normalizeComponentSelection(
  recipe: TextureRecipe,
  selectedIds: readonly ComponentId[],
): ComponentId[] {
  const selected = new Set<string>(selectedIds);
  return recipe.components.map((component) => component.id).filter((id) => selected.has(id));
}
