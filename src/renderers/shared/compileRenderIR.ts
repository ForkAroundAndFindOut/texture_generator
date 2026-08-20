import {
  compileBandGeometry,
  compileFieldGeometry,
  type ColorValue,
  type Component,
  type ComponentAppearance,
  type TextureRecipe,
} from '../../domain/index';
import {
  type BaseLayerIR,
  type ColorIR,
  type ComponentLayerIR,
  type EffectsLayerIR,
  type FadeIR,
  type FitIR,
  type MatrixIR,
  type PathCommand,
  type PathIR,
  type PointIR,
  type RenderIR,
  type RenderLayersIR,
  type TileCopyIR,
  toCanonicalHex,
} from './ir';
import {
  isRenderProfile,
  quantizeNumber,
  toNormalizedSignedUnit,
  toNormalizedUnit,
  toPositiveDimension,
  type RenderProfile,
} from './profile';

const finite = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return value;
};

const quantized = (value: unknown, label: string) => quantizeNumber(finite(value, label));

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const adaptPathCommand = (value: unknown, label: string): PathCommand => {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    throw new TypeError(`${label} must be a path command.`);
  }

  switch (value['kind']) {
    case 'move':
      return {
        kind: 'move',
        x: quantized(value['x'], `${label}.x`),
        y: quantized(value['y'], `${label}.y`),
      };
    case 'line':
      return {
        kind: 'line',
        x: quantized(value['x'], `${label}.x`),
        y: quantized(value['y'], `${label}.y`),
      };
    case 'cubic':
      return {
        kind: 'cubic',
        c1x: quantized(value['c1x'], `${label}.c1x`),
        c1y: quantized(value['c1y'], `${label}.c1y`),
        c2x: quantized(value['c2x'], `${label}.c2x`),
        c2y: quantized(value['c2y'], `${label}.c2y`),
        x: quantized(value['x'], `${label}.x`),
        y: quantized(value['y'], `${label}.y`),
      };
    case 'close':
      return { kind: 'close' };
    default:
      throw new RangeError(`${label}.kind is not supported.`);
  }
};

const isPathSegment = (
  command: PathCommand,
): command is Extract<PathCommand, { kind: 'line' | 'cubic' }> =>
  command.kind === 'line' || command.kind === 'cubic';

/** Rebrand and validate domain-neutral geometry at the renderer boundary. */
const adaptDomainPath = (value: unknown, componentId: string): PathIR => {
  if (!isRecord(value) || value['kind'] !== 'path' || value['version'] !== 'path-ir-v1') {
    throw new TypeError(`Component ${componentId} geometry must be a path-ir-v1 value.`);
  }

  const rawCommands = value['commands'];
  if (!Array.isArray(rawCommands)) {
    throw new TypeError(`Component ${componentId} geometry commands must be an array.`);
  }
  const commands = rawCommands.map((command, index) =>
    adaptPathCommand(command, `component ${componentId}.commands[${index}]`),
  );
  const first = commands[0];
  const last = commands.at(-1);
  const middle = commands.slice(1, -1);
  if (
    first === undefined ||
    first.kind !== 'move' ||
    last === undefined ||
    last.kind !== 'close' ||
    !middle.every(isPathSegment)
  ) {
    throw new RangeError(`Component ${componentId} geometry must be a non-empty closed path.`);
  }
  const closedCommands: PathIR['commands'] = [first, ...middle.filter(isPathSegment), last];

  const rawMatrix = value['matrix'];
  if (!isRecord(rawMatrix)) {
    throw new TypeError(`Component ${componentId} geometry matrix must be an object.`);
  }
  const matrix: MatrixIR = {
    a: quantized(rawMatrix['a'], `component ${componentId}.matrix.a`),
    b: quantized(rawMatrix['b'], `component ${componentId}.matrix.b`),
    c: quantized(rawMatrix['c'], `component ${componentId}.matrix.c`),
    d: quantized(rawMatrix['d'], `component ${componentId}.matrix.d`),
    e: quantized(rawMatrix['e'], `component ${componentId}.matrix.e`),
    f: quantized(rawMatrix['f'], `component ${componentId}.matrix.f`),
  };

  if (value['sourceComponentId'] !== componentId) {
    throw new RangeError(`Component ${componentId} geometry provenance does not match its id.`);
  }
  const rawAnchorIds = value['sourceAnchorIds'];
  if (
    rawAnchorIds !== undefined &&
    (!Array.isArray(rawAnchorIds) || !rawAnchorIds.every((id) => typeof id === 'string'))
  ) {
    throw new TypeError(`Component ${componentId} geometry anchor provenance is invalid.`);
  }

  const base = {
    kind: 'path' as const,
    version: 'path-ir-v1' as const,
    commands: closedCommands,
    matrix,
    sourceComponentId: componentId,
  };
  return rawAnchorIds === undefined ? base : { ...base, sourceAnchorIds: rawAnchorIds };
};

