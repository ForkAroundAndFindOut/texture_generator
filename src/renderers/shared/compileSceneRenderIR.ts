import {
  assertSceneV03,
  type Boundary,
  type GroupTransform,
  type SceneGroup,
  type SceneMaterial,
  type ScenePoint,
  type SceneV03,
} from '../../domain/scene';
import { type MatrixIR, type PathIR, toCanonicalHex } from './ir';
import { quantizeNumber, toNormalizedUnit } from './profile';
import {
  INTERACTION_BLEND_MODE,
  SCENE_RENDER_IR_VERSION,
  type SceneGrainIR,
  type SceneMaterialRenderIR,
  type SceneRenderGroupIR,
  type SceneRenderIR,
  type SceneRenderNodeIR,
} from './sceneIr';
import {
  artboardViewBoxForRatio,
  isSceneRenderProfile,
  preserveAspectRatioForFitMode,
  sceneRenderProfileForArtboard,
  SCENE_WORLD_SIZE,
  type SceneRenderProfile,
} from './sceneProfile';

type RawMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type ResolvedFill =
  | { fillKind: 'local'; color: ReturnType<typeof toCanonicalHex> }
  | { fillKind: 'palette'; color: ReturnType<typeof toCanonicalHex>; paletteId: string };

const WORLD_MATRIX: RawMatrix = {
  a: SCENE_WORLD_SIZE,
  b: 0,
  c: 0,
  d: SCENE_WORLD_SIZE,
  e: 0,
  f: 0,
};

function multiplyMatrices(left: RawMatrix, right: RawMatrix): RawMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function toMatrixIR(value: RawMatrix): MatrixIR {
  return {
    a: quantizeNumber(value.a),
    b: quantizeNumber(value.b),
    c: quantizeNumber(value.c),
    d: quantizeNumber(value.d),
    e: quantizeNumber(value.e),
    f: quantizeNumber(value.f),
  };
}

function groupLocalMatrix(transform: GroupTransform): RawMatrix {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scale = transform.scale;
  const translate: RawMatrix = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: transform.translation.x,
    f: transform.translation.y,
  };
  const rotation: RawMatrix = { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
  const nonUniformScale: RawMatrix = { a: scale.x, b: 0, c: 0, d: scale.y, e: 0, f: 0 };
  const centerOffset: RawMatrix = { a: 1, b: 0, c: 0, d: 1, e: -0.5, f: -0.5 };
  return multiplyMatrices(
    translate,
    multiplyMatrices(rotation, multiplyMatrices(nonUniformScale, centerOffset)),
  );
}

function compileBoundaryPath(boundary: Boundary, materialId: string, matrix: RawMatrix): PathIR {
  const first = boundary.vertices[0];
  if (first === undefined) throw new RangeError('Validated Boundary must contain a first vertex.');
  const commands: PathIR['commands'] = [
    { kind: 'move', x: quantizeNumber(first.x), y: quantizeNumber(first.y) },
    ...boundary.vertices.slice(1).map((vertex) => ({
      kind: 'line' as const,
      x: quantizeNumber(vertex.x),
      y: quantizeNumber(vertex.y),
    })),
    { kind: 'close' },
  ];
  return {
    kind: 'path',
    version: 'path-ir-v1',
    commands,
    matrix: toMatrixIR(matrix),
    sourceComponentId: materialId,
  };
}

function resolveFill(material: SceneMaterial, palette: ReadonlyMap<string, string>): ResolvedFill {
  if (material.fill.kind === 'local') {
    return { fillKind: 'local', color: toCanonicalHex(material.fill.color) };
  }
  const color = palette.get(material.fill.paletteId);
  if (color === undefined) {
    throw new RangeError('Scene material references a palette color that does not exist.');
  }
  return {
    fillKind: 'palette',
    color: toCanonicalHex(color),
    paletteId: material.fill.paletteId,
  };
}

