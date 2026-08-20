import { describe, expect, test } from 'vitest';

import {
  canonicalRecipeBytes,
  createDefaultRecipe,
  resolveComponentColor,
  type Component,
  type TextureRecipe,
} from '../../../src/domain';
import {
  updateBaseColorCommand,
  updateComponentColorCommand,
} from '../../../src/editor/state/colorCommands';
import {
  commitDesignCommand,
  createEditorState,
  redo,
  undo,
} from '../../../src/editor/state/reducer';

const context = { canonicalize: canonicalRecipeBytes };
const clone = <Value>(value: Value): Value => structuredClone(value);

function field(recipe: TextureRecipe): Component {
  const value = recipe.components.find((component) => component.type === 'field');
  if (value === undefined) throw new Error('default recipe has no Field');
  return value;
}

describe('v0.1-lite color commands', () => {
  test('resolves a palette color and detaches a component edit to a local source', () => {
    const recipe = createDefaultRecipe();
    const target = field(recipe);
    const before = clone(recipe);
    const resolved = resolveComponentColor(recipe, target);
    expect(resolved).toMatchObject({ source: 'palette', value: { hex: '#5B8CFF' } });
    expect(resolved.value.opacity).toBeCloseTo(0.78);

    const state = createEditorState(recipe, { canonicalize: canonicalRecipeBytes });
    const next = commitDesignCommand(
      state,
      updateComponentColorCommand(target.id, { hex: '#a1b2c3' }, context),
    );
    const changed = next.currentRecipe.components.find((component) => component.id === target.id);

    expect(changed?.colorSource).toMatchObject({
      kind: 'local',
      value: { hex: '#A1B2C3' },
    });
    if (changed?.colorSource.kind !== 'local') throw new Error('expected local color source');
    expect(changed.colorSource.value.opacity).toBeCloseTo(0.78);
    expect(next.history.entries).toHaveLength(1);
    expect(recipe).toEqual(before);
  });

  test('commits component opacity and canvas color as undoable edits', () => {
    const recipe = createDefaultRecipe();
    const target = field(recipe);
    const state = createEditorState(recipe, { canonicalize: canonicalRecipeBytes });
    const componentChanged = commitDesignCommand(
      state,
      updateComponentColorCommand(target.id, { opacity: 0.31 }, context),
    );
    const baseChanged = commitDesignCommand(
      componentChanged,
      updateBaseColorCommand({ hex: '#102030', opacity: 0.72 }, context),
    );

    expect(
      resolveComponentColor(baseChanged.currentRecipe, field(baseChanged.currentRecipe)).value,
    ).toMatchObject({ opacity: 0.31 });
    expect(baseChanged.currentRecipe.base.value).toEqual({ hex: '#102030', opacity: 0.72 });
    expect(baseChanged.history.entries).toHaveLength(2);

    const undone = undo(baseChanged);
    expect(undone.currentRecipe.base.value).toEqual(recipe.base.value);
    expect(redo(undone).currentRecipe.base.value).toEqual({ hex: '#102030', opacity: 0.72 });
  });

  test('rejects malformed colors and out-of-range opacity atomically', () => {
    const recipe = createDefaultRecipe();
    const target = field(recipe);
    const state = createEditorState(recipe, { canonicalize: canonicalRecipeBytes });
    const before = clone(state);

    expect(
      commitDesignCommand(
        state,
        updateComponentColorCommand(target.id, { hex: '#XYZ123' }, context),
      ),
    ).toEqual(before);
    expect(commitDesignCommand(state, updateBaseColorCommand({ opacity: 1.1 }, context))).toEqual(
      before,
    );
  });
});
