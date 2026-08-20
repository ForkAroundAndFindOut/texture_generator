import { sceneV03IdFromBytes } from './ids';
import { normalizeSceneV03 } from './normalize';
import { SCENE_V03_SCHEMA_VERSION, type SceneV03, type SceneV03IdKind } from './types';

function identityBytes(slot: number): Uint8Array {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return bytes;
}

function fixedId(kind: SceneV03IdKind, slot: number): string {
  return sceneV03IdFromBytes(kind, identityBytes(slot));
}

/** Creates a detached, minimal v0.3 scene with four palette colors and no artwork. */
export function createBlankSceneV03(): SceneV03 {
  return normalizeSceneV03({
    schemaVersion: SCENE_V03_SCHEMA_VERSION,
    id: fixedId('scene', 1),
    artboard: { ratio: '16:9', fitMode: 'cover' },
    background: '#151A2D',
    palette: [
      { id: fixedId('palette', 1), name: 'Aurora blue', color: '#5B8CFF' },
      { id: fixedId('palette', 2), name: 'Violet haze', color: '#9D6CFF' },
      { id: fixedId('palette', 3), name: 'Warm flare', color: '#F3B35C' },
      { id: fixedId('palette', 4), name: 'Mint glow', color: '#22AA88' },
    ],
    rootGroups: [],
  });
}

export const DEFAULT_BLANK_SCENE_V03: Readonly<SceneV03> = createBlankSceneV03();
