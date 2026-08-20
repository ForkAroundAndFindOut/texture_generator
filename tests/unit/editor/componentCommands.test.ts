import { describe, expect, test } from 'vitest';

import {
  canonicalRecipeBytes,
  createDefaultRecipe,
  stableIdFromBytes,
  type AnchorId,
  type Band,
  type Component,
  type ComponentId,
  type Field,
  type TextureRecipe,
} from '../../../src/domain';
import {
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
} from '../../../src/editor/state/componentCommands';
import type { DesignCommand } from '../../../src/editor/state/commands';
import {
  beginInteraction,
  commitDesignCommand,
  createEditorState,
  finishInteraction,
  promoteInteraction,
  redo,
  undo,
} from '../../../src/editor/state/reducer';

/**
 * T024 is failure-first.  These tests specify the framework-independent
 * component-command seam that T028 must provide:
 *
 * - component mutations are DesignCommands and return validated candidates;
 * - canonical bytes and new stable identities come from an injected context;
 * - selection is session-only and is normalized to current z-order;
 * - invalid targets/patches are atomic no-ops;
 * - one pointer gesture promotes many drafts but finalizes one history entry.
 */

type ComponentCommandContext = {
  canonicalize: (recipe: TextureRecipe) => Uint8Array;
  createComponentId: () => ComponentId;
  createAnchorId: (sourceId: ComponentId, anchorIndex: number) => AnchorId;
};

const bytesForRecipe = (recipe: TextureRecipe): Uint8Array => canonicalRecipeBytes(recipe);

const idFor = (slot: number): ComponentId => {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return stableIdFromBytes('component', bytes);
};

const anchorIdFor = (slot: number): AnchorId => {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return stableIdFromBytes('anchor', bytes);
};

const contextWithIds = (...ids: ComponentId[]): ComponentCommandContext => {
  const queue = [...ids];
  return {
    canonicalize: bytesForRecipe,
    createComponentId: () => {
      const id = queue.shift();
      if (id === undefined) throw new Error('test ID queue exhausted');
      return id;
    },
    createAnchorId: (_sourceId, anchorIndex) => anchorIdFor(1000 + anchorIndex),
  };
};

const clone = <Value>(value: Value): Value => structuredClone(value);

const defaultRecipe = (): TextureRecipe => clone(createDefaultRecipe());

const componentsById = (recipe: TextureRecipe): Map<ComponentId, Component> =>
  new Map(recipe.components.map((component) => [component.id, component]));

const firstComponent = (recipe: TextureRecipe): Component => {
  const component = recipe.components[0];
  if (component === undefined) throw new Error('default recipe has no first component');
  return component;
};

const secondComponent = (recipe: TextureRecipe): Component => {
  const component = recipe.components[1];
  if (component === undefined) throw new Error('default recipe has no second component');
  return component;
};

const cloneBandWithId = (recipe: TextureRecipe, id: ComponentId): Band => {
  const band = recipe.components.find((component): component is Band => component.type === 'band');
  if (band === undefined) throw new Error('default recipe has no Band');
  return { ...clone(band), id, name: 'Inserted band' };
};

const asField = (component: Component): Field => {
  if (component.type !== 'field') throw new Error('expected a Field component');
  return component;
};

const fieldGeometryAndTopology = (component: Component): unknown =>
  asField(component).contour.anchors.map(({ id: _id, ...anchor }) => anchor);

const commandCandidate = <Recipe>(command: DesignCommand<Recipe>, recipe: Recipe): Recipe => {
  const result = command.prepare(recipe);
  if (result.kind !== 'success') throw new Error(`expected candidate: ${JSON.stringify(result)}`);
  return result.candidate;
};

