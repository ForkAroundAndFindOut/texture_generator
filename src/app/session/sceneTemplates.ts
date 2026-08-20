import {
  createBlobBoundary,
  createEllipseBoundary,
  createPolygonBoundary,
  createRibbonBoundary,
  createRoundedRectangleBoundary,
  createSilhouetteBoundary,
  createSolidStarBoundary,
  createTriangleBoundary,
  type Boundary,
  type GrainStyle,
  type InteractionMode,
  type SceneMaterial,
  type SceneV03,
} from '../../domain';

export type SceneShapePresetId =
  | 'glow'
  | 'band'
  | 'arc'
  | 'orb'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'ribbon'
  | 'blob'
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'pyramid'
  | 'prism';

export type SceneShapePreset = Readonly<{
  readonly id: SceneShapePresetId;
  readonly label: string;
  readonly description: string;
  readonly family: 'gesture' | 'shape' | 'silhouette';
}>;

export const SCENE_SHAPE_PRESETS: readonly SceneShapePreset[] = [
  {
    id: 'glow',
    label: 'Glow',
    description: 'A broad soft color field.',
    family: 'gesture',
  },
  {
    id: 'band',
    label: 'Band',
    description: 'A directional sweep of color.',
    family: 'gesture',
  },
  {
    id: 'arc',
    label: 'Arc',
    description: 'A single solid curved band.',
    family: 'gesture',
  },
  {
    id: 'orb',
    label: 'Orb',
    description: 'A highlight and bloom gesture.',
    family: 'gesture',
  },
  {
    id: 'rounded-rectangle',
    label: 'Rounded rectangle',
    description: 'A soft-edged panel shape.',
    family: 'shape',
  },
  { id: 'ellipse', label: 'Ellipse', description: 'A simple oval body.', family: 'shape' },
  { id: 'triangle', label: 'Triangle', description: 'A three-sided body.', family: 'shape' },
  { id: 'polygon', label: 'Polygon', description: 'A six-sided body.', family: 'shape' },
  { id: 'star', label: 'Star', description: 'A solid concave star.', family: 'shape' },
  { id: 'ribbon', label: 'Ribbon', description: 'A tapered solid strip.', family: 'shape' },
  { id: 'blob', label: 'Blob', description: 'An organic solid body.', family: 'shape' },
  { id: 'cube', label: 'Cube', description: 'A flat cube silhouette.', family: 'silhouette' },
  { id: 'sphere', label: 'Sphere', description: 'A flat sphere silhouette.', family: 'silhouette' },
  {
    id: 'cylinder',
    label: 'Cylinder',
    description: 'A flat cylinder silhouette.',
    family: 'silhouette',
  },
  { id: 'cone', label: 'Cone', description: 'A flat cone silhouette.', family: 'silhouette' },
  {
    id: 'pyramid',
    label: 'Pyramid',
    description: 'A flat pyramid silhouette.',
    family: 'silhouette',
  },
  { id: 'prism', label: 'Prism', description: 'A flat prism silhouette.', family: 'silhouette' },
];

const TEMPLATE_MATERIAL_ID = 'mat_00000000000000000000000000';

function arcBoundary(): Boundary {
  const center = { x: 0.5, y: 0.5 };
  const outerRadius = 0.42;
  const innerRadius = 0.28;
  const steps = 14;
  const start = -150;
  const end = 130;
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const point = (radius: number, degrees: number) => ({
    x: center.x + Math.cos(radians(degrees)) * radius,
    y: center.y + Math.sin(radians(degrees)) * radius,
  });
  return {
    vertices: [
      ...Array.from({ length: steps }, (_, index) =>
        point(outerRadius, start + ((end - start) * index) / (steps - 1)),
      ),
      ...Array.from({ length: steps }, (_, index) =>
        point(innerRadius, end - ((end - start) * index) / (steps - 1)),
      ),
    ],
  };
}

