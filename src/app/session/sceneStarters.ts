import {
  createBlankSceneV03,
  createEllipseBoundary as createRawEllipseBoundary,
  createRibbonBoundary as createRawRibbonBoundary,
  sceneV03IdFromBytes,
  type CanonicalSceneColor,
  type InteractionMode,
  type SceneGroup,
  type SceneMaterial,
  type SceneV03,
  type SceneV03IdKind,
} from '../../domain';

export type SceneStarterId =
  | 'blank'
  | 'cloud-drift'
  | 'aurora-wave'
  | 'satin-orb'
  | 'sunset-paper'
  | 'sea-glass'
  | 'violet-ribbons';

export type SceneStarter = Readonly<{
  readonly id: SceneStarterId;
  readonly label: string;
  readonly description: string;
  readonly colors: readonly CanonicalSceneColor[];
}>;

export const SCENE_STARTERS: readonly SceneStarter[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Start from the canvas color and an editable palette.',
    colors: ['#151A2D', '#5B8CFF', '#9D6CFF', '#F3B35C'],
  },
  {
    id: 'cloud-drift',
    label: 'Cloud drift',
    description: 'Pastel clouds like a soft product hero.',
    colors: ['#7EA3F6', '#F6B7E8', '#BDD8FF', '#EED1FA'],
  },
  {
    id: 'aurora-wave',
    label: 'Aurora wave',
    description: 'Cool blue, mint, and violet movement.',
    colors: ['#15315D', '#5B8CFF', '#22AA88', '#A987FF'],
  },
  {
    id: 'satin-orb',
    label: 'Satin orb',
    description: 'A luminous shape with a soft shadow field.',
    colors: ['#352B68', '#F3B35C', '#EFA8DE', '#B9C8FF'],
  },
  {
    id: 'sunset-paper',
    label: 'Sunset paper',
    description: 'Warm multi-color texture with restrained grain.',
    colors: ['#7B405A', '#FF9B78', '#FFD08A', '#E5B4F3'],
  },
  {
    id: 'sea-glass',
    label: 'Sea glass',
    description: 'A clean aqua field with a cool highlight.',
    colors: ['#17606C', '#6FE0D7', '#C6F4E9', '#78A9FF'],
  },
  {
    id: 'violet-ribbons',
    label: 'Violet ribbons',
    description: 'Layered bands for a directional editorial texture.',
    colors: ['#2A2457', '#9D6CFF', '#F5A7D8', '#8FC6FF'],
  },
];

function fixedId(kind: SceneV03IdKind, slot: number): string {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return sceneV03IdFromBytes(kind, bytes);
}

function baseScene(
  background: CanonicalSceneColor,
  colors: readonly CanonicalSceneColor[],
): SceneV03 {
  const scene = createBlankSceneV03();
  scene.background = background;
  scene.palette = scene.palette.map((entry, index) => ({
    ...entry,
    name: ['Sky', 'Bloom', 'Light', 'Accent'][index] ?? 'Color ' + (index + 1),
    color: colors[index] ?? entry.color,
  }));
  return scene;
}

function material(
  scene: SceneV03,
  slot: number,
  name: string,
  colorIndex: number,
  interaction: InteractionMode,
  geometry: SceneMaterial['geometry'],
  opacity: number,
  edgeFeather: number,
  bloom: number,
  grain?: SceneMaterial['grain'],
): SceneMaterial {
  const palette = scene.palette[colorIndex];
  if (palette === undefined) throw new RangeError('Starter scene palette is incomplete.');
  return {
    kind: 'material',
    id: fixedId('material', slot),
    name,
    visible: true,
    geometry,
    fill: { kind: 'palette', paletteId: palette.id },
    opacity,
    edgeFeather,
    bloom,
    interaction,
    ...(grain === undefined ? {} : { grain }),
  };
}

function group(slot: number, name: string, child: SceneMaterial): SceneGroup {
  return {
    kind: 'group',
    id: fixedId('group', slot),
    name,
    visible: true,
    transform: { translation: { x: 0.5, y: 0.5 }, uniformScale: 1, rotationDeg: 0 },
    children: [child],
  };
}

/** Keep starter geometry wholly inside the simple normalized Boundary space. */
function createEllipseBoundary(
  options: Parameters<typeof createRawEllipseBoundary>[0] = {},
): ReturnType<typeof createRawEllipseBoundary> {
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const radiusX = options.radiusX ?? 0.34;
  const radiusY = options.radiusY ?? 0.34;
  const safeRadiusX = Math.max(0.001, Math.min(radiusX, 0.495, center.x - 0.005, 0.995 - center.x));
  const safeRadiusY = Math.max(0.001, Math.min(radiusY, 0.495, center.y - 0.005, 0.995 - center.y));
  return createRawEllipseBoundary({
    ...options,
    center,
    radiusX: safeRadiusX,
    radiusY: safeRadiusY,
  });
}

