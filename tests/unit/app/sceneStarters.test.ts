import { describe, expect, it } from 'vitest';

import { createBlankSceneV03, validateSceneV03 } from '../../../src/domain';
import {
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
} from '../../../src/editor';
import {
  createSceneMaterialTemplate,
  SCENE_SHAPE_PRESETS,
} from '../../../src/app/session/sceneTemplates';
import { createSceneStarter, SCENE_STARTERS } from '../../../src/app/session/sceneStarters';

describe('v0.3 starter composition and shape library', () => {
  it('creates valid, detached starter scenes', () => {
    for (const starter of SCENE_STARTERS) {
      const first = createSceneStarter(starter.id);
      const second = createSceneStarter(starter.id);
      expect(validateSceneV03(first).ok, starter.label).toBe(true);
      expect(first).not.toBe(second);
      expect(first.rootGroups).not.toBe(second.rootGroups);
      if (starter.id !== 'blank') expect(first.rootGroups.length, starter.label).toBeGreaterThan(0);
    }
  });

  it('turns every library choice into one valid frontmost material layer', () => {
    const store = createSceneEditorStore(createBlankSceneV03());
    const ids = createSceneCommandContext({ value: 400 });

    for (const preset of SCENE_SHAPE_PRESETS) {
      const before = store.getCurrentRecipe().rootGroups.length;
      const result = store.commitDesignCommand(
        addSceneLayerCommand(createSceneMaterialTemplate(store.getCurrentRecipe(), preset.id), ids),
      );
      expect(result.ok, preset.label).toBe(true);
      expect(store.getCurrentRecipe().rootGroups).toHaveLength(before + 1);
      const newest = store.getCurrentRecipe().rootGroups.at(-1);
      expect(newest?.name).toMatch(new RegExp('^' + preset.label, 'u'));
      expect(validateSceneV03(store.getCurrentRecipe()).ok, preset.label).toBe(true);
    }
  });
});
