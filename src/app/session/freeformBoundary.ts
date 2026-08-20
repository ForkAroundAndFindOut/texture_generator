import {
  validateBoundary,
  type Boundary,
  type GroupTransform,
  type SceneMaterial,
  type ScenePoint,
  type SceneV03,
} from '../../domain';
import { artboardViewBoxForRatio, SCENE_WORLD_SIZE } from '../../renderers';

export const FREEFORM_MIN_POINTS = 3;
export const FREEFORM_MAX_POINTS = 64;
export const FREEFORM_CLOSE_RADIUS = 0.045;

const EPSILON = 1e-9;
const TEMPLATE_MATERIAL_ID = 'mat_00000000000000000000000000';

export type FreeformPathCheck =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

export type FreeformLayerTemplate = Readonly<{
  readonly material: SceneMaterial;
  readonly transform: GroupTransform;
}>;

function equals(left: ScenePoint, right: ScenePoint): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;
}

function orientation(first: ScenePoint, second: ScenePoint, third: ScenePoint): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function liesOnSegment(first: ScenePoint, second: ScenePoint, point: ScenePoint): boolean {
  return (
    point.x >= Math.min(first.x, second.x) - EPSILON &&
    point.x <= Math.max(first.x, second.x) + EPSILON &&
    point.y >= Math.min(first.y, second.y) - EPSILON &&
    point.y <= Math.max(first.y, second.y) + EPSILON
  );
}

/** Treats touching an older segment as a collision so a draft always remains one simple body. */
function segmentsMeet(
  firstStart: ScenePoint,
  firstEnd: ScenePoint,
  secondStart: ScenePoint,
  secondEnd: ScenePoint,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  const crosses =
    ((firstOrientation > EPSILON && secondOrientation < -EPSILON) ||
      (firstOrientation < -EPSILON && secondOrientation > EPSILON)) &&
    ((thirdOrientation > EPSILON && fourthOrientation < -EPSILON) ||
      (thirdOrientation < -EPSILON && fourthOrientation > EPSILON));
  if (crosses) return true;
  return (
    (Math.abs(firstOrientation) <= EPSILON && liesOnSegment(firstStart, firstEnd, secondStart)) ||
    (Math.abs(secondOrientation) <= EPSILON && liesOnSegment(firstStart, firstEnd, secondEnd)) ||
    (Math.abs(thirdOrientation) <= EPSILON && liesOnSegment(secondStart, secondEnd, firstStart)) ||
    (Math.abs(fourthOrientation) <= EPSILON && liesOnSegment(secondStart, secondEnd, firstEnd))
  );
}

export function isNormalizedFreeformPoint(point: ScenePoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

export function isNearFreeformStart(points: readonly ScenePoint[], point: ScenePoint): boolean {
  const first = points[0];
  if (first === undefined || points.length < FREEFORM_MIN_POINTS) return false;
  return Math.hypot(first.x - point.x, first.y - point.y) <= FREEFORM_CLOSE_RADIUS;
}

/** Returns a friendly rejection before a self-crossing segment is ever added to the visible draft. */
export function checkFreeformAppend(
  points: readonly ScenePoint[],
  point: ScenePoint,
): FreeformPathCheck {
  if (!isNormalizedFreeformPoint(point)) {
    return { ok: false, message: 'Points must stay inside the artboard.' };
  }
  if (points.length >= FREEFORM_MAX_POINTS) {
    return {
      ok: false,
      message: 'This Boundary already has 64 points. Click the first point to close it.',
    };
  }
  if (points.some((existing) => equals(existing, point))) {
    return {
      ok: false,
      message:
        'That point repeats a corner. Click near the first point when you are ready to close.',
    };
  }
  const last = points.at(-1);
  if (last === undefined) return { ok: true };
  for (let index = 0; index < points.length - 2; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    if (
      segmentStart !== undefined &&
      segmentEnd !== undefined &&
      segmentsMeet(last, point, segmentStart, segmentEnd)
    ) {
      return {
        ok: false,
        message: 'That segment would cross or touch the existing Boundary. Choose another point.',
      };
    }
  }
  return { ok: true };
}

/** Checks the implicit last-to-first segment, which completes a simple filled Boundary. */
export function checkFreeformClosure(points: readonly ScenePoint[]): FreeformPathCheck {
  if (points.length < FREEFORM_MIN_POINTS) {
    return { ok: false, message: 'Place at least three points before closing the Boundary.' };
  }
  const validation = validateBoundary({ vertices: points.map((point) => ({ ...point })) });
  if (!validation.ok) {
    return {
      ok: false,
      message:
        'Closing there would cross or flatten the Boundary. Move the last point or keep drawing.',
    };
  }
  return { ok: true };
}

function worldPointForArtboardPoint(scene: SceneV03, point: ScenePoint): ScenePoint {
  const viewBox = artboardViewBoxForRatio(scene.artboard.ratio);
  return {
    x: (viewBox.minX + point.x * viewBox.width) / SCENE_WORLD_SIZE,
    y: (viewBox.minY + point.y * viewBox.height) / SCENE_WORLD_SIZE,
  };
}

function localBoundaryForWorldPoints(points: readonly ScenePoint[]): {
  readonly boundary: Boundary;
  readonly transform: GroupTransform;
} {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const scale = Math.max(maxX - minX, maxY - minY, 0.05);
  return {
    boundary: {
      vertices: points.map((point) => ({
        x: 0.5 + (point.x - center.x) / scale,
        y: 0.5 + (point.y - center.y) / scale,
      })),
    },
    transform: { translation: center, uniformScale: scale, rotationDeg: 0 },
  };
}

/** Converts a closed, artboard-relative draft into a single portable Boundary material and transform. */
export function createFreeformLayerTemplate(
  scene: SceneV03,
  artboardPoints: readonly ScenePoint[],
): FreeformLayerTemplate {
  const closure = checkFreeformClosure(artboardPoints);
  if (!closure.ok) throw new RangeError(closure.message);
  const palette = scene.palette[scene.rootGroups.length % scene.palette.length];
  if (palette === undefined) throw new RangeError('A v0.3 scene requires a palette color.');
  const worldPoints = artboardPoints.map((point) => worldPointForArtboardPoint(scene, point));
  const { boundary, transform } = localBoundaryForWorldPoints(worldPoints);
  const material: SceneMaterial = {
    kind: 'material',
    id: TEMPLATE_MATERIAL_ID,
    name: 'Freeform Boundary ' + (scene.rootGroups.length + 1),
    visible: true,
    geometry: { kind: 'boundary', boundary },
    fill: { kind: 'palette', paletteId: palette.id },
    opacity: 0.78,
    edgeFeather: 0.18,
    bloom: 0.08,
    interaction: 'paint',
  };
  return { material, transform };
}