function boundaryForPreset(id: SceneShapePresetId): Boundary {
  switch (id) {
    case 'glow':
    case 'orb':
      return createEllipseBoundary({
        radiusX: id === 'orb' ? 0.24 : 0.38,
        radiusY: id === 'orb' ? 0.24 : 0.3,
      });
    case 'band':
      return createRibbonBoundary({ width: 0.94, height: 0.22, taper: 0.15, rotationDeg: -14 });
    case 'arc':
      return arcBoundary();
    case 'rounded-rectangle':
      return createRoundedRectangleBoundary({ width: 0.72, height: 0.45, cornerRadius: 0.1 });
    case 'ellipse':
      return createEllipseBoundary({ radiusX: 0.36, radiusY: 0.23 });
    case 'triangle':
      return createTriangleBoundary({ radius: 0.39 });
    case 'polygon':
      return createPolygonBoundary({ sides: 6, radius: 0.38 });
    case 'star':
      return createSolidStarBoundary({ arms: 5, outerRadius: 0.39, innerRadius: 0.19 });
    case 'ribbon':
      return createRibbonBoundary({ width: 0.82, height: 0.24, taper: 0.4, rotationDeg: 16 });
    case 'blob':
      return createBlobBoundary({ radius: 0.36, pointCount: 12, variance: 0.16, lobes: 4 });
    case 'cube':
    case 'sphere':
    case 'cylinder':
    case 'cone':
    case 'pyramid':
    case 'prism':
      return createSilhouetteBoundary(id, { scale: 0.86 });
  }
}

function defaultsForPreset(id: SceneShapePresetId): Readonly<{
  interaction: InteractionMode;
  opacity: number;
  edgeFeather: number;
  bloom: number;
  grain?: GrainStyle;
}> {
  switch (id) {
    case 'glow':
      return { interaction: 'glow', opacity: 0.72, edgeFeather: 0.58, bloom: 0.5 };
    case 'band':
      return {
        interaction: 'texture',
        opacity: 0.58,
        edgeFeather: 0.44,
        bloom: 0.08,
        grain: { kind: 'grain', amount: 0.08, scale: 0.45, seed: 11 },
      };
    case 'arc':
      return { interaction: 'glow', opacity: 0.78, edgeFeather: 0.28, bloom: 0.32 };
    case 'orb':
      return { interaction: 'glow', opacity: 0.88, edgeFeather: 0.36, bloom: 0.64 };
    case 'blob':
      return {
        interaction: 'texture',
        opacity: 0.64,
        edgeFeather: 0.3,
        bloom: 0.12,
        grain: { kind: 'paper', amount: 0.09, scale: 0.38, seed: 17 },
      };
    default:
      return { interaction: 'paint', opacity: 0.76, edgeFeather: 0.12, bloom: 0 };
  }
}

/** Creates a detached material template; the scene command supplies its durable ID. */
export function createSceneMaterialTemplate(
  scene: SceneV03,
  presetId: SceneShapePresetId,
): SceneMaterial {
  const preset = SCENE_SHAPE_PRESETS.find((entry) => entry.id === presetId);
  if (preset === undefined) throw new RangeError('Unknown v0.3 shape preset.');
  const nextNumber = scene.rootGroups.length + 1;
  const palette = scene.palette[scene.rootGroups.length % scene.palette.length];
  if (palette === undefined) throw new RangeError('A v0.3 scene requires a palette color.');
  const defaults = defaultsForPreset(presetId);
  return {
    kind: 'material',
    id: TEMPLATE_MATERIAL_ID,
    name: preset.label + ' ' + nextNumber,
    visible: true,
    geometry: { kind: 'boundary', boundary: boundaryForPreset(presetId) },
    fill: { kind: 'palette', paletteId: palette.id },
    opacity: defaults.opacity,
    edgeFeather: defaults.edgeFeather,
    bloom: defaults.bloom,
    interaction: defaults.interaction,
    ...(defaults.grain === undefined ? {} : { grain: defaults.grain }),
  };
}
