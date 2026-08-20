/** Scene-specific configuration of the reusable history/editor store. */

import {
  canonicalSceneV03Bytes,
  normalizeSceneV03,
  validateSceneV03,
  type SceneV03,
  type SceneV03ValidationDiagnostic,
} from '../../domain';
import { createEditorStore, type EditorStore } from '../state/editorStore';
import type { PersistenceStatus } from '../interactions/interactionCoordinator';
import {
  createSceneV03CachePort,
  sceneV03HashFromCanonicalBytes,
  type SceneStoragePort,
} from './persistence';

export type SceneEditorStore = EditorStore<SceneV03, string, SceneV03ValidationDiagnostic>;

export interface CreateSceneEditorStoreOptions {
  readonly historyLimit?: number;
  readonly storage?: SceneStoragePort;
  readonly storageKey?: string;
  readonly initialPersistence?: PersistenceStatus<string>;
}

/**
 * Creates a validated v0.3 editor session. The shared coordinator calls its
 * cache only after a successful scene transaction, so rejected commands and
 * failed imported scenes cannot overwrite local storage.
 */
export function createSceneEditorStore(
  initialScene: SceneV03,
  options: CreateSceneEditorStoreOptions = {},
): SceneEditorStore {
  const normalized = normalizeSceneV03(initialScene);
  const validation = validateSceneV03(normalized);
  if (!validation.ok) throw new TypeError('Initial v0.3 scene must be valid.');

  return createEditorStore<SceneV03, string, SceneV03ValidationDiagnostic>(normalized, {
    canonicalize: canonicalSceneV03Bytes,
    normalize: normalizeSceneV03,
    validate: validateSceneV03,
    hashRecipe: (_, bytes) => sceneV03HashFromCanonicalBytes(bytes),
    ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
    ...(options.storage === undefined
      ? {}
      : { cache: createSceneV03CachePort(options.storage, options.storageKey) }),
    ...(options.initialPersistence === undefined
      ? {}
      : { initialPersistence: options.initialPersistence }),
  });
}