/** A rotated ribbon may cross the normalized edge; shrink it deterministically until simple. */
function createRibbonBoundary(
  options: Parameters<typeof createRawRibbonBoundary>[0] = {},
): ReturnType<typeof createRawRibbonBoundary> {
  const width = options.width ?? 0.78;
  const height = options.height ?? 0.16;
  for (let step = 0; step < 24; step += 1) {
    const scale = 1 - step * 0.035;
    try {
      return createRawRibbonBoundary({ ...options, width: width * scale, height: height * scale });
    } catch {
      // Try the next smaller, still-valid representation of the same gesture.
    }
  }
  throw new RangeError('Starter ribbon could not fit inside the normalized artboard.');
}

function cloudDrift(): SceneV03 {
  const scene = baseScene('#7EA3F6', ['#F6B7E8', '#BDD8FF', '#EED1FA', '#7FA7F9']);
  scene.rootGroups = [
    group(
      101,
      'Blue cloud',
      material(
        scene,
        101,
        'Blue cloud',
        1,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.7, y: 0.67 },
            radiusX: 0.48,
            radiusY: 0.36,
          }),
        },
        0.76,
        0.66,
        0.34,
      ),
    ),
    group(
      102,
      'Pink cloud',
      material(
        scene,
        102,
        'Pink cloud',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.22, y: 0.2 },
            radiusX: 0.42,
            radiusY: 0.34,
          }),
        },
        0.7,
        0.72,
        0.42,
      ),
    ),
    group(
      103,
      'Light veil',
      material(
        scene,
        103,
        'Light veil',
        2,
        'texture',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.45, y: 0.4 },
            radiusX: 0.58,
            radiusY: 0.25,
          }),
        },
        0.4,
        0.84,
        0.08,
        { kind: 'grain', amount: 0.05, scale: 0.35, seed: 103 },
      ),
    ),
  ];
  return scene;
}

function auroraWave(): SceneV03 {
  const scene = baseScene('#15315D', ['#5B8CFF', '#22AA88', '#A987FF', '#B9D8FF']);
  scene.rootGroups = [
    group(
      111,
      'Blue field',
      material(
        scene,
        111,
        'Blue field',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.42, y: 0.7 },
            radiusX: 0.62,
            radiusY: 0.42,
          }),
        },
        0.62,
        0.72,
        0.26,
      ),
    ),
    group(
      112,
      'Mint wave',
      material(
        scene,
        112,
        'Mint wave',
        1,
        'texture',
        {
          kind: 'boundary',
          boundary: createRibbonBoundary({
            center: { x: 0.55, y: 0.43 },
            width: 1,
            height: 0.23,
            taper: 0.3,
            rotationDeg: -24,
          }),
        },
        0.62,
        0.58,
        0.14,
        { kind: 'grain', amount: 0.06, scale: 0.42, seed: 112 },
      ),
    ),
    group(
      113,
      'Violet flare',
      material(
        scene,
        113,
        'Violet flare',
        2,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.78, y: 0.18 },
            radiusX: 0.3,
            radiusY: 0.26,
          }),
        },
        0.7,
        0.6,
        0.38,
      ),
    ),
  ];
  return scene;
}

function satinOrb(): SceneV03 {
  const scene = baseScene('#352B68', ['#F3B35C', '#EFA8DE', '#B9C8FF', '#6D65B7']);
  scene.rootGroups = [
    group(
      121,
      'Orb shadow',
      material(
        scene,
        121,
        'Orb shadow',
        3,
        'shade',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.62, y: 0.61 },
            radiusX: 0.31,
            radiusY: 0.31,
          }),
        },
        0.64,
        0.54,
        0,
      ),
    ),
    group(
      122,
      'Golden orb',
      material(
        scene,
        122,
        'Golden orb',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.51, y: 0.45 },
            radiusX: 0.3,
            radiusY: 0.3,
          }),
        },
        0.82,
        0.4,
        0.52,
      ),
    ),
    group(
      123,
      'Satin highlight',
      material(
        scene,
        123,
        'Satin highlight',
        2,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.39, y: 0.29 },
            radiusX: 0.17,
            radiusY: 0.1,
          }),
        },
        0.8,
        0.4,
        0.38,
      ),
    ),
  ];
  return scene;
}

