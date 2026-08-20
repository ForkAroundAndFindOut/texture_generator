import {
  cloneCanonicalBytes,
  cloneRecipe,
  fallbackCanonicalBytes,
  isCanonicalBytes,
  type CandidateResult,
  type DesignCommand,
  type RecipeCanonicalizer,
} from './commands';
import {
  appendTransaction,
  clearOpenInteraction,
  createHistory,
  updateHistory,
  type DesignHistory,
  type DesignTransaction,
  type InteractionGroup,
  withOpenInteraction,
} from './history';

export type EditorState<Recipe> = {
  readonly currentRecipe: Recipe;
  readonly history: DesignHistory<Recipe>;
};

export type CreateEditorStateOptions<Recipe> = {
  readonly historyLimit?: number;
  readonly canonicalize?: RecipeCanonicalizer<Recipe>;
  /** Alias accepted by callers that name the port after its byte output. */
  readonly canonicalBytes?: RecipeCanonicalizer<Recipe>;
};

export type BegunInteraction<Recipe> = {
  readonly state: EditorState<Recipe>;
  readonly group: InteractionGroup<Recipe>;
};

export function createEditorState<Recipe>(
  recipe: Recipe,
  options: CreateEditorStateOptions<Recipe> = {},
): EditorState<Recipe> {
  // The state intentionally stores only canonical recipe/history data.  A
  // serializer is an operation supplied by commands; it is not editor state.
  // `options.canonicalize` is accepted for callers that need byte snapshots for
  // direct interaction candidates, while command candidates remain authoritative.
  const initial = cloneRecipe(recipe);
  const history = createHistory<Recipe>(options.historyLimit);
  const canonicalize = options.canonicalize ?? options.canonicalBytes;
  if (canonicalize !== undefined) {
    // Preserve the optional function in a non-enumerable property so generic
    // structured-clone/equality tests still see the documented state shape.
    Object.defineProperty(history, 'canonicalize', {
      value: canonicalize,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return { currentRecipe: initial, history };
}

export function beginInteraction<Recipe>(
  state: EditorState<Recipe>,
  commandKind: string,
): BegunInteraction<Recipe> {
  const existing = state.history.openInteraction;
  if (existing !== undefined) return { state, group: cloneInteractionGroup(existing) };

  const beforeRecipe = cloneRecipe(state.currentRecipe);
  const beforeCanonicalBytes = safeCanonicalBytesFor(state, beforeRecipe);
  if (beforeCanonicalBytes === undefined) {
    return { state, group: rejectedInteractionGroup(commandKind, beforeRecipe) };
  }
  const group: InteractionGroup<Recipe> = {
    id: `interaction-${state.history.nextInteractionId}`,
    commandKind,
    beforeRecipe,
    latestCandidate: cloneRecipe(beforeRecipe),
    changedControlKeys: new Set<string>(),
    beforeCanonicalBytes,
    latestCanonicalBytes: cloneCanonicalBytes(beforeCanonicalBytes),
  };
  const history = withOpenInteraction(
    updateHistory(state.history, {
      nextInteractionId: state.history.nextInteractionId + 1,
    }),
    group,
  );
  return {
    state: { currentRecipe: cloneRecipe(state.currentRecipe), history },
    group: cloneInteractionGroup(group),
  };
}

export function promoteInteraction<Recipe>(
  state: EditorState<Recipe>,
  group: InteractionGroup<Recipe>,
  candidate: Recipe,
): EditorState<Recipe> {
  const active = activeGroup(state, group);
  if (active === undefined) return state;

  let latestCandidate: Recipe;
  try {
    latestCandidate = cloneRecipe(candidate);
  } catch {
    return state;
  }
  const latestCanonicalBytes = safeCanonicalBytesFor(state, latestCandidate);
  if (latestCanonicalBytes === undefined) return state;
  const updated: InteractionGroup<Recipe> = {
    ...active,
    latestCandidate: cloneRecipe(latestCandidate),
    latestCanonicalBytes: cloneCanonicalBytes(latestCanonicalBytes),
  };
  return {
    currentRecipe: cloneRecipe(latestCandidate),
    history: withOpenInteraction(state.history, updated),
  };
}

export function finishInteraction<Recipe>(
  state: EditorState<Recipe>,
  group: InteractionGroup<Recipe>,
  candidate: Recipe,
): EditorState<Recipe> {
  const active = activeGroup(state, group);
  if (active === undefined) return state;

  let afterRecipe: Recipe;
  try {
    afterRecipe = cloneRecipe(candidate);
  } catch {
    return state;
  }
  const afterCanonicalBytes = safeCanonicalBytesFor(state, afterRecipe);
  if (afterCanonicalBytes === undefined) return state;
  const transaction: Omit<DesignTransaction<Recipe>, 'id'> = {
    kind: active.commandKind,
    beforeRecipe: active.beforeRecipe,
    afterRecipe,
    beforeCanonicalBytes: active.beforeCanonicalBytes,
    afterCanonicalBytes,
    summary: active.commandKind,
  };
  const history = appendTransaction(clearOpenInteraction(state.history), transaction);
  return { currentRecipe: cloneRecipe(afterRecipe), history };
}

export function cancelInteraction<Recipe>(
  state: EditorState<Recipe>,
  group: InteractionGroup<Recipe>,
): EditorState<Recipe> {
  const active = activeGroup(state, group);
  if (active === undefined) return state;
  return {
    currentRecipe: cloneRecipe(active.beforeRecipe),
    history: clearOpenInteraction(state.history),
  };
}

export function commitDesignCommand<Recipe, Diagnostic = unknown>(
  state: EditorState<Recipe>,
  command: DesignCommand<Recipe, Diagnostic>,
): EditorState<Recipe> {
  // An open gesture owns the current draft until release/cancel.  A separate
  // command cannot safely splice into that group, so it is a no-op boundary.
  if (state.history.openInteraction !== undefined) return state;

  let result: CandidateResult<Recipe, Diagnostic>;
  try {
    result = command.prepare(cloneRecipe(state.currentRecipe));
  } catch {
    return state;
  }
  if (
    result === null ||
    typeof result !== 'object' ||
    (result.kind !== 'success' && result.kind !== 'failure')
  ) {
    return state;
  }
  if (result.kind !== 'success') return state;
  if (!isCanonicalBytes(result.canonicalBytes)) return state;

  let afterRecipe: Recipe;
  try {
    afterRecipe = cloneRecipe(result.candidate);
  } catch {
    return state;
  }
  let afterCanonicalBytes: Uint8Array | undefined;
  try {
    afterCanonicalBytes = cloneCanonicalBytes(result.canonicalBytes);
  } catch {
    return state;
  }
  if (afterCanonicalBytes === undefined) return state;
  const beforeCanonicalBytes = safeCanonicalBytesFor(
    state,
    state.currentRecipe,
    command.canonicalize,
  );
  if (beforeCanonicalBytes === undefined) return state;
  const beforeRecipe = cloneRecipe(state.currentRecipe);
  const transaction: Omit<DesignTransaction<Recipe>, 'id'> = {
    kind: command.kind,
    beforeRecipe,
    afterRecipe,
    beforeCanonicalBytes,
    afterCanonicalBytes,
    summary: result.summary ?? command.summary ?? command.kind,
  };
  const history = appendTransaction(state.history, transaction);
  return { currentRecipe: cloneRecipe(afterRecipe), history };
}

export function undo<Recipe>(state: EditorState<Recipe>): EditorState<Recipe> {
  if (state.history.openInteraction !== undefined || state.history.pointer <= 0) return state;
  const index = state.history.pointer - 1;
  const entry = state.history.entries[index];
  if (entry === undefined) return state;
  return {
    currentRecipe: cloneRecipe(entry.beforeRecipe),
    history: updateHistory(state.history, { pointer: index }),
  };
}

export function redo<Recipe>(state: EditorState<Recipe>): EditorState<Recipe> {
  if (
    state.history.openInteraction !== undefined ||
    state.history.pointer >= state.history.entries.length
  ) {
    return state;
  }
  const entry = state.history.entries[state.history.pointer];
  if (entry === undefined) return state;
  return {
    currentRecipe: cloneRecipe(entry.afterRecipe),
    history: updateHistory(state.history, { pointer: state.history.pointer + 1 }),
  };
}

function activeGroup<Recipe>(
  state: EditorState<Recipe>,
  requested: InteractionGroup<Recipe>,
): InteractionGroup<Recipe> | undefined {
  const active = state.history.openInteraction;
  if (active === undefined || active.id !== requested.id) return undefined;
  return active;
}

function canonicalBytesFor<Recipe>(
  state: EditorState<Recipe>,
  recipe: Recipe,
  override?: RecipeCanonicalizer<Recipe>,
): Uint8Array {
  const serializer = override ?? getStateCanonicalizer(state);
  return cloneCanonicalBytes(serializer?.(cloneRecipe(recipe)) ?? fallbackCanonicalBytes(recipe));
}

function safeCanonicalBytesFor<Recipe>(
  state: EditorState<Recipe>,
  recipe: Recipe,
  override?: RecipeCanonicalizer<Recipe>,
): Uint8Array | undefined {
  try {
    return canonicalBytesFor(state, recipe, override);
  } catch {
    return undefined;
  }
}

function cloneInteractionGroup<Recipe>(group: InteractionGroup<Recipe>): InteractionGroup<Recipe> {
  return {
    ...group,
    beforeRecipe: cloneRecipe(group.beforeRecipe),
    latestCandidate: cloneRecipe(group.latestCandidate),
    changedControlKeys: new Set(group.changedControlKeys),
    beforeCanonicalBytes: cloneCanonicalBytes(group.beforeCanonicalBytes),
    latestCanonicalBytes: cloneCanonicalBytes(group.latestCanonicalBytes),
  };
}

function rejectedInteractionGroup<Recipe>(
  commandKind: string,
  recipe: Recipe,
): InteractionGroup<Recipe> {
  const snapshot = cloneRecipe(recipe);
  const emptyBytes = new Uint8Array(0);
  return {
    id: 'rejected-interaction',
    commandKind,
    beforeRecipe: snapshot,
    latestCandidate: cloneRecipe(snapshot),
    changedControlKeys: new Set<string>(),
    beforeCanonicalBytes: emptyBytes,
    latestCanonicalBytes: new Uint8Array(0),
  };
}

function getStateCanonicalizer<Recipe>(
  state: EditorState<Recipe>,
): RecipeCanonicalizer<Recipe> | undefined {
  const value = (
    state.history as DesignHistory<Recipe> & {
      readonly canonicalize?: RecipeCanonicalizer<Recipe>;
    }
  ).canonicalize;
  return value;
}

// Re-export the command/history contracts from the reducer seam for consumers
// that intentionally depend on one framework-independent editor entry point.
export type {
  CandidateFailure,
  CandidateResult,
  CandidateSuccess,
  CanonicalBytes,
  DesignCommand,
  RecipeCanonicalizer,
} from './commands';
export type { DesignHistory, DesignTransaction, InteractionGroup } from './history';
