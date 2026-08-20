/**
 * Public, framework-neutral editor store.
 *
 * This module is intentionally a thin composition layer.  The reducer owns
 * recipe/history transitions and the interaction coordinator owns cache and
 * preview transaction policy; this store only exposes a subscription-friendly
 * snapshot and binds the operations into one editor session.
 */

import type {
  CommitResult,
  CommitFailureStage,
  InteractionGroup,
  RenderFlushReason,
  RenderFlushResult,
  RenderSchedulerPort,
} from './ports';
import {
  cloneRecipe,
  type CanonicalBytes,
  type DesignCommand,
  type RecipeCanonicalizer,
} from './commands';
import {
  createInteractionCoordinator,
  type CandidatePipeline,
  type HashRecipe,
  type InteractionCoordinator,
  type InteractionCoordinatorSnapshot,
  type InteractionFlushResult,
  type CachePort,
  type PersistenceStatus,
  type ReducerInteractionGroup,
} from '../interactions/interactionCoordinator';

export type EditorStoreOptions<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Profile = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
> = CandidatePipeline<Recipe, Diagnostic> & {
  readonly historyLimit?: number;
  readonly canonicalize?: RecipeCanonicalizer<Recipe>;
  readonly canonicalBytes?: RecipeCanonicalizer<Recipe>;
  readonly cache?: CachePort<Recipe, Hash>;
  readonly hashRecipe?: HashRecipe<Recipe, Hash>;
  readonly hash?: HashRecipe<Recipe, Hash>;
  readonly initialPersistence?: PersistenceStatus<Hash>;
  readonly scheduler?: RenderSchedulerPort<Recipe, Profile, Output, RenderDiagnostic>;
  readonly onPreviewApplied?: (candidate: Recipe, output: Output, generation: number) => void;
};

export type EditorStoreSnapshot<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
> = InteractionCoordinatorSnapshot<Recipe, Hash, Diagnostic>;

