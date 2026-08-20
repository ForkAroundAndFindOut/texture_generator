import { assertValidBoundary } from './boundary';
import type { Boundary, ScenePoint } from '../scene/types';

const DEFAULT_CENTER: ScenePoint = { x: 0.5, y: 0.5 };

export const PRIMITIVE_KINDS = [
  'rounded-rectangle',
  'ellipse',
  'triangle',
  'polygon',
  'solid-star',
  'ribbon',
  'blob',
  'cube',
  'sphere',
  'cylinder',
  'cone',
  'pyramid',
  'prism',
] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];
export type SilhouetteKind = Extract<
  PrimitiveKind,
  'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'prism'
>;

export interface EllipseBoundaryOptions {
  center?: ScenePoint;
  radiusX?: number;
  radiusY?: number;
  segments?: number;
}

export interface RoundedRectangleBoundaryOptions {
  center?: ScenePoint;
  width?: number;
  height?: number;
  cornerRadius?: number;
  cornerSegments?: number;
}

export interface PolygonBoundaryOptions {
  center?: ScenePoint;
  radius?: number;
  sides?: number;
  rotationDeg?: number;
}

export interface StarBoundaryOptions {
  center?: ScenePoint;
  outerRadius?: number;
  innerRadius?: number;
  arms?: number;
  rotationDeg?: number;
}

export interface RibbonBoundaryOptions {
  center?: ScenePoint;
  width?: number;
  height?: number;
  taper?: number;
  rotationDeg?: number;
}

export interface BlobBoundaryOptions {
  center?: ScenePoint;
  radius?: number;
  pointCount?: number;
  variance?: number;
  lobes?: number;
  phaseDeg?: number;
}

export interface SilhouetteBoundaryOptions {
  center?: ScenePoint;
  scale?: number;
}

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function resolveCenter(center: ScenePoint | undefined): ScenePoint {
  return center === undefined ? { ...DEFAULT_CENTER } : { x: center.x, y: center.y };
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      name + ' must be an integer from ' + minimum + ' through ' + maximum + '.',
    );
  }
}

function requireFiniteInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(name + ' must be from ' + minimum + ' through ' + maximum + '.');
  }
}

function rotateAround(point: ScenePoint, center: ScenePoint, degrees: number): ScenePoint {
  const radians = degreesToRadians(degrees);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const relativeX = point.x - center.x;
  const relativeY = point.y - center.y;
  return {
    x: center.x + relativeX * cosine - relativeY * sine,
    y: center.y + relativeX * sine + relativeY * cosine,
  };
}

function finalize(vertices: ScenePoint[]): Boundary {
  const boundary: Boundary = { vertices };
  assertValidBoundary(boundary);
  return boundary;
}

function templateBoundary(
  template: readonly ScenePoint[],
  options: SilhouetteBoundaryOptions,
): Boundary {
  const center = resolveCenter(options.center);
  const scale = options.scale ?? 1;
  requireFiniteInRange(scale, 0.05, 2, 'scale');
  return finalize(
    template.map((point) => ({
      x: center.x + (point.x - 0.5) * scale,
      y: center.y + (point.y - 0.5) * scale,
    })),
  );
}

export function createEllipseBoundary(options: EllipseBoundaryOptions = {}): Boundary {
  const center = resolveCenter(options.center);
  const radiusX = options.radiusX ?? 0.34;
  const radiusY = options.radiusY ?? 0.34;
  const segments = options.segments ?? 24;
  requireFiniteInRange(radiusX, 0.001, 0.5, 'radiusX');
  requireFiniteInRange(radiusY, 0.001, 0.5, 'radiusY');
  requireIntegerInRange(segments, 8, 64, 'segments');

  return finalize(
    Array.from({ length: segments }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / segments;
      return {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
      };
    }),
  );
}

export function createCircleBoundary(
  options: Omit<EllipseBoundaryOptions, 'radiusX' | 'radiusY'> & { radius?: number } = {},
): Boundary {
  const radius = options.radius ?? 0.34;
  return createEllipseBoundary({
    ...(options.center === undefined ? {} : { center: options.center }),
    radiusX: radius,
    radiusY: radius,
    ...(options.segments === undefined ? {} : { segments: options.segments }),
  });
}

