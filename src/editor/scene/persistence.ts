/** Browser-storage-independent persistence for valid v0.3 scene documents. */

import {
  canonicalSceneV03Bytes,
  isSceneV03,
  normalizeSceneV03,
  SCENE_V03_SCHEMA_VERSION,
  validateSceneV03,
  type SceneV03,
} from '../../domain';
import type {
  CachePort,
  CacheWriteResult,
  PersistenceDiagnostic,
} from '../interactions/interactionCoordinator';

export const SCENE_V03_CACHE_FORMAT = 'texture-lab-scene-v0.3/latest' as const;
export const SCENE_V03_LATEST_STORAGE_KEY = 'texture-lab/scene-v0.3/latest';

export interface SceneStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredSceneV03Envelope {
  cacheFormat: typeof SCENE_V03_CACHE_FORMAT;
  sceneSchemaVersion: typeof SCENE_V03_SCHEMA_VERSION;
  sceneHash: string;
  scene: SceneV03;
}

export type StoredSceneV03ReadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'loaded'; readonly scene: SceneV03; readonly sceneHash: string }
  | { readonly kind: 'rejected'; readonly diagnostic: PersistenceDiagnostic };

export type StoredSceneV03WriteResult =
  | { readonly kind: 'written'; readonly key: string; readonly sceneHash: string }
  | { readonly kind: 'failed'; readonly key: string; readonly diagnostic: PersistenceDiagnostic };

const diagnostic = (
  code: PersistenceDiagnostic['code'],
  message: string,
  recovery: string,
  operation: NonNullable<PersistenceDiagnostic['operation']>,
): PersistenceDiagnostic => ({ code, message, recovery, operation });

const cacheReadFailure = (message: string): PersistenceDiagnostic =>
  diagnostic(
    'cache-read-failed',
    message,
    'Continue with the current scene or clear the saved scene before retrying.',
    'read',
  );

const cacheWriteFailure = (message: string): PersistenceDiagnostic =>
  diagnostic(
    'cache-write-failed',
    message,
    'Continue editing, then retry saving or export Scene JSON.',
    'write',
  );

/** Deterministic byte hash used only for change/persistence identity. */
export function sceneV03HashFromCanonicalBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sceneV03Hash(scene: SceneV03): string {
  return sceneV03HashFromCanonicalBytes(canonicalSceneV03Bytes(normalizeSceneV03(scene)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads only a fully valid, checksum-matched saved scene. */
export function readStoredSceneV03(
  storage: SceneStoragePort,
  key = SCENE_V03_LATEST_STORAGE_KEY,
): StoredSceneV03ReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {
      kind: 'rejected',
      diagnostic: cacheReadFailure('Saved scene storage is unavailable.'),
    };
  }
  if (raw === null) return { kind: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      kind: 'rejected',
      diagnostic: diagnostic(
        'cache-corrupt',
        'The saved scene is not valid JSON.',
        'Continue with a new scene or clear the corrupt saved scene.',
        'read',
      ),
    };
  }
  if (!isRecord(parsed) || parsed['cacheFormat'] !== SCENE_V03_CACHE_FORMAT) {
    return {
      kind: 'rejected',
      diagnostic: diagnostic(
        'cache-invalid-envelope',
        'The saved scene has an unsupported cache envelope.',
        'Continue with a new scene or clear the invalid saved scene.',
        'read',
      ),
    };
  }
  if (parsed['sceneSchemaVersion'] !== SCENE_V03_SCHEMA_VERSION) {
    return {
      kind: 'rejected',
      diagnostic: diagnostic(
        'cache-unsupported-version',
        'The saved scene uses a different schema version.',
        'Open it with a compatible Texture Lab version or start a new scene.',
        'read',
      ),
    };
  }
  if (typeof parsed['sceneHash'] !== 'string' || !isSceneV03(parsed['scene'])) {
    return {
      kind: 'rejected',
      diagnostic: diagnostic(
        'cache-invalid-envelope',
        'The saved scene is incomplete or fails v0.3 validation.',
        'Continue with a new scene or clear the invalid saved scene.',
        'read',
      ),
    };
  }
  const scene = normalizeSceneV03(parsed['scene']);
  const sceneHash = sceneV03Hash(scene);
  if (sceneHash !== parsed['sceneHash']) {
    return {
      kind: 'rejected',
      diagnostic: diagnostic(
        'cache-corrupt',
        'The saved scene does not match its checksum.',
        'Continue with a new scene or clear the corrupt saved scene.',
        'read',
      ),
    };
  }
  return { kind: 'loaded', scene, sceneHash };
}

/** Writes a normalized, validated scene atomically through the supplied storage port. */
export function writeStoredSceneV03(
  storage: SceneStoragePort,
  scene: SceneV03,
  key = SCENE_V03_LATEST_STORAGE_KEY,
): StoredSceneV03WriteResult {
  try {
    const normalized = normalizeSceneV03(scene);
    const validation = validateSceneV03(normalized);
    if (!validation.ok) {
      return {
        kind: 'failed',
        key,
        diagnostic: cacheWriteFailure('The current scene is invalid and was not saved.'),
      };
    }
    const sceneHash = sceneV03Hash(normalized);
    const envelope: StoredSceneV03Envelope = {
      cacheFormat: SCENE_V03_CACHE_FORMAT,
      sceneSchemaVersion: SCENE_V03_SCHEMA_VERSION,
      sceneHash,
      scene: normalized,
    };
    storage.setItem(key, JSON.stringify(envelope));
    return { kind: 'written', key, sceneHash };
  } catch {
    return {
      kind: 'failed',
      key,
      diagnostic: cacheWriteFailure('The saved scene could not be written to local storage.'),
    };
  }
}

/** Adapts the v0.3 scene envelope to the shared editor's cache seam. */
export function createSceneV03CachePort(
  storage: SceneStoragePort,
  key = SCENE_V03_LATEST_STORAGE_KEY,
): CachePort<SceneV03, string> {
  return {
    writeLatestCache: (envelope): CacheWriteResult<string> => {
      const result = writeStoredSceneV03(storage, envelope.recipe, key);
      if (result.kind === 'written') {
        return { kind: 'written', key: result.key, recipeHash: envelope.recipeHash };
      }
      return {
        kind: 'failed',
        key: result.key,
        diagnostic: result.diagnostic,
        priorCachePreserved: true,
      };
    },
  };
}
