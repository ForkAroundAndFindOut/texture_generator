import { describe, expect, it } from 'vitest';

import {
  canonicalSceneV03String,
  createBlankSceneV03,
  sceneV03IdFromBytes,
  validateSceneV03,
  type SceneV03,
  type SceneV03IdKind,
} from '../../../src/domain';
import {
  createSceneV03ExportBundle,
  SCENE_V03_EXPORT_FILENAMES,
  SCENE_V03_EXPORT_MIME_TYPES,
} from '../../../src/export';

describe('v0.3 portable scene exports', () => {
  it('builds canonical JSON plus responsive SVG and CSS from the same scene', () => {
    const scene = createBlankSceneV03();
    scene.artboard = { ratio: '21:9', fitMode: 'cover' };
    const bundle = createSceneV03ExportBundle(scene);

    expect(bundle.sceneJson.endsWith('\n')).toBe(true);
    expect(JSON.parse(bundle.sceneJson)).toMatchObject({
      schemaVersion: '0.3.1',
      artboard: { ratio: '21:9' },
    });
    expect(bundle.svg).toContain('<svg');
    expect(bundle.svg).toContain('viewBox="-600 0 2100 900"');
    expect(bundle.svg).toContain('data-scene-render-ir-version="scene-render-ir-v0.3"');
    expect(bundle.css).toContain('aspect-ratio: 2100 / 900;');
    expect(bundle.css).toContain('background-image: url("data:image/svg+xml,');
  });

  it('round-trips a representative nested scene exactly after validation', () => {
    const stableId = (kind: SceneV03IdKind, slot: number): string => {
      const bytes = new Uint8Array(16);
      new DataView(bytes.buffer).setUint32(12, slot, false);
      return sceneV03IdFromBytes(kind, bytes);
    };
    const scene = createBlankSceneV03();
    const blue = scene.palette[0];
    if (blue === undefined) throw new Error('Blank scene palette is unexpectedly empty.');
    scene.rootGroups = [
      {
        kind: 'group',
        id: stableId('group', 501),
        name: 'Editorial frame',
        visible: true,
        transform: {
          translation: { x: 0.43, y: 0.58 },
          scale: { x: 0.83, y: 0.83 },
          rotationDeg: -12.5,
        },
        children: [
          {
            kind: 'group',
            id: stableId('group', 502),
            name: 'Nested color field',
            visible: true,
            transform: {
              translation: { x: 0.5, y: 0.5 },
              scale: { x: 1.1, y: 1.1 },
              rotationDeg: 8,
            },
            children: [
              {
                kind: 'material',
                id: stableId('material', 501),
                name: 'Grained blue wedge',
                visible: true,
                geometry: {
                  kind: 'boundary',
                  boundary: {
                    vertices: [
                      { x: 0.12, y: 0.2 },
                      { x: 0.84, y: 0.28 },
                      { x: 0.66, y: 0.78 },
                      { x: 0.24, y: 0.7 },
                    ],
                  },
                },
                fill: { kind: 'palette', paletteId: blue.id },
                opacity: 0.72,
                edgeFeather: 0.24,
                bloom: 0.18,
                interaction: 'texture',
                grain: { kind: 'paper', amount: 0.15, scale: 0.42, seed: 501 },
              },
            ],
          },
        ],
      },
    ];

    const bundle = createSceneV03ExportBundle(scene);
    const parsed: unknown = JSON.parse(bundle.sceneJson);
    expect(validateSceneV03(parsed)).toEqual({ ok: true });
    expect(canonicalSceneV03String(parsed as SceneV03)).toBe(canonicalSceneV03String(scene));
  });

  it('labels downloads with portable source types rather than raster assets', () => {
    expect(SCENE_V03_EXPORT_FILENAMES).toEqual({
      sceneJson: 'texture-lab-v0.3.scene.json',
      svg: 'texture-lab-v0.3.svg',
      css: 'texture-lab-v0.3.css',
    });
    expect(SCENE_V03_EXPORT_MIME_TYPES.svg).toContain('image/svg+xml');
    expect(SCENE_V03_EXPORT_MIME_TYPES.css).toContain('text/css');
  });
});
