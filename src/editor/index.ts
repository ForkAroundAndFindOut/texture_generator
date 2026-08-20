/**
 * Public editor boundary.
 *
 * Editor exports describe framework-independent session, command, and
 * interaction contracts. Keep React composition in the app layer and keep
 * persistence, renderer, and generator implementations behind their own
 * boundaries; add only explicit sanctioned exports here.
 */
export {
  addComponentCommand,
  duplicateComponentCommand,
  insertFieldAnchorCommand,
  normalizeComponentSelection,
  removeFieldAnchorCommand,
  removeComponentCommand,
  renameComponentCommand,
  reorderComponentCommand,
  updateBandShapeCommand,
  updateComponentAppearanceCommand,
  updateComponentTransformCommand,
  updateFieldAnchorCommand,
} from './state/componentCommands';
export type {
  ComponentAppearancePatch,
  BandShapePatch,
  ComponentCommandContext,
  ComponentCommandDiagnostic,
  ComponentTransformPatch,
  FieldAnchorPatch,
  FieldAnchorPoint,
} from './state/componentCommands';

export { updateBaseColorCommand, updateComponentColorCommand } from './state/colorCommands';
export type {
  ColorCommandContext,
  ColorCommandDiagnostic,
  ColorPatch,
} from './state/colorCommands';

export { createEditorStore } from './state/editorStore';
export type {
  CandidatePipeline,
  CommitFailureStage,
  EditorStore,
  EditorStoreOptions,
  EditorStoreSnapshot,
  HashRecipe,
  InteractionCoordinatorSnapshot,
  InteractionFlushResult,
  RenderFlushResult,
} from './state/editorStore';

export {
  addSceneLayerAtTransformCommand,
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  createSceneV03CachePort,
  deleteSceneLayerCommand,
  duplicateSceneLayerCommand,
  readStoredSceneV03,
  renameSceneLayerCommand,
  reorderSceneLayerCommand,
  replaceSceneV03Command,
  sceneV03Hash,
  sceneV03HashFromCanonicalBytes,
  SCENE_V03_CACHE_FORMAT,
  SCENE_V03_LATEST_STORAGE_KEY,
  setSceneLayerVisibilityCommand,
  updateSceneArtboardCommand,
  updateSceneBackgroundCommand,
  updateSceneLayerTransformCommand,
  updateSceneMaterialCommand,
  updateScenePaletteEntryCommand,
  writeStoredSceneV03,
} from './scene';
export type {
  CreateSceneEditorStoreOptions,
  SceneArtboardPatch,
  SceneCommandContext,
  SceneCommandDiagnostic,
  SceneEditorStore,
  SceneIdSequence,
  SceneLayerTransformPatch,
  SceneMaterialPatch,
  ScenePaletteEntryPatch,
  SceneStoragePort,
  StoredSceneV03Envelope,
  StoredSceneV03ReadResult,
  StoredSceneV03WriteResult,
} from './scene';
