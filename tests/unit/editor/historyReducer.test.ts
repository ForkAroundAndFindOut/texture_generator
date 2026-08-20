import { describe, expect, test } from 'vitest';

import {
  beginInteraction,
  cancelInteraction,
  commitDesignCommand,
  createEditorState,
  finishInteraction,
  promoteInteraction,
  redo,
  undo,
} from '../../../src/editor/state/reducer';

/**
 * T020 is deliberately failure-first.  The reducer API below is the narrow,
 * framework-independent seam that T021 must provide:
 *
 * - state is immutable and owns the canonical current recipe plus history;
 * - `createEditorState` accepts an injected `canonicalize(recipe)` byte port;
 * - a command prepares a success (`candidate`) or a typed failure;
 * - interaction promotion updates an open group without finalising history;
 * - release finalises one entry, while cancel restores the before snapshot;
 * - undo/redo move the pointer/current recipe atomically.
 *
 * These tests keep the recipe generic so history cannot accidentally depend on
 * React, browser storage, rendering, or the concrete domain fixture.
 */

type TestRecipe = {
  revision: number;
  values: number[];
};

type CandidateResult =
  | {
      kind: 'success';
      candidate: TestRecipe;
      canonicalBytes: Uint8Array;
      summary?: string;
    }
  | {
      kind: 'failure';
      diagnostics: string[];
    };

type DesignCommand = {
  kind: string;
  prepare: (current: TestRecipe) => CandidateResult;
};

type DesignTransaction = {
  id: string;
  kind: string;
  beforeRecipe: TestRecipe;
  afterRecipe: TestRecipe;
  beforeCanonicalBytes: Uint8Array;
  afterCanonicalBytes: Uint8Array;
  summary: string;
};

type InteractionGroup = {
  id: string;
  commandKind: string;
  beforeRecipe: TestRecipe;
  latestCandidate: TestRecipe;
  beforeCanonicalBytes: Uint8Array;
};

type EditorState = {
  currentRecipe: TestRecipe;
  history: {
    entries: DesignTransaction[];
    pointer: number;
    openInteraction?: InteractionGroup;
  };
};

type BegunInteraction = {
  state: EditorState;
  group: InteractionGroup;
};

// Keep the test's generic contract explicit while the production reducer is
// still being introduced by T021.
const reducer = {
  beginInteraction: beginInteraction as unknown as (
    state: EditorState,
    kind: string,
  ) => BegunInteraction,
  cancelInteraction: cancelInteraction as unknown as (
    state: EditorState,
    group: InteractionGroup,
  ) => EditorState,
  commitDesignCommand: commitDesignCommand as unknown as (
    state: EditorState,
    command: DesignCommand,
  ) => EditorState,
  createEditorState: createEditorState as unknown as (
    recipe: TestRecipe,
    options?: {
      historyLimit?: number;
      canonicalize?: (recipe: TestRecipe) => Uint8Array;
    },
  ) => EditorState,
  finishInteraction: finishInteraction as unknown as (
    state: EditorState,
    group: InteractionGroup,
    candidate: TestRecipe,
  ) => EditorState,
  promoteInteraction: promoteInteraction as unknown as (
    state: EditorState,
    group: InteractionGroup,
    candidate: TestRecipe,
  ) => EditorState,
  redo: redo as unknown as (state: EditorState) => EditorState,
  undo: undo as unknown as (state: EditorState) => EditorState,
};

const bytesFor = (revision: number): Uint8Array => Uint8Array.from([revision]);

const recipe = (revision: number, values: number[] = [revision]): TestRecipe => ({
  revision,
  values,
});

const success = (
  candidate: TestRecipe,
  summary = `revision ${candidate.revision}`,
): CandidateResult => ({
  kind: 'success',
  candidate,
  canonicalBytes: bytesFor(candidate.revision),
  summary,
});

const commandTo = (revision: number, kind = 'set-revision'): DesignCommand => ({
  kind,
  prepare: () => success(recipe(revision)),
});

const createState = (initial: TestRecipe, options: { historyLimit?: number } = {}): EditorState =>
  reducer.createEditorState(initial, {
    ...options,
    canonicalize: (value) => bytesFor(value.revision),
  });