const color = (value: ColorValue, label: string): ColorIR => ({
  hex: toCanonicalHex(value.hex),
  opacity: toNormalizedUnit(finite(value.opacity, `${label}.opacity`)),
});

const resolveComponentColor = (recipe: TextureRecipe, component: Component): ColorIR => {
  if (component.colorSource.kind === 'local') {
    return color(component.colorSource.value, `${component.id}.colorSource.value`);
  }

  const paletteId = Object.getOwnPropertyDescriptor(component.colorSource, 'paletteId')?.value;
  if (typeof paletteId !== 'string') {
    throw new RangeError(`Component ${component.id} has an invalid color source.`);
  }
  const paletteEntry = recipe.palette.find((entry) => entry.id === paletteId);
  if (paletteEntry === undefined) {
    throw new RangeError(
      `Component ${component.id} references missing palette entry ${paletteId}.`,
    );
  }
  return color(paletteEntry.value, `palette.${paletteEntry.id}.value`);
};

const filterForGrain = (grain: number): FadeIR['filter'] => {
  const amount = toNormalizedUnit(finite(grain, 'grain'));
  return amount === 0 ? { kind: 'none' } : { kind: 'grain', amount };
};

/**
 * Derive a small, renderer-neutral fade description from editable appearance
 * values. Stops are intentionally fixed and ordered; they are not recipe
 * state and therefore cannot become a second source of truth.
 */
const fadeForAppearance = (appearance: ComponentAppearance): FadeIR => {
  const softness = toNormalizedUnit(finite(appearance.softness, 'appearance.softness'));
  const highlight = toNormalizedUnit(finite(appearance.highlight, 'appearance.highlight'));
  const asymmetry = toNormalizedSignedUnit(finite(appearance.asymmetry, 'appearance.asymmetry'));
  const middle = toNormalizedUnit(clamp(0.5 + asymmetry * 0.25, 0, 1));
  return {
    kind: 'fade',
    softness,
    highlight,
    asymmetry,
    stops: [
      { offset: toNormalizedUnit(0), opacity: toNormalizedUnit(0) },
      { offset: middle, opacity: highlight },
      { offset: toNormalizedUnit(1), opacity: toNormalizedUnit(clamp(1 - softness * 0.15, 0, 1)) },
    ],
    filter: filterForGrain(appearance.grain),
  };
};

const fadeForEffects = (recipe: TextureRecipe): FadeIR => {
  const softness = toNormalizedUnit(clamp(0.5 + recipe.effects.softnessBias * 0.5, 0, 1));
  const highlight = toNormalizedUnit(clamp(0.5 + recipe.effects.contrast * 0.5, 0, 1));
  const asymmetry = toNormalizedSignedUnit(0);
  return {
    kind: 'fade',
    softness,
    highlight,
    asymmetry,
    stops: [
      { offset: toNormalizedUnit(0), opacity: toNormalizedUnit(0) },
      { offset: toNormalizedUnit(0.5), opacity: highlight },
      { offset: toNormalizedUnit(1), opacity: toNormalizedUnit(1) },
    ],
    filter: filterForGrain(recipe.effects.grain),
  };
};

const targetMatrix = (
  profile: RenderProfile,
  sourceWidth: number,
  sourceHeight: number,
): FitIR['matrix'] => {
  const targetWidth = toPositiveDimension(profile.width);
  const targetHeight = toPositiveDimension(profile.height);
  const width = toPositiveDimension(sourceWidth);
  const height = toPositiveDimension(sourceHeight);
  const widthScale = targetWidth / width;
  const heightScale = targetHeight / height;

  let scaleX = widthScale;
  let scaleY = heightScale;
  let offsetX = 0;
  let offsetY = 0;
  if (profile.fit === 'contain') {
    const scale = Math.min(widthScale, heightScale);
    scaleX = scale;
    scaleY = scale;
    offsetX = (profile.width - sourceWidth * scale) / 2;
    offsetY = (profile.height - sourceHeight * scale) / 2;
  } else if (profile.fit === 'cover') {
    const scale = Math.max(widthScale, heightScale);
    scaleX = scale;
    scaleY = scale;
    offsetX = (profile.width - sourceWidth * scale) / 2;
    offsetY = (profile.height - sourceHeight * scale) / 2;
  }

  return {
    a: quantized(scaleX, 'fit.matrix.a'),
    b: quantized(0, 'fit.matrix.b'),
    c: quantized(0, 'fit.matrix.c'),
    d: quantized(scaleY, 'fit.matrix.d'),
    e: quantized(offsetX, 'fit.matrix.e'),
    f: quantized(offsetY, 'fit.matrix.f'),
  };
};

