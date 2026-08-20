import { describe, expect, test } from 'vitest';

import { createDefaultRecipe } from '../../../src/domain';
import { compileRenderIR, type RenderProfile } from '../../../src/renderers';
import {
  canvasBoundsForPath,
  invertCanvasPoint,
  transformCanvasPoint,
} from '../../../src/app/components/canvasGeometry';

const profile: RenderProfile = {
  kind: 'render-profile',
  usage: 'component',
  width: 720,
  height: 480,
  fit: 'contain',
  inspectTiles: false,
  targetShape: 'landscape',
};

describe('canvas authoring geometry', () => {
  test('derives usable canvas-space bounds from normalized component geometry', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    const field = ir.layers.find((layer) => layer.kind === 'field');
    if (field?.kind !== 'field') throw new Error('default RenderIR has no Field');

    const bounds = canvasBoundsForPath(field.path);
    expect(bounds).toBeDefined();
    expect(bounds!.width).toBeGreaterThan(500);
    expect(bounds!.height).toBeGreaterThan(250);
    expect(bounds!.center.x).toBeGreaterThan(0);
    expect(bounds!.center.x).toBeLessThan(ir.canvas.width);
  });

  test('round-trips a canvas pointer through the selected component matrix', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    const band = ir.layers.find((layer) => layer.kind === 'band');
    if (band?.kind !== 'band') throw new Error('default RenderIR has no Band');

    const local = { x: 0.31, y: 0.67 };
    const canvas = transformCanvasPoint(band.path.matrix, local);
    const recovered = invertCanvasPoint(band.path.matrix, canvas);

    expect(recovered?.x).toBeCloseTo(local.x, 8);
    expect(recovered?.y).toBeCloseTo(local.y, 8);
  });
});
