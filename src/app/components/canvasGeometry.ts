import type { MatrixIR, PathIR } from '../../renderers';

export type CanvasPoint = Readonly<{ x: number; y: number }>;
export type CanvasBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  center: CanvasPoint;
}>;

export const transformCanvasPoint = (matrix: MatrixIR, point: CanvasPoint): CanvasPoint => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

/** Convert a canvas-space pointer into a component's normalized local space. */
export function invertCanvasPoint(matrix: MatrixIR, point: CanvasPoint): CanvasPoint | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return undefined;
  const translatedX = point.x - matrix.e;
  const translatedY = point.y - matrix.f;
  return {
    x: (matrix.d * translatedX - matrix.c * translatedY) / determinant,
    y: (-matrix.b * translatedX + matrix.a * translatedY) / determinant,
  };
}

const commandPoints = (path: PathIR): CanvasPoint[] =>
  path.commands.flatMap((command): CanvasPoint[] => {
    switch (command.kind) {
      case 'move':
      case 'line':
        return [{ x: command.x, y: command.y }];
      case 'cubic':
        // A cubic curve remains inside the convex hull of its controls, so
        // this is a safe and useful authoring bound even when not minimal.
        return [
          { x: command.c1x, y: command.c1y },
          { x: command.c2x, y: command.c2y },
          { x: command.x, y: command.y },
        ];
      case 'close':
        return [];
    }
  });

/** Compute a stable canvas-space authoring bound for a rendered component. */
export function canvasBoundsForPath(
  path: PathIR,
  clip?: Readonly<{ width: number; height: number }>,
): CanvasBounds | undefined {
  const points = commandPoints(path).map((point) => transformCanvasPoint(path.matrix, point));
  if (points.length === 0) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const rawLeft = Math.min(...xs);
  const rawRight = Math.max(...xs);
  const rawTop = Math.min(...ys);
  const rawBottom = Math.max(...ys);
  const left = clip === undefined ? rawLeft : Math.max(0, Math.min(clip.width, rawLeft));
  const right = clip === undefined ? rawRight : Math.max(0, Math.min(clip.width, rawRight));
  const top = clip === undefined ? rawTop : Math.max(0, Math.min(clip.height, rawTop));
  const bottom = clip === undefined ? rawBottom : Math.max(0, Math.min(clip.height, rawBottom));
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
  };
}
