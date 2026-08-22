import { describe, expect, it } from 'vitest';

import {
  buildPaletteImportPreview,
  createPaletteFile,
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  deleteScenePaletteEntryCommand,
  importScenePaletteCommand,
  parsePaletteFile,
} from '../../../src/editor';
import { createBlankSceneV03, parseSceneColor } from '../../../src/domain';
import { createSceneMaterialTemplate } from '../../../src/app/session/sceneTemplates';

describe('scene palette management', () => {
  it('parses strict hex and RGB forms into canonical colors', () => {
    expect(parseSceneColor('#ff6347')).toMatchObject({ kind: 'valid', color: '#FF6347' });
    expect(parseSceneColor('FF6347')).toMatchObject({ kind: 'valid', color: '#FF6347' });
    expect(parseSceneColor('rgb(255, 99, 71)')).toMatchObject({ kind: 'valid', color: '#FF6347' });
    expect(parseSceneColor('rgb(255 99 71)')).toMatchObject({ kind: 'valid', color: '#FF6347' });
    expect(parseSceneColor('rgb(256, 0, 0)').kind).toBe('invalid');
    expect(parseSceneColor('#FFF').kind).toBe('invalid');
  });

  it('validates the named JSON envelope, missing names, and duplicate names', () => {
    const parsed = parsePaletteFile({
      format: 'texture-lab-palette',
      version: 1,
      entries: [
        { name: 'Tomato', color: 'rgb(255 99 71)' },
        { color: '#FFFFFF' },
        { name: 'tomato', color: '#000000' },
      ],
    });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({ name: 'Tomato', color: '#FF6347' });
    expect(parsed.entries[1]?.name).toBe('Imported 1');
    expect(parsed.issues).toEqual([expect.objectContaining({ sourceIndex: 2, kind: 'invalid' })]);
    expect(parsePaletteFile({ palette: [] }).issues[0]?.kind).toBe('file');
  });

  it('previews capacity overflow without silently discarding entries', () => {
    const scene = createBlankSceneV03();
    const parsed = parsePaletteFile({
      format: 'texture-lab-palette',
      version: 1,
      entries: Array.from({ length: 30 }, (_, index) => ({
        name: `Imported ${index + 1}`,
        color: '#FFFFFF',
      })),
    });
    const preview = buildPaletteImportPreview(scene, parsed, 'append');
    expect(preview.approvedEntries).toHaveLength(28);
    expect(preview.resultingCount).toBe(32);
    expect(preview.issues.filter((issue) => issue.kind === 'capacity')).toHaveLength(2);
  });

  it('detaches palette references when deleting an entry and keeps one undo step', () => {
    const scene = createBlankSceneV03();
    const store = createSceneEditorStore(scene);
    const add = store.commitDesignCommand(
      addSceneLayerCommand(
        createSceneMaterialTemplate(scene, 'glow'),
        createSceneCommandContext({ value: 100 }),
      ),
    );
    expect(add.ok).toBe(true);
    const material = store.getCurrentRecipe().rootGroups[0]?.children[0];
    if (material?.kind !== 'material' || material.fill.kind !== 'palette')
      throw new Error('Expected palette material.');
    const before = store.getSnapshot().history.entries.length;
    const deleted = store.commitDesignCommand(
      deleteScenePaletteEntryCommand(material.fill.paletteId),
    );
    expect(deleted.ok).toBe(true);
    const nextMaterial = store.getCurrentRecipe().rootGroups[0]?.children[0];
    expect(nextMaterial?.kind === 'material' ? nextMaterial.fill.kind : undefined).toBe('local');
    expect(store.getSnapshot().history.entries).toHaveLength(before + 1);
  });

  it('applies clear import transactionally and exports canonical hex only', () => {
    const scene = createBlankSceneV03();
    const store = createSceneEditorStore(scene);
    const parsed = parsePaletteFile({
      format: 'texture-lab-palette',
      version: 1,
      entries: [{ name: 'Ocean', color: 'rgb(0, 128, 255)' }],
    });
    const preview = buildPaletteImportPreview(scene, parsed, 'clear');
    const result = store.commitDesignCommand(
      importScenePaletteCommand(
        preview.approvedEntries,
        'clear',
        createSceneCommandContext({ value: 500 }),
      ),
    );
    expect(result.ok).toBe(true);
    expect(store.getCurrentRecipe().palette).toHaveLength(1);
    expect(store.getCurrentRecipe().palette[0]).toMatchObject({ name: 'Ocean', color: '#0080FF' });
    expect(createPaletteFile(store.getCurrentRecipe())).toEqual({
      format: 'texture-lab-palette',
      version: 1,
      entries: [{ name: 'Ocean', color: '#0080FF' }],
    });
  });

  it('rejects deleting the final palette entry', () => {
    const scene = createBlankSceneV03();
    scene.palette = [scene.palette[0]!];
    const store = createSceneEditorStore(scene);
    const result = store.commitDesignCommand(deleteScenePaletteEntryCommand(scene.palette[0]!.id));
    expect(result.ok).toBe(false);
    expect(store.getCurrentRecipe().palette).toHaveLength(1);
  });
});
