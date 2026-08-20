import type { Boundary, ScenePoint } from '../scene/types';

const EPSILON = 1e-9;
const MAX_BOUNDARY_VERTICES = 64;

type JsonRecord = Record<string, unknown>;

export type BoundaryValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type BoundaryValidationResult =
  { ok: true } | { ok: false; issues: BoundaryValidationIssue[] };

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const pointEquals = (left: ScenePoint, right: ScenePoint): boolean =>
  Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;

const orientation = (first: ScenePoint, second: ScenePoint, third: ScenePoint): number =>
  (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);

function onSegment(first: ScenePoint, second: ScenePoint, point: ScenePoint): boolean {
  return (
    point.x >= Math.min(first.x, second.x) - EPSILON &&
    point.x <= Math.max(first.x, second.x) + EPSILON &&
    point.y >= Math.min(first.y, second.y) - EPSILON &&
    point.y <= Math.max(first.y, second.y) + EPSILON
  );
}

function segmentsIntersect(
  firstStart: ScenePoint,
  firstEnd: ScenePoint,
  secondStart: ScenePoint,
  secondEnd: ScenePoint,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  const hasProperCrossing =
    ((firstOrientation > EPSILON && secondOrientation < -EPSILON) ||
      (firstOrientation < -EPSILON && secondOrientation > EPSILON)) &&
    ((thirdOrientation > EPSILON && fourthOrientation < -EPSILON) ||
      (thirdOrientation < -EPSILON && fourthOrientation > EPSILON));
  if (hasProperCrossing) return true;

  return (
    (Math.abs(firstOrientation) <= EPSILON && onSegment(firstStart, firstEnd, secondStart)) ||
    (Math.abs(secondOrientation) <= EPSILON && onSegment(firstStart, firstEnd, secondEnd)) ||
    (Math.abs(thirdOrientation) <= EPSILON && onSegment(secondStart, secondEnd, firstStart)) ||
    (Math.abs(fourthOrientation) <= EPSILON && onSegment(secondStart, secondEnd, firstEnd))
  );
}

function areAdjacentSegments(first: number, second: number, count: number): boolean {
  return first === second || (first + 1) % count === second || (second + 1) % count === first;
}

export function signedBoundaryArea(vertices: readonly ScenePoint[]): number {
  if (vertices.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

/**
 * Validates the shared filled-boundary model. Closure is implicit: the final
 * segment always returns to the first stored vertex, so no duplicate terminal
 * vertex can be introduced.
 */
export function validateBoundary(value: unknown): BoundaryValidationResult {
  const issues: BoundaryValidationIssue[] = [];
  const boundary = asRecord(value);
  if (boundary === null) {
    return {
      ok: false,
      issues: [{ code: 'invalid-boundary', path: '/', message: 'Boundary must be an object.' }],
    };
  }

  for (const key of Object.keys(boundary)) {
    if (key !== 'vertices') {
      issues.push({
        code: 'unknown-boundary-property',
        path: '/' + key,
        message: 'Boundary has an unsupported property.',
      });
    }
  }
  const rawVertices = boundary['vertices'];
  if (!Array.isArray(rawVertices)) {
    return {
      ok: false,
      issues: [
        ...issues,
        {
          code: 'invalid-boundary-vertices',
          path: '/vertices',
          message: 'Boundary vertices must be an array.',
        },
      ],
    };
  }
  if (rawVertices.length < 3 || rawVertices.length > MAX_BOUNDARY_VERTICES) {
    issues.push({
      code: 'invalid-boundary-count',
      path: '/vertices',
      message: 'Boundaries require 3 to 64 vertices.',
    });
  }

  const vertices: ScenePoint[] = [];
  rawVertices.forEach((rawVertex, index) => {
    const path = '/vertices/' + index;
    const vertex = asRecord(rawVertex);
    if (vertex === null) {
      issues.push({
        code: 'invalid-boundary-vertex',
        path,
        message: 'Boundary vertex must be an object.',
      });
      return;
    }
    for (const key of Object.keys(vertex)) {
      if (key !== 'x' && key !== 'y') {
        issues.push({
          code: 'unknown-boundary-vertex-property',
          path: path + '/' + key,
          message: 'Boundary vertex has an unsupported property.',
        });
      }
    }
    const x = vertex['x'];
    const y = vertex['y'];
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      issues.push({
        code: 'invalid-boundary-coordinate',
        path: path + '/x',
        message: 'Boundary x must be finite.',
      });
      return;
    }
    if (typeof y !== 'number' || !Number.isFinite(y)) {
      issues.push({
        code: 'invalid-boundary-coordinate',
        path: path + '/y',
        message: 'Boundary y must be finite.',
      });
      return;
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      issues.push({
        code: 'boundary-coordinate-out-of-range',
        path,
        message: 'Boundary coordinates must stay between 0 and 1.',
      });
      return;
    }
    vertices.push({ x, y });
  });

  if (vertices.length !== rawVertices.length || issues.length > 0) {
    return { ok: false, issues };
  }

  for (let index = 0; index < vertices.length; index += 1) {
    const nextIndex = (index + 1) % vertices.length;
    if (pointEquals(vertices[index]!, vertices[nextIndex]!)) {
      issues.push({
        code: 'repeated-adjacent-vertex',
        path: '/vertices/' + nextIndex,
        message: 'Adjacent Boundary vertices cannot be identical.',
      });
    }
  }
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === vertices.length - 1)) continue;
      if (pointEquals(vertices[first]!, vertices[second]!)) {
        issues.push({
          code: 'repeated-vertex',
          path: '/vertices/' + second,
          message: 'Boundary vertices cannot repeat.',
        });
      }
    }
  }

  if (Math.abs(signedBoundaryArea(vertices)) <= EPSILON) {
    issues.push({
      code: 'degenerate-boundary',
      path: '/vertices',
      message: 'Boundary must enclose nonzero area.',
    });
  }

  for (let first = 0; first < vertices.length; first += 1) {
    const firstEnd = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      if (areAdjacentSegments(first, second, vertices.length)) continue;
      const secondEnd = (second + 1) % vertices.length;
      if (
        segmentsIntersect(
          vertices[first]!,
          vertices[firstEnd]!,
          vertices[second]!,
          vertices[secondEnd]!,
        )
      ) {
        issues.push({
          code: 'self-intersection',
          path: '/vertices/' + second,
          message: 'Boundary segments cannot cross or touch nonadjacent segments.',
        });
      }
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export class BoundaryValidationError extends Error {
  readonly issues: BoundaryValidationIssue[];

  constructor(issues: BoundaryValidationIssue[]) {
    super('Boundary is invalid.');
    this.name = 'BoundaryValidationError';
    this.issues = issues;
  }
}

export function assertValidBoundary(value: unknown): asserts value is Boundary {
  const result = validateBoundary(value);
  if (!result.ok) throw new BoundaryValidationError(result.issues);
}
