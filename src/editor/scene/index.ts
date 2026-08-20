export {
  addSceneLayerCommand,
  createSceneCommandContext,
  deleteSceneLayerCommand,
  duplicateSceneLayerCommand,
  renameSceneLayerCommand,
  reorderSceneLayerCommand,
  replaceSceneV03Command,
  setSceneLayerVisibilityCommand,
  updateSceneArtboardCommand,
  updateSceneBackgroundCommand,
  updateSceneLayerTransformCommand,
  updateScenePaletteEntryCommand,
} from './commands';
export type {
  SceneArtboardPatch,
  SceneCommandContext,
  SceneCommandDiagnostic,
  SceneIdSequence,
  SceneLayerTransformPatch,
  ScenePaletteEntryPatch,
} from './commands';

export {
  createSceneV03CachePort,
  readStoredSceneV03,
  sceneV03Hash,
  sceneV03HashFromCanonicalBytes,
  SCENE_V03_CACHE_FORMAT,
  SCENE_V03_LATEST_STORAGE_KEY,
  writeStoredSceneV03,
} from './persistence';
export type {
  SceneStoragePort,
  StoredSceneV03Envelope,
  StoredSceneV03ReadResult,
  StoredSceneV03WriteResult,
} from './persistence';

export { createSceneEditorStore } from './store';
export type { CreateSceneEditorStoreOptions, SceneEditorStore } from './store';