function compileGrain(material: SceneMaterial): SceneGrainIR | undefined {
  if (material.grain === undefined) return undefined;
  return {
    kind: material.grain.kind,
    amount: toNormalizedUnit(material.grain.amount),
    scale: toNormalizedUnit(material.grain.scale),
    seed: material.grain.seed,
  };
}

function compileMaterial(
  material: SceneMaterial,
  matrix: RawMatrix,
  visible: boolean,
  groupIds: readonly string[],
  palette: ReadonlyMap<string, string>,
): SceneMaterialRenderIR {
  const fill = resolveFill(material, palette);
  const grain = compileGrain(material);
  const common = {
    kind: 'material' as const,
    id: material.id,
    name: material.name,
    visible,
    groupIds: [...groupIds],
    path: compileBoundaryPath(material.geometry.boundary, material.id, matrix),
    color: fill.color,
    fillKind: fill.fillKind,
    opacity: toNormalizedUnit(material.opacity),
    edgeFeather: toNormalizedUnit(material.edgeFeather),
    bloom: toNormalizedUnit(material.bloom),
    interaction: material.interaction,
    blendMode: INTERACTION_BLEND_MODE[material.interaction],
    definitionId: 'scene-material-' + material.id,
  };
  if (fill.fillKind === 'palette') {
    return grain === undefined
      ? { ...common, paletteId: fill.paletteId }
      : { ...common, paletteId: fill.paletteId, grain };
  }
  return grain === undefined ? common : { ...common, grain };
}

function compileGroup(
  group: SceneGroup,
  parentMatrix: RawMatrix,
  parentVisible: boolean,
  ancestorIds: readonly string[],
  palette: ReadonlyMap<string, string>,
  materials: SceneMaterialRenderIR[],
): SceneRenderGroupIR {
  const matrix = multiplyMatrices(parentMatrix, groupLocalMatrix(group.transform));
  const visible = parentVisible && group.visible;
  const groupIds = [...ancestorIds, group.id];
  const children: SceneRenderNodeIR[] = group.children.map((child) => {
    if (child.kind === 'group') {
      return compileGroup(child, matrix, visible, groupIds, palette, materials);
    }
    const compiled = compileMaterial(child, matrix, visible && child.visible, groupIds, palette);
    materials.push(compiled);
    return compiled;
  });
  return {
    kind: 'group',
    id: group.id,
    name: group.name,
    visible,
    matrix: toMatrixIR(matrix),
    children,
  };
}

/** Apply an immutable render matrix to one normalized Boundary-space point. */
export function transformSceneRenderPoint(matrix: MatrixIR, point: ScenePoint): ScenePoint {
  return {
    x: quantizeNumber(matrix.a * point.x + matrix.c * point.y + matrix.e),
    y: quantizeNumber(matrix.b * point.x + matrix.d * point.y + matrix.f),
  };
}

/**
 * Compile validated v0.3 source data once. The profile changes only the
 * artboard viewBox and Fit/Cover metadata; canonical geometry stays intact.
 */
export function compileSceneRenderIR(
  scene: SceneV03,
  profile: SceneRenderProfile = sceneRenderProfileForArtboard(scene.artboard),
): SceneRenderIR {
  assertSceneV03(scene);
  if (!isSceneRenderProfile(profile)) {
    throw new TypeError('Scene render profile is invalid.');
  }

  const palette = new Map(scene.palette.map((entry) => [entry.id, entry.color] as const));
  const materials: SceneMaterialRenderIR[] = [];
  const rootGroups = scene.rootGroups.map((group) =>
    compileGroup(group, WORLD_MATRIX, true, [], palette, materials),
  );

  return {
    kind: 'scene-render-ir',
    version: SCENE_RENDER_IR_VERSION,
    sceneId: scene.id,
    artboard: {
      profile: { kind: 'scene-render-profile', ratio: profile.ratio, fitMode: profile.fitMode },
      viewBox: artboardViewBoxForRatio(profile.ratio),
      preserveAspectRatio: preserveAspectRatioForFitMode(profile.fitMode),
    },
    background: toCanonicalHex(scene.background),
    rootGroups,
    materials,
  };
}
