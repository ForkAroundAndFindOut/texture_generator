import { describe, expect, it } from 'vitest';

import { createBlankSceneV03, type SceneV03 } from '../../../src/domain/index.js';
import { compileSceneRenderIR, transformSceneRenderPoint } from '../../../src/renderers/index.js';

const stableId = (prefix: 'grp' | 'mat', index: number): string =>
  prefix + '_' + String(index).padStart(26, '0');

function sceneFixture(): SceneV03 {
  const scene = createBlankSceneV03();
  scene.rootGroups = [
    {
      kind: 'group',
      id: stableId('grp', 1),
      name: 'Back',
      visible: true,
      transform: {
        translation: { x: 0.5, y: 0.5 },
        uniformScale: 1,
        rotationDeg: 0,
      },
      children: [
        {
          kind: 'material',
          id: stableId('mat', 1),
          name: 'Blue base',
          visible: true,
          geometry: {
            kind: 'boundary',
            boundary: {
              vertices: [
                { x: 0.2, y: 0.2 },
                { x: 0.8, y: 0.2 },
                { x: 0.5, y: 0.8 },
              ],
            },
          },
          fill: { kind: 'palette', paletteId: scene.palette[0]!.id },
          opacity: 0.8,
          edgeFeather: 0.1,
          bloom: 0.2,
          interaction: 'paint',
        },
      ],
    },
    {
      kind: 'group',
      id: stableId('grp', 2),
      name: 'Front',
      visible: true,
      transform: {
        translation: { x: 0.6, y: 0.4 },
        uniformScale: 0.5,
        rotationDeg: 0,
      },
      children: [
        {
          kind: 'group',
          id: stableId('grp', 3),
          name: 'Nested',
          visible: true,
          transform: {
            translation: { x: 0.5, y: 0.5 },
            uniformScale: 1,
            rotationDeg: 0,
          },
          children: [
            {
              kind: 'material',
              id: stableId('mat', 2),
              name: 'White light',
              visible: true,
              geometry: {
                kind: 'boundary',
                boundary: {
                  vertices: [
                    { x: 0.2, y: 0.2 },
                    { x: 0.8, y: 0.2 },
                    { x: 0.5, y: 0.8 },
                  ],
                },
              },
              fill: { kind: 'local', color: '#FFFFFF' },
              opacity: 0.6,
              edgeFeather: 0.15,
              bloom: 0.3,
              interaction: 'keep-base-hue',
            },
          ],
        },
        {
          kind: 'material',
          id: stableId('mat', 3),
          name: 'Color texture',
          visible: true,
          geometry: {
            kind: 'boundary',
            boundary: {
              vertices: [
                { x: 0.15, y: 0.3 },
                { x: 0.85, y: 0.3 },
                { x: 0.5, y: 0.7 },
              ],
            },
          },
          fill: { kind: 'palette', paletteId: scene.palette[1]!.id },
          opacity: 0.5,
          edgeFeather: 0.2,
          bloom: 0,
          interaction: 'colorize',
        },
      ],
    },
  ];
  return scene;
}

describe('v0.3 scene RenderIR compiler', () => {
  it('preserves nested group hierarchy and back-to-front material order', () => {
    const ir = compileSceneRenderIR(sceneFixture());

    expect(ir.rootGroups).toHaveLength(2);
    expect(ir.rootGroups[1]!.children[0]!.kind).toBe('group');
    expect(ir.materials.map((material) => material.id)).toEqual([
      stableId('mat', 1),
      stableId('mat', 2),
      stableId('mat', 3),
    ]);
    expect(ir.materials.map((material) => material.blendMode)).toEqual([
      'normal',
      'luminosity',
      'color',
    ]);
    expect(ir.materials[1]!.color).toBe('#FFFFFF');
    expect(ir.materials[2]!.groupIds).toEqual([stableId('grp', 2)]);
  });

  it('changes only the artboard viewport when rendering a different ratio profile', () => {
    const scene = sceneFixture();
    const square = compileSceneRenderIR(scene, {
      kind: 'scene-render-profile',
      ratio: '1:1',
      fitMode: 'fit',
    });
    const wide = compileSceneRenderIR(scene, {
      kind: 'scene-render-profile',
      ratio: '21:9',
      fitMode: 'cover',
    });

    expect(square.materials.map((material) => material.path.matrix)).toEqual(
      wide.materials.map((material) => material.path.matrix),
    );
    expect(square.artboard.viewBox).toEqual({ minX: 0, minY: 0, width: 900, height: 900 });
    expect(wide.artboard.viewBox).toEqual({ minX: -600, minY: 0, width: 2100, height: 900 });
    expect(wide.artboard.preserveAspectRatio).toBe('xMidYMid slice');
    expect(scene.artboard).toEqual({ ratio: '16:9', fitMode: 'cover' });
  });

  it('composes group transforms around each local Boundary center without changing child order', () => {
    const scene = sceneFixture();
    const nested = scene.rootGroups[1]!.children[0];
    if (nested?.kind !== 'group') throw new Error('Fixture requires a nested group.');
    nested.transform = {
      translation: { x: 0.6, y: 0.5 },
      uniformScale: 0.5,
      rotationDeg: 0,
    };
    const ir = compileSceneRenderIR(scene);
    const transformed = ir.materials[1]!;
    const center = transformSceneRenderPoint(transformed.path.matrix, { x: 0.5, y: 0.5 });

    expect(center).toEqual({ x: 585, y: 360 });
    expect(transformed.path.matrix.a).toBe(225);
    expect(transformed.path.matrix.d).toBe(225);
    expect(ir.materials[1]!.id).toBe(stableId('mat', 2));
  });
});