const makeFit = (recipe: TextureRecipe, profile: RenderProfile): FitIR => ({
  kind: 'fit',
  mode: profile.fit,
  source: {
    kind: 'canvas-bounds',
    width: toPositiveDimension(recipe.canvas.width),
    height: toPositiveDimension(recipe.canvas.height),
  },
  target: {
    kind: 'target-bounds',
    width: toPositiveDimension(profile.width),
    height: toPositiveDimension(profile.height),
  },
  matrix: targetMatrix(profile, recipe.canvas.width, recipe.canvas.height),
});

const makeTileCopies = (profile: RenderProfile): readonly TileCopyIR[] => {
  if (!profile.inspectTiles) return [];
  const copies: TileCopyIR[] = [];
  for (const y of [-1, 0, 1]) {
    for (const x of [-1, 0, 1]) {
      if (x === 0 && y === 0) continue;
      const offset: PointIR = {
        x: quantized(x, 'tile offset x'),
        y: quantized(y, 'tile offset y'),
      };
      copies.push({
        kind: 'tile-copy',
        offset,
        clip: {
          kind: 'clip-rect',
          x: quantized(0, 'tile clip x'),
          y: quantized(0, 'tile clip y'),
          width: quantized(1, 'tile clip width'),
          height: quantized(1, 'tile clip height'),
        },
      });
    }
  }
  return copies;
};

/**
 * Domain geometry is normalized so it can be recipe-portable. RenderIR is
 * canvas-space, however, because SVG/CSS adapters must not guess the canvas
 * dimensions. Scaling the affine matrix (not the local path commands) keeps
 * rotation and component-local curves intact while resolving coordinates once.
 */
const resolvePathToCanvas = (
  path: PathIR,
  canvas: { readonly width: number; readonly height: number },
): PathIR => ({
  ...path,
  matrix: {
    a: quantized(path.matrix.a * canvas.width, 'path.matrix.a'),
    b: quantized(path.matrix.b * canvas.height, 'path.matrix.b'),
    c: quantized(path.matrix.c * canvas.width, 'path.matrix.c'),
    d: quantized(path.matrix.d * canvas.height, 'path.matrix.d'),
    e: quantized(path.matrix.e * canvas.width, 'path.matrix.e'),
    f: quantized(path.matrix.f * canvas.height, 'path.matrix.f'),
  },
});

const componentPath = (
  component: Component,
  canvas: { readonly width: number; readonly height: number },
): PathIR => {
  const domainPath =
    component.type === 'field' ? compileFieldGeometry(component) : compileBandGeometry(component);
  return resolvePathToCanvas(adaptDomainPath(domainPath, component.id), canvas);
};

const componentLayer = (
  recipe: TextureRecipe,
  component: Component,
  canvas: { readonly width: number; readonly height: number },
): ComponentLayerIR => {
  const path = componentPath(component, canvas);
  return {
    kind: component.type,
    id: component.id,
    path,
    color: resolveComponentColor(recipe, component),
    blendMode: component.appearance.blendMode,
    fade: fadeForAppearance(component.appearance),
    definitionId: `component:${component.id}`,
  };
};

/** Compile a validated recipe and explicit profile into immutable renderer IR. */
export function compileRenderIR(recipe: TextureRecipe, profile: RenderProfile): RenderIR {
  if (typeof recipe !== 'object' || recipe === null || Array.isArray(recipe)) {
    throw new TypeError('RenderIR compilation requires a recipe object.');
  }
  if (!isRenderProfile(profile)) {
    throw new RangeError('RenderIR compilation requires a valid render profile.');
  }

  const sourceWidth = finite(recipe.canvas.width, 'recipe.canvas.width');
  const sourceHeight = finite(recipe.canvas.height, 'recipe.canvas.height');
  const canvas = {
    kind: 'canvas-bounds' as const,
    width: toPositiveDimension(sourceWidth),
    height: toPositiveDimension(sourceHeight),
  };
  const fit = makeFit(recipe, profile);
  const clip = {
    kind: 'clip-rect' as const,
    x: quantized(0, 'clip.x'),
    y: quantized(0, 'clip.y'),
    width: canvas.width,
    height: canvas.height,
  };

  const layers: ComponentLayerIR[] = recipe.components.map((component) =>
    componentLayer(recipe, component, canvas),
  );
  const effects: EffectsLayerIR = {
    kind: 'effects',
    id: 'effects',
    fade: fadeForEffects(recipe),
    definitionId: 'effects',
  };
  const base: BaseLayerIR = {
    kind: 'base',
    id: 'base',
    color: color(recipe.base.value, 'base.value'),
    definitionId: 'base',
  };
  const orderedLayers: RenderLayersIR = [base, ...layers, effects];

  return {
    kind: 'render-ir',
    version: 'render-ir-v1',
    canvas,
    fit,
    clip,
    tileCopies: makeTileCopies(profile),
    layers: orderedLayers,
  };
}
