import type {
  CanonicalSceneColor,
  GrainStyle,
  GroupTransform,
  MaterialFill,
  SceneGroup,
  SceneMaterial,
  SceneNode,
  ScenePoint,
  SceneV03,
} from './types';

export const SCENE_V03_QUANTUM = 1e-6;

export function quantizeSceneV03Number(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Scene numbers must be finite.');
  }

  // Round the binary multiplication back through the documented decimal
  // quantum so in-memory editor values match the canonical six-decimal form.
  const quantized = Number((Math.round(value / SCENE_V03_QUANTUM) * SCENE_V03_QUANTUM).toFixed(6));
  return Object.is(quantized, -0) ? 0 : quantized;
}

export function normalizeSceneV03Rotation(value: number): number {
  const quantized = quantizeSceneV03Number(value);
  const normalized = ((((quantized + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : quantizeSceneV03Number(normalized);
}

function normalizeColor(value: CanonicalSceneColor): CanonicalSceneColor {
  return value.toUpperCase() as CanonicalSceneColor;
}

function normalizePoint(value: ScenePoint): ScenePoint {
  return { x: quantizeSceneV03Number(value.x), y: quantizeSceneV03Number(value.y) };
}

function normalizeTransform(value: GroupTransform): GroupTransform {
  return {
    translation: normalizePoint(value.translation),
    scale: normalizePoint(value.scale),
    rotationDeg: normalizeSceneV03Rotation(value.rotationDeg),
  };
}

function normalizeFill(value: MaterialFill): MaterialFill {
  return value.kind === 'palette'
    ? { kind: 'palette', paletteId: value.paletteId }
    : { kind: 'local', color: normalizeColor(value.color) };
}

function normalizeGrain(value: GrainStyle): GrainStyle {
  return {
    kind: value.kind,
    amount: quantizeSceneV03Number(value.amount),
    scale: quantizeSceneV03Number(value.scale),
    seed: value.seed,
  };
}

function normalizeMaterial(value: SceneMaterial): SceneMaterial {
  return {
    kind: 'material',
    id: value.id,
    name: value.name,
    visible: value.visible,
    geometry: {
      kind: 'boundary',
      boundary: { vertices: value.geometry.boundary.vertices.map(normalizePoint) },
    },
    fill: normalizeFill(value.fill),
    opacity: quantizeSceneV03Number(value.opacity),
    edgeFeather: quantizeSceneV03Number(value.edgeFeather),
    bloom: quantizeSceneV03Number(value.bloom),
    interaction: value.interaction,
    ...(value.grain === undefined ? {} : { grain: normalizeGrain(value.grain) }),
  };
}

function normalizeGroup(value: SceneGroup): SceneGroup {
  return {
    kind: 'group',
    id: value.id,
    name: value.name,
    visible: value.visible,
    transform: normalizeTransform(value.transform),
    children: value.children.map(normalizeNode),
  };
}

function normalizeNode(value: SceneNode): SceneNode {
  return value.kind === 'group' ? normalizeGroup(value) : normalizeMaterial(value);
}

/** Returns a detached canonical-shape clone while preserving all draw-order arrays. */
export function normalizeSceneV03(value: SceneV03): SceneV03 {
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    artboard: { ratio: value.artboard.ratio, fitMode: value.artboard.fitMode },
    background: normalizeColor(value.background),
    palette: value.palette.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: normalizeColor(entry.color),
    })),
    rootGroups: value.rootGroups.map(normalizeGroup),
  };
}
