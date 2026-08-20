import { describe, expect, it } from 'vitest';

import { canonicalSceneV03String, createBlankSceneV03 } from '../../../src/domain';
import {
  readStoredSceneV03,
  sceneV03Hash,
  SCENE_V03_CACHE_FORMAT,
  SCENE_V03_LATEST_STORAGE_KEY,
  writeStoredSceneV03,
  type SceneStoragePort,
} from '../../../src/editor';

class MemoryStorage implements SceneStoragePort {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('v0.3 local scene persistence', () => {
  it('round-trips a normalized valid scene with an explicit scene checksum', () => {
    const storage = new MemoryStorage();
    const scene = createBlankSceneV03();
    scene.background = '#aabbcc';

    const written = writeStoredSceneV03(storage, scene);
    expect(written).toMatchObject({ kind: 'written', key: SCENE_V03_LATEST_STORAGE_KEY });
    const raw = storage.getItem(SCENE_V03_LATEST_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      cacheFormat: SCENE_V03_CACHE_FORMAT,
      sceneHash: sceneV03Hash(scene),
    });

    const restored = readStoredSceneV03(storage);
    expect(restored.kind).toBe('loaded');
    if (restored.kind !== 'loaded') return;
    expect(restored.sceneHash).toBe(sceneV03Hash(scene));
    expect(canonicalSceneV03String(restored.scene)).toBe(
      canonicalSceneV03String({ ...scene, background: '#AABBCC' }),
    );
  });

  it('refuses a checksum-mismatched or malformed stored scene', () => {
    const storage = new MemoryStorage();
    const scene = createBlankSceneV03();
    const written = writeStoredSceneV03(storage, scene);
    expect(written.kind).toBe('written');
    const envelope = JSON.parse(storage.getItem(SCENE_V03_LATEST_STORAGE_KEY) ?? '{}') as {
      scene: { background: string };
    };
    envelope.scene.background = '#FFFFFF';
    storage.setItem(SCENE_V03_LATEST_STORAGE_KEY, JSON.stringify(envelope));

    const mismatched = readStoredSceneV03(storage);
    expect(mismatched).toMatchObject({ kind: 'rejected', diagnostic: { code: 'cache-corrupt' } });

    storage.setItem(SCENE_V03_LATEST_STORAGE_KEY, '{broken');
    const malformed = readStoredSceneV03(storage);
    expect(malformed).toMatchObject({ kind: 'rejected', diagnostic: { code: 'cache-corrupt' } });
  });
});