export type EditorStore<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Profile = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
> = {
  readonly getSnapshot: () => EditorStoreSnapshot<Recipe, Hash, Diagnostic>;
  readonly getState: () => EditorStoreSnapshot<Recipe, Hash, Diagnostic>['state'];
  readonly getCurrentRecipe: () => Recipe;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispatch: (
    command: DesignCommand<Recipe, Diagnostic>,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly commitDesignCommand: (
    command: DesignCommand<Recipe, Diagnostic>,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly beginInteraction: (commandKind: string) => ReducerInteractionGroup<Recipe>;
  readonly promoteInteraction: (
    group: InteractionGroup<Recipe>,
    candidate: Recipe,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly finishInteraction: (
    group: InteractionGroup<Recipe>,
    candidate: Recipe,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly cancelInteraction: (
    group: InteractionGroup<Recipe>,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly undo: () => CommitResult<Recipe, Hash, Diagnostic>;
  readonly redo: () => CommitResult<Recipe, Hash, Diagnostic>;
  readonly retryLatestCache: () => CommitResult<Recipe, Hash, Diagnostic>;
  readonly submitPreview: (
    candidate: Recipe,
    profile: Profile,
    controlKey: string,
  ) => number | CommitResult<Recipe, Hash, Diagnostic>;
  readonly flushLatest: (
    reason?: RenderFlushReason,
  ) => Promise<InteractionFlushResult<Recipe, Hash, Diagnostic, Output, RenderDiagnostic>>;
  readonly cancelPreview: () => void;
  readonly dispose: () => void;
};

/**
 * Copy a value at the public store boundary without serialising it.
 *
 * Recipes are normally structured-cloneable JSON-shaped values, but the
 * editor seam is generic and callers may carry opaque values (for example a
 * function in a diagnostic or a custom class in a test recipe).  Prefer the
 * existing clone helper so Maps, Sets, typed arrays, Dates, and other
 * structured-clone values retain their runtime types.  The structural
 * fallback only runs for values containing something structuredClone cannot
 * copy, and preserves unsupported opaque leaves by reference while copying
 * every mutable container that surrounds them.
 */
function detachValue<Value>(value: Value): Value {
  try {
    return cloneRecipe(value);
  } catch {
    return detachUnsupportedValue(value, new WeakMap<object, unknown>()) as Value;
  }
}

function detachUnsupportedValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;

  if (value instanceof Uint8Array) {
    const copy = Uint8Array.from(value);
    seen.set(value, copy);
    return copy;
  }
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    seen.set(value, copy);
    return copy;
  }
  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    seen.set(value, copy);
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    for (const [key, child] of value) {
      copy.set(detachUnsupportedValue(key, seen), detachUnsupportedValue(child, seen));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(value, copy);
    for (const child of value) copy.add(detachUnsupportedValue(child, seen));
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const child of value) copy.push(detachUnsupportedValue(child, seen));
    return copy;
  }

  const copy = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>;
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if ('value' in descriptor) {
      descriptor.value = detachUnsupportedValue(descriptor.value, seen);
    }
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
}

function detachCanonicalBytes(bytes: CanonicalBytes): CanonicalBytes {
  // `cloneCanonicalBytes` intentionally rejects empty sequences, while a
  // rejected interaction is allowed to carry an empty byte snapshot.  Keep
  // the public type/contents here and always allocate a new backing store.
  return bytes instanceof Uint8Array ? Uint8Array.from(bytes) : Array.from(bytes);
}

function detachInteractionGroup<Recipe>(
  group: NonNullable<EditorStoreSnapshot<Recipe>['state']['history']['openInteraction']>,
): NonNullable<EditorStoreSnapshot<Recipe>['state']['history']['openInteraction']> {
  return {
    ...(detachValue(group) as NonNullable<
      EditorStoreSnapshot<Recipe>['state']['history']['openInteraction']
    >),
    beforeRecipe: detachValue(group.beforeRecipe),
    latestCandidate: detachValue(group.latestCandidate),
    changedControlKeys: new Set(group.changedControlKeys),
    beforeCanonicalBytes: detachCanonicalBytes(group.beforeCanonicalBytes),
    latestCanonicalBytes: detachCanonicalBytes(group.latestCanonicalBytes),
  };
}

function detachHistory<Recipe>(
  history: EditorStoreSnapshot<Recipe>['state']['history'],
): EditorStoreSnapshot<Recipe>['state']['history'] {
  const detached = {
    ...(detachValue(history) as EditorStoreSnapshot<Recipe>['state']['history']),
    entries: history.entries.map((entry) => ({
      ...(detachValue(entry) as (typeof history.entries)[number]),
      beforeRecipe: detachValue(entry.beforeRecipe),
      afterRecipe: detachValue(entry.afterRecipe),
      beforeCanonicalBytes: detachCanonicalBytes(entry.beforeCanonicalBytes),
      afterCanonicalBytes: detachCanonicalBytes(entry.afterCanonicalBytes),
    })),
    ...(history.openInteraction === undefined
      ? {}
      : { openInteraction: detachInteractionGroup(history.openInteraction) }),
  } as EditorStoreSnapshot<Recipe>['state']['history'];

  // The reducer keeps the optional canonicalizer as a non-enumerable
  // property. Preserve that opaque operation on the detached history while
  // never sharing any mutable history containers or recipe snapshots.
  const canonicalizer = Object.getOwnPropertyDescriptor(history, 'canonicalize');
  if (canonicalizer !== undefined) Object.defineProperty(detached, 'canonicalize', canonicalizer);
  return detached;
}

function detachPersistence<Hash extends string>(
  persistence: PersistenceStatus<Hash>,
): PersistenceStatus<Hash> {
  if (persistence.kind === 'cached') return { ...persistence };
  return {
    ...persistence,
    diagnostic: { ...persistence.diagnostic },
  };
}

function detachSnapshot<Recipe, Hash extends string, Diagnostic>(
  snapshot: EditorStoreSnapshot<Recipe, Hash, Diagnostic>,
): EditorStoreSnapshot<Recipe, Hash, Diagnostic> {
  const currentRecipe = detachValue(snapshot.state.currentRecipe);
  const history = detachHistory(snapshot.state.history);
  return {
    state: { currentRecipe, history },
    currentRecipe,
    history,
    previewRecipe: detachValue(snapshot.previewRecipe),
    persistence: detachPersistence(snapshot.persistence),
    epoch: snapshot.epoch,
    lastDiagnostics: snapshot.lastDiagnostics.map((diagnostic) => detachValue(diagnostic)),
  };
}

/** Create one editor session with immutable reducer transitions and observers. */
export function createEditorStore<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Profile = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
>(
  initialRecipe: Recipe,
  options: EditorStoreOptions<Recipe, Hash, Diagnostic, Profile, Output, RenderDiagnostic> = {},
): EditorStore<Recipe, Hash, Diagnostic, Profile, Output, RenderDiagnostic> {
  const coordinator: InteractionCoordinator<
    Recipe,
    Hash,
    Diagnostic,
    Profile,
    Output,
    RenderDiagnostic
  > = createInteractionCoordinator(initialRecipe, options);

  const getSnapshot = (): EditorStoreSnapshot<Recipe, Hash, Diagnostic> =>
    detachSnapshot(coordinator.getSnapshot());

  return {
    getSnapshot,
    getState: () => getSnapshot().state,
    getCurrentRecipe: () => getSnapshot().currentRecipe,
    subscribe: coordinator.subscribe,
    dispatch: coordinator.commitDesignCommand,
    commitDesignCommand: coordinator.commitDesignCommand,
    beginInteraction: coordinator.beginInteraction,
    promoteInteraction: coordinator.promoteInteraction,
    finishInteraction: coordinator.finishInteraction,
    cancelInteraction: coordinator.cancelInteraction,
    undo: coordinator.undo,
    redo: coordinator.redo,
    retryLatestCache: coordinator.retryLatestCache,
    submitPreview: coordinator.submitPreview,
    flushLatest: coordinator.flushLatest,
    cancelPreview: coordinator.cancelPreview,
    dispose: coordinator.dispose,
  };
}

export type {
  CandidatePipeline,
  HashRecipe,
  InteractionCoordinatorSnapshot,
  InteractionFlushResult,
};
export type { CommitFailureStage, RenderFlushResult };
