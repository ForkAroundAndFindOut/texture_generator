import { describe, expect, it } from 'vitest';

import {
  compileSceneRenderIR,
  serializeSceneCss,
  serializeSceneSvg,
} from '../../../src/renderers/index.js';
import { createBlankSceneV03, type SceneV03 } from '../../../src/domain/index.js';

const stableId = (prefix: 'grp' | 'mat', index: number): string =>
  prefix + '_' + String(index).padStart(26, '0');

function sceneFixture(): SceneV03 {
  const scene = createBlankSceneV03();
  scene.background = '#228B22';
  scene.rootGroups = [
    {
      kind: 'group',
      id: stableId('grp', 1),
      name: 'Red material',
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
          name: 'Red texture',
          visible: true,
          geometry: {
            kind: 'boundary',
            boundary: {
              vertices: [
                { x: 0.2, y: 0.2 },
                { x: 0.8, y: 0.2 },
                { x: 0.8, y: 0.8 },
                { x: 0.2, y: 0.8 },
              ],
            },
          },
          fill: { kind: 'local', color: '#FF0000' },
          opacity: 0.65,
          edgeFeather: 0.35,
          bloom: 0.4,
          interaction: 'keep-base-hue',
          grain: { kind: 'film', amount: 0.12, scale: 0.6, seed: 42 },
        },
      ],
    },
  ];
  return scene;
}

describe('v0.3 scene material serializers', () => {
  it('serializes solid interiors plus independent feather, bloom, grain, and Interaction', () => {
    const ir = compileSceneRenderIR(sceneFixture());
    const svg = serializeSceneSvg(ir);

    expect(svg).toContain('data-material-feather="true"');
    expect(svg).toContain('data-material-bloom="true"');
    expect(svg).toContain('<feTurbulence');
    expect(svg).toContain('in="SourceGraphic" in2="grain-alpha" mode="soft-light"');
    expect(svg).toContain('mix-blend-mode:luminosity');
    expect(svg).toContain('fill="#FF0000"');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('data:image');
  });

  it('serializes a responsive CSS host with the same self-contained SVG source', () => {
    const ir = compileSceneRenderIR(sceneFixture());
    const svg = serializeSceneSvg(ir);
    const css = serializeSceneCss(ir, svg);
    const encoded = /data:image\/svg\+xml,([^"\n]+)/u.exec(css)?.[1];

    expect(css).toContain('aspect-ratio: 1600 / 900');
    expect(css).toContain('background-size: cover');
    expect(encoded).toBeDefined();
    expect(decodeURIComponent(encoded!)).toBe(svg);
  });
});