export function createRoundedRectangleBoundary(
  options: RoundedRectangleBoundaryOptions = {},
): Boundary {
  const center = resolveCenter(options.center);
  const width = options.width ?? 0.64;
  const height = options.height ?? 0.44;
  const cornerRadius = options.cornerRadius ?? 0.09;
  const cornerSegments = options.cornerSegments ?? 4;
  requireFiniteInRange(width, 0.001, 1, 'width');
  requireFiniteInRange(height, 0.001, 1, 'height');
  requireFiniteInRange(cornerRadius, 0, Math.min(width, height) / 2, 'cornerRadius');
  requireIntegerInRange(cornerSegments, 1, 16, 'cornerSegments');

  if (cornerRadius === 0) {
    return finalize([
      { x: center.x - width / 2, y: center.y - height / 2 },
      { x: center.x + width / 2, y: center.y - height / 2 },
      { x: center.x + width / 2, y: center.y + height / 2 },
      { x: center.x - width / 2, y: center.y + height / 2 },
    ]);
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners = [
    {
      x: center.x + halfWidth - cornerRadius,
      y: center.y - halfHeight + cornerRadius,
      start: -90,
    },
    {
      x: center.x + halfWidth - cornerRadius,
      y: center.y + halfHeight - cornerRadius,
      start: 0,
    },
    {
      x: center.x - halfWidth + cornerRadius,
      y: center.y + halfHeight - cornerRadius,
      start: 90,
    },
    {
      x: center.x - halfWidth + cornerRadius,
      y: center.y - halfHeight + cornerRadius,
      start: 180,
    },
  ];
  const vertices: ScenePoint[] = [];
  for (const corner of corners) {
    for (let segment = 0; segment < cornerSegments; segment += 1) {
      const angle = degreesToRadians(corner.start + (90 * segment) / cornerSegments);
      vertices.push({
        x: corner.x + Math.cos(angle) * cornerRadius,
        y: corner.y + Math.sin(angle) * cornerRadius,
      });
    }
  }
  return finalize(vertices);
}

export function createPolygonBoundary(options: PolygonBoundaryOptions = {}): Boundary {
  const center = resolveCenter(options.center);
  const radius = options.radius ?? 0.36;
  const sides = options.sides ?? 6;
  const rotationDeg = options.rotationDeg ?? -90;
  requireFiniteInRange(radius, 0.001, 0.5, 'radius');
  requireIntegerInRange(sides, 3, 32, 'sides');
  requireFiniteInRange(rotationDeg, -360, 360, 'rotationDeg');

  return finalize(
    Array.from({ length: sides }, (_, index) => {
      const angle = degreesToRadians(rotationDeg + (360 * index) / sides);
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    }),
  );
}

export function createTriangleBoundary(
  options: Omit<PolygonBoundaryOptions, 'sides'> = {},
): Boundary {
  return createPolygonBoundary({ ...options, sides: 3 });
}

export function createSolidStarBoundary(options: StarBoundaryOptions = {}): Boundary {
  const center = resolveCenter(options.center);
  const outerRadius = options.outerRadius ?? 0.36;
  const innerRadius = options.innerRadius ?? 0.17;
  const arms = options.arms ?? 5;
  const rotationDeg = options.rotationDeg ?? -90;
  requireFiniteInRange(outerRadius, 0.001, 0.5, 'outerRadius');
  requireFiniteInRange(innerRadius, 0.001, outerRadius - 0.001, 'innerRadius');
  requireIntegerInRange(arms, 3, 16, 'arms');
  requireFiniteInRange(rotationDeg, -360, 360, 'rotationDeg');

  return finalize(
    Array.from({ length: arms * 2 }, (_, index) => {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = degreesToRadians(rotationDeg + (180 * index) / arms);
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    }),
  );
}

export function createRibbonBoundary(options: RibbonBoundaryOptions = {}): Boundary {
  const center = resolveCenter(options.center);
  const width = options.width ?? 0.78;
  const height = options.height ?? 0.16;
  const taper = options.taper ?? 0.2;
  const rotationDeg = options.rotationDeg ?? -12;
  requireFiniteInRange(width, 0.001, 1, 'width');
  requireFiniteInRange(height, 0.001, 1, 'height');
  requireFiniteInRange(taper, 0, 0.8, 'taper');
  requireFiniteInRange(rotationDeg, -360, 360, 'rotationDeg');

  const rightHalfHeight = (height * (1 - taper)) / 2;
  const vertices = [
    { x: center.x - width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y - rightHalfHeight },
    { x: center.x + width / 2, y: center.y + rightHalfHeight },
    { x: center.x - width / 2, y: center.y + height / 2 },
  ].map((point) => rotateAround(point, center, rotationDeg));
  return finalize(vertices);
}

export function createBlobBoundary(options: BlobBoundaryOptions = {}): Boundary {
  const center = resolveCenter(options.center);
  const radius = options.radius ?? 0.32;
  const pointCount = options.pointCount ?? 12;
  const variance = options.variance ?? 0.16;
  const lobes = options.lobes ?? 3;
  const phaseDeg = options.phaseDeg ?? -90;
  requireFiniteInRange(radius, 0.001, 0.5, 'radius');
  requireIntegerInRange(pointCount, 6, 32, 'pointCount');
  requireFiniteInRange(variance, 0, 0.35, 'variance');
  requireIntegerInRange(lobes, 1, 8, 'lobes');
  requireFiniteInRange(phaseDeg, -360, 360, 'phaseDeg');

  return finalize(
    Array.from({ length: pointCount }, (_, index) => {
      const angle = degreesToRadians(phaseDeg + (360 * index) / pointCount);
      const radialScale = 1 + variance * Math.sin(lobes * angle + 0.7);
      return {
        x: center.x + Math.cos(angle) * radius * radialScale,
        y: center.y + Math.sin(angle) * radius * radialScale,
      };
    }),
  );
}

const SILHOUETTE_TEMPLATES: Record<Exclude<SilhouetteKind, 'sphere' | 'cylinder'>, ScenePoint[]> = {
  cube: [
    { x: 0.32, y: 0.14 },
    { x: 0.68, y: 0.14 },
    { x: 0.86, y: 0.32 },
    { x: 0.86, y: 0.68 },
    { x: 0.68, y: 0.86 },
    { x: 0.32, y: 0.86 },
    { x: 0.14, y: 0.68 },
    { x: 0.14, y: 0.32 },
  ],
  cone: [
    { x: 0.5, y: 0.12 },
    { x: 0.86, y: 0.82 },
    { x: 0.14, y: 0.82 },
  ],
  pyramid: [
    { x: 0.5, y: 0.1 },
    { x: 0.84, y: 0.74 },
    { x: 0.5, y: 0.9 },
    { x: 0.16, y: 0.74 },
  ],
  prism: [
    { x: 0.28, y: 0.14 },
    { x: 0.7, y: 0.14 },
    { x: 0.9, y: 0.4 },
    { x: 0.9, y: 0.7 },
    { x: 0.62, y: 0.88 },
    { x: 0.1, y: 0.68 },
    { x: 0.1, y: 0.36 },
  ],
};

export function createSilhouetteBoundary(
  kind: SilhouetteKind,
  options: SilhouetteBoundaryOptions = {},
): Boundary {
  const scale = options.scale ?? 1;
  const centerOption = options.center === undefined ? {} : { center: options.center };
  if (kind === 'sphere') {
    return createEllipseBoundary({
      ...centerOption,
      radiusX: 0.34 * scale,
      radiusY: 0.34 * scale,
      segments: 24,
    });
  }
  if (kind === 'cylinder') {
    return createRoundedRectangleBoundary({
      ...centerOption,
      width: 0.46 * scale,
      height: 0.68 * scale,
      cornerRadius: 0.19 * scale,
      cornerSegments: 4,
    });
  }
  return templateBoundary(SILHOUETTE_TEMPLATES[kind], { ...options, scale });
}

/** Creates the default Boundary for every primary material gesture or geometry item. */
export function createPrimitiveBoundary(kind: PrimitiveKind): Boundary {
  switch (kind) {
    case 'rounded-rectangle':
      return createRoundedRectangleBoundary();
    case 'ellipse':
      return createEllipseBoundary();
    case 'triangle':
      return createTriangleBoundary();
    case 'polygon':
      return createPolygonBoundary();
    case 'solid-star':
      return createSolidStarBoundary();
    case 'ribbon':
      return createRibbonBoundary();
    case 'blob':
      return createBlobBoundary();
    case 'cube':
    case 'sphere':
    case 'cylinder':
    case 'cone':
    case 'pyramid':
    case 'prism':
      return createSilhouetteBoundary(kind);
  }
}
