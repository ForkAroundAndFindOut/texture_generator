import { describe, expect, it } from 'vitest';

import { createBlankSceneV03 } from '../../../src/domain';
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
      schemaVersion: '0.3.0',
      artboard: { ratio: '21:9' },
    });
    expect(bundle.svg).toContain('<svg');
    expect(bundle.svg).toContain('viewBox="-600 0 2100 900"');
    expect(bundle.svg).toContain('data-scene-render-ir-version="scene-render-ir-v0.3"');
    expect(bundle.css).toContain('aspect-ratio: 2100 / 900;');
    expect(bundle.css).toContain('background-image: url("data:image/svg+xml,');
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