const revisionOf = (state: EditorState): number => state.currentRecipe.revision;

describe('T020 reducer/history contract', () => {
  test('isolates command candidates from current state and commits only a valid candidate', () => {
    const initial = recipe(0, [0]);
    const state = createState(initial);
    let preparedRecipe: TestRecipe | undefined;

    const next = reducer.commitDesignCommand(state, {
      kind: 'mutate-draft',
      prepare: (current) => {
        // A reducer must hand preparation an isolated draft.  Mutating this
        // object must never mutate the state's current canonical snapshot.
        current.revision = 7;
        current.values.push(7);
        preparedRecipe = current;
        return success(current, 'isolated draft');
      },
    });

    expect(preparedRecipe).toBeDefined();
    expect(preparedRecipe).not.toBe(initial);
    expect(initial).toEqual(recipe(0, [0]));
    expect(state.currentRecipe).toEqual(recipe(0, [0]));
    expect(revisionOf(next)).toBe(7);
    expect(next.currentRecipe.values).toEqual([0, 7]);
    expect(next.history.entries).toHaveLength(1);

    // A later mutation of the prepared object cannot reach committed state.
    preparedRecipe?.values.push(99);
    expect(next.currentRecipe.values).toEqual([0, 7]);
  });

  test('treats invalid preparation as an atomic zero-change operation', () => {
    const state = createState(recipe(0));
    const before = structuredClone(state);

    const result = reducer.commitDesignCommand(state, {
      kind: 'invalid-edit',
      prepare: () => ({
        kind: 'failure',
        diagnostics: ['candidate violates the recipe invariant'],
      }),
    });

    expect(result).toEqual(before);
    expect(result.currentRecipe).toEqual(state.currentRecipe);
    expect(result.history.entries).toHaveLength(0);
    expect(result.history.pointer).toBe(state.history.pointer);
  });

  test('records one command as exactly one transaction with before/after snapshots and bytes', () => {
    const initial = recipe(0);
    const next = reducer.commitDesignCommand(createState(initial), commandTo(1, 'single-command'));

    expect(next.history.entries).toHaveLength(1);
    const [entry] = next.history.entries;
    expect(entry).toMatchObject({
      kind: 'single-command',
      beforeRecipe: initial,
      afterRecipe: recipe(1),
      summary: 'revision 1',
    });
    expect(entry?.beforeCanonicalBytes).toEqual(bytesFor(0));
    expect(entry?.afterCanonicalBytes).toEqual(bytesFor(1));
  });

  test('keeps one interaction group open across pauses, then releases one final transaction', () => {
    const initial = recipe(0);
    const started = reducer.beginInteraction(createState(initial), 'pointer-drag');
    const paused = reducer.promoteInteraction(started.state, started.group, recipe(1));

    expect(revisionOf(paused)).toBe(1);
    expect(paused.history.entries).toHaveLength(0);
    expect(paused.history.openInteraction).toMatchObject({
      id: started.group.id,
      commandKind: 'pointer-drag',
      beforeRecipe: initial,
      latestCandidate: recipe(1),
    });

    // Resumed input replaces the open group's after snapshot; it does not
    // append a second entry or expose the pause as a separate Undo step.
    const resumed = reducer.promoteInteraction(paused, started.group, recipe(2));
    expect(revisionOf(resumed)).toBe(2);
    expect(resumed.history.entries).toHaveLength(0);
    expect(resumed.history.openInteraction?.latestCandidate).toEqual(recipe(2));

    const released = reducer.finishInteraction(resumed, started.group, recipe(3));
    expect(revisionOf(released)).toBe(3);
    expect(released.history.entries).toHaveLength(1);
    expect(released.history.openInteraction).toBeUndefined();
    expect(released.history.entries[0]).toMatchObject({
      kind: 'pointer-drag',
      beforeRecipe: initial,
      afterRecipe: recipe(3),
    });
    expect(released.history.entries[0]?.beforeCanonicalBytes).toEqual(bytesFor(0));
    expect(released.history.entries[0]?.afterCanonicalBytes).toEqual(bytesFor(3));
  });

  test('cancels an open interaction by restoring beforeRecipe without a history entry', () => {
    const initial = recipe(0);
    const started = reducer.beginInteraction(createState(initial), 'pointer-drag');
    const paused = reducer.promoteInteraction(started.state, started.group, recipe(8));
    const cancelled = reducer.cancelInteraction(paused, started.group);

    expect(revisionOf(cancelled)).toBe(0);
    expect(cancelled.currentRecipe).toEqual(initial);
    expect(cancelled.history.entries).toHaveLength(0);
    expect(cancelled.history.openInteraction).toBeUndefined();
  });

  test('retains a bounded minimum of 100 finalized entries and drops only oldest complete entries', () => {
    let state = createState(recipe(0), { historyLimit: 100 });

    for (let revision = 1; revision <= 125; revision += 1) {
      state = reducer.commitDesignCommand(state, commandTo(revision, 'retained-edit'));
    }

    expect(state.history.entries.length).toBeGreaterThanOrEqual(100);
    expect(state.history.entries.length).toBeLessThanOrEqual(100);
    expect(revisionOf(state)).toBe(125);
    expect(state.history.entries.at(-1)?.afterRecipe).toEqual(recipe(125));
    expect(state.history.entries[0]?.afterRecipe.revision).toBe(26);
    expect(
      state.history.entries.every(
        (entry) => entry.beforeRecipe.revision < entry.afterRecipe.revision,
      ),
    ).toBe(true);
  });

  test('moves the current pointer through Undo and Redo without creating entries', () => {
    let state = createState(recipe(0));
    state = reducer.commitDesignCommand(state, commandTo(1));
    state = reducer.commitDesignCommand(state, commandTo(2));
    state = reducer.commitDesignCommand(state, commandTo(3));
    const committedPointer = state.history.pointer;

    const undoneOnce = reducer.undo(state);
    expect(revisionOf(undoneOnce)).toBe(2);
    expect(undoneOnce.history.pointer).not.toBe(committedPointer);
    expect(undoneOnce.history.entries).toHaveLength(3);

    const undoneTwice = reducer.undo(undoneOnce);
    expect(revisionOf(undoneTwice)).toBe(1);
    const redoneOnce = reducer.redo(undoneTwice);
    expect(revisionOf(redoneOnce)).toBe(2);
    const redoneTwice = reducer.redo(redoneOnce);
    expect(revisionOf(redoneTwice)).toBe(3);
    expect(redoneTwice.history.pointer).toBe(committedPointer);

    // Boundary operations are no-ops rather than synthetic history entries.
    const redoAtBoundary = reducer.redo(redoneTwice);
    expect(redoAtBoundary).toEqual(redoneTwice);
    const undoAtStart = reducer.undo(reducer.undo(reducer.undo(redoneTwice)));
    expect(revisionOf(undoAtStart)).toBe(0);
    expect(reducer.undo(undoAtStart)).toEqual(undoAtStart);
    expect(undoAtStart.history.entries).toHaveLength(3);
  });

  test('truncates the redo tail when a new command is committed after Undo', () => {
    let state = createState(recipe(0));
    state = reducer.commitDesignCommand(state, commandTo(1));
    state = reducer.commitDesignCommand(state, commandTo(2));
    state = reducer.commitDesignCommand(state, commandTo(3));

    const afterUndo = reducer.undo(state);
    expect(revisionOf(afterUndo)).toBe(2);

    const replacement = reducer.commitDesignCommand(afterUndo, commandTo(9, 'replacement'));
    expect(revisionOf(replacement)).toBe(9);
    expect(replacement.history.entries).toHaveLength(3);
    expect(replacement.history.entries.at(-1)).toMatchObject({
      kind: 'replacement',
      beforeRecipe: recipe(2),
      afterRecipe: recipe(9),
    });

    // The old revision 3 is no longer reachable through Redo.
    const afterRedo = reducer.redo(replacement);
    expect(afterRedo).toEqual(replacement);
    expect(revisionOf(afterRedo)).toBe(9);
    expect(afterRedo.history.entries.some((entry) => entry.afterRecipe.revision === 3)).toBe(false);
  });
});