describe('T024 component commands', () => {
  test('adds a component with a stable identity and one history transaction', () => {
    const recipe = defaultRecipe();
    const insertedId = idFor(30);
    const inserted = cloneBandWithId(recipe, insertedId);
    const context = contextWithIds(insertedId);
    const before = clone(recipe);
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });

    const next = commitDesignCommand(state, addComponentCommand(inserted, context));

    expect(next.currentRecipe.components).toHaveLength(recipe.components.length + 1);
    expect(next.currentRecipe.components.at(-1)).toEqual(inserted);
    expect(next.currentRecipe.components.map((component) => component.id)).toEqual([
      ...recipe.components.map((component) => component.id),
      insertedId,
    ]);
    expect(next.history.entries).toHaveLength(1);
    expect(recipe).toEqual(before);
  });

  test('duplicates a component with a new stable ID while retaining source values', () => {
    const recipe = defaultRecipe();
    const source = asField(firstComponent(recipe));
    const duplicateId = idFor(31);
    const context = contextWithIds(duplicateId);
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });

    const next = commitDesignCommand(state, duplicateComponentCommand(source.id, context));
    const duplicate = next.currentRecipe.components.at(-1);

    expect(duplicate).toBeDefined();
    expect(duplicate?.id).toBe(duplicateId);
    expect(duplicate?.id).not.toBe(source.id);
    expect(duplicate?.type).toBe('field');
    expect(fieldGeometryAndTopology(duplicate!)).toEqual(fieldGeometryAndTopology(source));
    const duplicateField = asField(duplicate!);
    expect(duplicateField.contour.anchors.map((anchor) => anchor.id)).toEqual(
      source.contour.anchors.map((_, index) => anchorIdFor(1000 + index)),
    );
    expect(duplicateField.contour.anchors.map((anchor) => anchor.id)).not.toEqual(
      source.contour.anchors.map((anchor) => anchor.id),
    );
    expect(next.currentRecipe.components.map((component) => component.id)).toEqual([
      ...recipe.components.map((component) => component.id),
      duplicateId,
    ]);
    expect(next.history.entries).toHaveLength(1);
  });

  test('removes only the targeted component and rejects an unknown target atomically', () => {
    const recipe = defaultRecipe();
    const target = secondComponent(recipe);
    const context = contextWithIds();
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });
    const removed = commitDesignCommand(state, removeComponentCommand(target.id, context));

    expect(removed.currentRecipe.components.map((component) => component.id)).toEqual([
      recipe.components[0]?.id,
    ]);
    expect(removed.history.entries).toHaveLength(1);

    const beforeInvalid = clone(removed);
    const invalid = removeComponentCommand(idFor(999), context);
    const rejected = commitDesignCommand(removed, invalid);

    expect(rejected).toEqual(beforeInvalid);
  });

  test('normalizes selection to existing IDs in canonical z-order without mutating recipe/history', () => {
    const recipe = defaultRecipe();
    const ids = recipe.components.map((component) => component.id);
    const before = clone(recipe);

    const selected = normalizeComponentSelection(recipe, [ids[1]!, idFor(404), ids[0]!, ids[1]!]);

    expect(selected).toEqual([ids[0], ids[1]]);
    expect(recipe).toEqual(before);
  });

  test('reorders z-order by stable ID and leaves component payloads unchanged', () => {
    const recipe = defaultRecipe();
    const [field, band] = recipe.components;
    if (field === undefined || band === undefined) throw new Error('expected two defaults');
    const beforeById = componentsById(recipe);
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });

    const next = commitDesignCommand(state, reorderComponentCommand(band.id, 0, contextWithIds()));

    expect(next.currentRecipe.components.map((component) => component.id)).toEqual([
      band.id,
      field.id,
    ]);
    for (const component of next.currentRecipe.components) {
      expect(component).toEqual(beforeById.get(component.id));
    }
    expect(next.history.entries).toHaveLength(1);
  });

  test('applies precise transform and appearance patches only to the selected component', () => {
    const recipe = defaultRecipe();
    const [target, untouched] = recipe.components;
    if (target === undefined || untouched === undefined) throw new Error('expected two defaults');
    const context = contextWithIds();
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });
    const transformed = commitDesignCommand(
      state,
      updateComponentTransformCommand(
        target.id,
        {
          translation: { x: 0.731234, y: 0.264321 },
          baseSize: { width: 1.234567, height: 0.765432 },
          rotationDeg: 47.25,
          uniformScale: 1.375,
        },
        context,
      ),
    );
    const styled = commitDesignCommand(
      transformed,
      updateComponentAppearanceCommand(
        target.id,
        {
          softness: 0.123456,
          highlight: 0.654321,
          grain: 0.246802,
          asymmetry: -0.375,
          blendMode: 'multiply',
        },
        context,
      ),
    );
    const changed = styled.currentRecipe.components[0];
    const unchanged = styled.currentRecipe.components[1];

    expect(changed?.transform).toEqual({
      translation: { x: 0.731234, y: 0.264321 },
      baseSize: { width: 1.234567, height: 0.765432 },
      rotationDeg: 47.25,
      uniformScale: 1.375,
    });
    expect(changed?.appearance).toEqual({
      softness: 0.123456,
      highlight: 0.654321,
      grain: 0.246802,
      asymmetry: -0.375,
      blendMode: 'multiply',
    });
    expect(unchanged).toEqual(untouched);
    expect(styled.history.entries).toHaveLength(2);
  });

  test('rejects invalid geometry and appearance patches as zero-change operations', () => {
    const recipe = defaultRecipe();
    const target = firstComponent(recipe);
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });
    const before = clone(state);

    const invalidGeometry = commitDesignCommand(
      state,
      updateComponentTransformCommand(
        target.id,
        { translation: { x: Number.NaN, y: 0.2 } },
        contextWithIds(),
      ),
    );
    expect(invalidGeometry).toEqual(before);

    const invalidAppearance = commitDesignCommand(
      state,
      updateComponentAppearanceCommand(target.id, { softness: 1.5 }, contextWithIds()),
    );
    expect(invalidAppearance).toEqual(before);
  });

  test('renames a layer and applies the bounded Band shape controls', () => {
    const recipe = defaultRecipe();
    const band = recipe.components.find(
      (component): component is Band => component.type === 'band',
    );
    if (band === undefined) throw new Error('default recipe has no Band');
    const renamed = commandCandidate(
      renameComponentCommand(band.id, '  Warm horizon  ', contextWithIds()),
      recipe,
    );
    const reshaped = commandCandidate(
      updateBandShapeCommand(band.id, { taper: 0.7, endCap: 'flat' }, contextWithIds()),
      renamed,
    );
    const editedBand = reshaped.components.find(
      (component): component is Band => component.type === 'band',
    );

    expect(editedBand?.name).toBe('Warm horizon');
    expect(editedBand?.band).toEqual({ taper: 0.7, endCap: 'flat' });
    expect(recipe.components.find((component) => component.id === band.id)?.name).toBe(band.name);
  });

  test('inserts, moves, and removes a bounded Field anchor with fresh identity', () => {
    const recipe = defaultRecipe();
    const field = asField(firstComponent(recipe));
    const anchor = field.contour.anchors[0];
    if (anchor === undefined) throw new Error('default Field has no anchors');
    const context = contextWithIds();

    const inserted = commandCandidate(
      insertFieldAnchorCommand(field.id, anchor.id, context, { x: 0.61, y: 0.19 }),
      recipe,
    );
    const insertedField = asField(firstComponent(inserted));
    const insertedAnchor = insertedField.contour.anchors[1];
    if (insertedAnchor === undefined) throw new Error('inserted Field has no new anchor');
    expect(insertedField.contour.anchors).toHaveLength(field.contour.anchors.length + 1);
    expect(insertedAnchor).toMatchObject({ id: anchorIdFor(1001), x: 0.61, y: 0.19 });

    const moved = commandCandidate(
      updateFieldAnchorCommand(field.id, insertedAnchor.id, { x: 0.61, y: 0.19 }, context),
      inserted,
    );
    const movedField = asField(firstComponent(moved));
    expect(movedField.contour.anchors[1]).toMatchObject({
      id: insertedAnchor.id,
      x: 0.61,
      y: 0.19,
    });

    const removed = commandCandidate(
      removeFieldAnchorCommand(field.id, insertedAnchor.id, context),
      moved,
    );
    expect(asField(firstComponent(removed)).contour.anchors).toHaveLength(
      field.contour.anchors.length,
    );

    const invalid = updateFieldAnchorCommand(field.id, anchor.id, { x: 1.5 }, context).prepare(
      recipe,
    );
    expect(invalid.kind).toBe('failure');

    const invalidInsert = insertFieldAnchorCommand(field.id, anchor.id, context, {
      x: 1.5,
      y: 0.2,
    }).prepare(recipe);
    expect(invalidInsert.kind).toBe('failure');
  });

  test('coalesces one pointer gesture into one Undo/Redo transaction', () => {
    const recipe = defaultRecipe();
    const target = firstComponent(recipe);
    const context = contextWithIds();
    const state = createEditorState(recipe, { canonicalize: bytesForRecipe });
    const started = beginInteraction(state, 'component-translate');

    const draftOne = commandCandidate(
      updateComponentTransformCommand(target.id, { translation: { x: 0.61, y: 0.4 } }, context),
      started.state.currentRecipe,
    );
    const paused = promoteInteraction(started.state, started.group, draftOne);
    expect(paused.history.entries).toHaveLength(0);

    const draftTwo = commandCandidate(
      updateComponentTransformCommand(target.id, { translation: { x: 0.72, y: 0.31 } }, context),
      paused.currentRecipe,
    );
    const resumed = promoteInteraction(paused, started.group, draftTwo);
    const released = finishInteraction(resumed, started.group, draftTwo);

    expect(released.currentRecipe.components[0]?.transform.translation).toEqual({
      x: 0.72,
      y: 0.31,
    });
    expect(released.history.entries).toHaveLength(1);
    expect(released.history.pointer).toBe(1);

    const undone = undo(released);
    expect(undone.currentRecipe).toEqual(recipe);
    expect(undone.history.entries).toHaveLength(1);
    expect(undone.history.pointer).toBe(0);

    const redone = redo(undone);
    expect(redone.currentRecipe.components[0]?.transform.translation).toEqual({
      x: 0.72,
      y: 0.31,
    });
    expect(redone.history.pointer).toBe(1);
  });
});