function sunsetPaper(): SceneV03 {
  const scene = baseScene('#7B405A', ['#FF9B78', '#FFD08A', '#E5B4F3', '#B8648B']);
  scene.rootGroups = [
    group(
      131,
      'Coral wash',
      material(
        scene,
        131,
        'Coral wash',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.68, y: 0.32 },
            radiusX: 0.58,
            radiusY: 0.52,
          }),
        },
        0.64,
        0.76,
        0.3,
      ),
    ),
    group(
      132,
      'Sunlit paper',
      material(
        scene,
        132,
        'Sunlit paper',
        1,
        'texture',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.35, y: 0.72 },
            radiusX: 0.6,
            radiusY: 0.35,
          }),
        },
        0.5,
        0.72,
        0.12,
        { kind: 'paper', amount: 0.12, scale: 0.5, seed: 132 },
      ),
    ),
    group(
      133,
      'Lilac bloom',
      material(
        scene,
        133,
        'Lilac bloom',
        2,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.23, y: 0.18 },
            radiusX: 0.32,
            radiusY: 0.25,
          }),
        },
        0.58,
        0.54,
        0.22,
      ),
    ),
  ];
  return scene;
}

function seaGlass(): SceneV03 {
  const scene = baseScene('#17606C', ['#6FE0D7', '#C6F4E9', '#78A9FF', '#3D9EAA']);
  scene.rootGroups = [
    group(
      141,
      'Aqua field',
      material(
        scene,
        141,
        'Aqua field',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.46, y: 0.57 },
            radiusX: 0.63,
            radiusY: 0.53,
          }),
        },
        0.62,
        0.76,
        0.28,
      ),
    ),
    group(
      142,
      'Glass highlight',
      material(
        scene,
        142,
        'Glass highlight',
        1,
        'glow',
        {
          kind: 'boundary',
          boundary: createEllipseBoundary({
            center: { x: 0.68, y: 0.2 },
            radiusX: 0.35,
            radiusY: 0.19,
          }),
        },
        0.68,
        0.54,
        0.36,
      ),
    ),
    group(
      143,
      'Blue edge',
      material(
        scene,
        143,
        'Blue edge',
        2,
        'texture',
        {
          kind: 'boundary',
          boundary: createRibbonBoundary({
            center: { x: 0.1, y: 0.62 },
            width: 0.94,
            height: 0.16,
            taper: 0.25,
            rotationDeg: 74,
          }),
        },
        0.38,
        0.52,
        0.08,
      ),
    ),
  ];
  return scene;
}

function violetRibbons(): SceneV03 {
  const scene = baseScene('#2A2457', ['#9D6CFF', '#F5A7D8', '#8FC6FF', '#51458E']);
  scene.rootGroups = [
    group(
      151,
      'Blue ribbon',
      material(
        scene,
        151,
        'Blue ribbon',
        2,
        'texture',
        {
          kind: 'boundary',
          boundary: createRibbonBoundary({
            center: { x: 0.5, y: 0.7 },
            width: 1,
            height: 0.22,
            taper: 0.2,
            rotationDeg: -16,
          }),
        },
        0.58,
        0.48,
        0.12,
      ),
    ),
    group(
      152,
      'Violet ribbon',
      material(
        scene,
        152,
        'Violet ribbon',
        0,
        'glow',
        {
          kind: 'boundary',
          boundary: createRibbonBoundary({
            center: { x: 0.54, y: 0.44 },
            width: 1.0,
            height: 0.19,
            taper: 0.35,
            rotationDeg: 18,
          }),
        },
        0.66,
        0.56,
        0.28,
      ),
    ),
    group(
      153,
      'Pink ribbon',
      material(
        scene,
        153,
        'Pink ribbon',
        1,
        'glow',
        {
          kind: 'boundary',
          boundary: createRibbonBoundary({
            center: { x: 0.48, y: 0.3 },
            width: 0.92,
            height: 0.14,
            taper: 0.2,
            rotationDeg: -7,
          }),
        },
        0.6,
        0.46,
        0.22,
      ),
    ),
  ];
  return scene;
}

/** Creates a detached scene, never a shared mutable starter definition. */
export function createSceneStarter(id: SceneStarterId): SceneV03 {
  switch (id) {
    case 'blank':
      return createBlankSceneV03();
    case 'cloud-drift':
      return cloudDrift();
    case 'aurora-wave':
      return auroraWave();
    case 'satin-orb':
      return satinOrb();
    case 'sunset-paper':
      return sunsetPaper();
    case 'sea-glass':
      return seaGlass();
    case 'violet-ribbons':
      return violetRibbons();
  }
}
