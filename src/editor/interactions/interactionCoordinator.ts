/**
 * Framework-independent transaction/interaction coordinator.
 *
 * The coordinator is deliberately a small adapter around the reducer.  It
 * does not know about React, browser storage, or a concrete recipe model.  A
 * domain caller supplies the normalizer/validator/canonicalizer and a cache
 * port.  This keeps the recipe itself as the only durable authority while
 * making cache persistence and preview gestures observable, best-effort
 * concerns.
 */

import {
  cloneCanonicalBytes,
  cloneRecipe,
  fallbackCanonicalBytes,
  isCanonicalBytes,
  type CanonicalBytes,
  type CandidateResult,
  type DesignCommand,
  type RecipeCanonicalizer,
} from '../state/commands';
import {
  beginInteraction as reducerBeginInteraction,
  cancelInteraction as reducerCancelInteraction,
  commitDesignCommand as reducerCommitDesignCommand,
  createEditorState,
  finishInteraction as reducerFinishInteraction,
  promoteInteraction as reducerPromoteInteraction,
  redo as reducerRedo,
  undo as reducerUndo,
  type EditorState,
} from '../state/reducer';
import type {
  CommitFailureStage,
  CommitResult,
  InteractionGroup as PortInteractionGroup,
  RenderFlushReason,
  RenderFlushResult,
  RenderSchedulerPort,
} from '../state/ports';

// Structural copies keep this coordinator independent from a persistence
// adapter. They intentionally match the public cache/envelope contracts
// without introducing a second recipe authority.
export type PersistenceDiagnostic = {
  readonly code:
    | 'cache-missing'
    | 'cache-corrupt'
    | 'cache-unsupported-version'
    | 'cache-invalid-envelope'
    | 'cache-unavailable'
    | 'cache-read-failed'
    | 'cache-write-failed'
    | 'cache-clear-failed'
    | 'quota-exceeded'
    | 'security-blocked'
    | 'unknown';
  readonly message: string;
  readonly recovery: string;
  readonly operation?: 'read' | 'write' | 'clear';
};

export type PersistenceStatus<Hash extends string> =
  | { readonly kind: 'cached'; readonly currentRecipeHash: Hash; readonly cachedRecipeHash: Hash }
  | {
      readonly kind: 'not-cached';
      readonly currentRecipeHash: Hash;
      readonly cachedRecipeHash?: Hash;
      readonly diagnostic: PersistenceDiagnostic;
      readonly canRetry: true;
      readonly canExportRecipe: true;
    };

type LatestRecipeCache<Recipe, Hash extends string> = {
  readonly cacheFormat: 'texture-lab-latest-v1';
  readonly recipeSchemaVersion: '0.1.0';
  readonly recipeHash: Hash;
  readonly recipe: Recipe;
};

export type CacheWriteResult<Hash extends string> =
  | { readonly kind: 'written'; readonly key: string; readonly recipeHash: Hash }
  | { readonly kind: 'cleared'; readonly key: string }
  | {
      readonly kind: 'failed';
      readonly key: string;
      readonly diagnostic: PersistenceDiagnostic;
      readonly priorCachePreserved: true;
    };

export type CachePort<Recipe, Hash extends string> = {
  readonly writeLatestCache: (envelope: LatestRecipeCache<Recipe, Hash>) => CacheWriteResult<Hash>;
};

const LATEST_RECIPE_CACHE_FORMAT = 'texture-lab-latest-v1' as const;
const LATEST_RECIPE_SCHEMA_VERSION = '0.1.0' as const;

export type ReducerInteractionGroup<Recipe> = import('../state/history').InteractionGroup<Recipe>;

export type CandidateValidation<Diagnostic = unknown> =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }
  | boolean
  | void;

export type CandidatePreparation<Recipe, Diagnostic = unknown> = {
  readonly candidate: Recipe;
  readonly canonicalBytes?: CanonicalBytes;
};

export type CandidatePipeline<Recipe, Diagnostic = unknown> = {
  /** Runs before validation. It must return a detached candidate. */
  readonly normalize?: (candidate: Recipe) => Recipe;
  /** Domain validation belongs here; the coordinator only interprets its result. */
  readonly validate?: (candidate: Recipe) => CandidateValidation<Diagnostic>;
  /** Optional complete preparation hook for callers with a domain service. */
  readonly prepareCandidate?: (
    candidate: Recipe,
  ) => CandidateResult<Recipe, Diagnostic> | CandidatePreparation<Recipe, Diagnostic>;
  readonly canonicalize?: RecipeCanonicalizer<Recipe>;
};

export type HashRecipe<Recipe, Hash extends string = string> = (
  recipe: Recipe,
  canonicalBytes: Uint8Array,
) => Hash;

export type InteractionCoordinatorOptions<
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
  /** Alias useful to adapters that hash canonical bytes directly. */
  readonly hash?: HashRecipe<Recipe, Hash>;
  readonly initialPersistence?: PersistenceStatus<Hash>;
  readonly scheduler?: RenderSchedulerPort<Recipe, Profile, Output, RenderDiagnostic>;
  readonly onPreviewApplied?: (candidate: Recipe, output: Output, generation: number) => void;
};

export type InteractionCoordinatorSnapshot<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
> = {
  readonly state: EditorState<Recipe>;
  readonly currentRecipe: Recipe;
  readonly history: EditorState<Recipe>['history'];
  readonly previewRecipe: Recipe;
  readonly persistence: PersistenceStatus<Hash>;
  readonly epoch: number;
  readonly lastDiagnostics: readonly Diagnostic[];
};

export type InteractionFlushResult<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
> = {
  readonly render?: RenderFlushResult<Output, RenderDiagnostic>;
  readonly commit?: CommitResult<Recipe, Hash, Diagnostic>;
};

export type InteractionCoordinator<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Profile = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
> = {
  readonly getSnapshot: () => InteractionCoordinatorSnapshot<Recipe, Hash, Diagnostic>;
  readonly getState: () => EditorState<Recipe>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly commitDesignCommand: (
    command: DesignCommand<Recipe, Diagnostic>,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly beginInteraction: (commandKind: string) => ReducerInteractionGroup<Recipe>;
  readonly promoteInteraction: (
    group: PortInteractionGroup<Recipe>,
    candidate: Recipe,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly finishInteraction: (
    group: PortInteractionGroup<Recipe>,
    candidate: Recipe,
  ) => CommitResult<Recipe, Hash, Diagnostic>;
  readonly cancelInteraction: (
    group: PortInteractionGroup<Recipe>,
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

type DiagnosticLike = {
  readonly code?: string;
  readonly message?: string;
  readonly recovery?: string;
};

const DEFAULT_CACHE_DIAGNOSTIC: PersistenceDiagnostic = {
  code: 'cache-unavailable',
  message: 'Latest-recipe cache is not available.',
  recovery: 'Continue editing or retry the cache when storage is available.',
  operation: 'write',
};

const CACHE_WRITE_FAILURE: PersistenceDiagnostic = {
  code: 'cache-write-failed',
  message: 'The latest recipe could not be cached.',
  recovery: 'Retry Cache or export Recipe JSON to preserve the current design.',
  operation: 'write',
};

const asDiagnostic = (value: unknown, fallback: PersistenceDiagnostic): PersistenceDiagnostic => {
  if (typeof value !== 'object' || value === null) return fallback;
  const candidate = value as DiagnosticLike;
  if (
    typeof candidate.code !== 'string' ||
    typeof candidate.message !== 'string' ||
    typeof candidate.recovery !== 'string'
  ) {
    return fallback;
  }
  return {
    code: candidate.code as PersistenceDiagnostic['code'],
    message: candidate.message,
    recovery: candidate.recovery,
    operation: 'write',
  };
};

const bytesHash = <Hash extends string>(bytes: Uint8Array): Hash =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') as Hash;

const rejection = <Recipe, Hash extends string, Diagnostic>(
  stage: CommitFailureStage,
  diagnostics: readonly Diagnostic[],
): CommitResult<Recipe, Hash, Diagnostic> => ({
  ok: false,
  kind: 'rejected',
  stage,
  diagnostics,
});

const successStatus = <Hash extends string>(hash: Hash): PersistenceStatus<Hash> => ({
  kind: 'cached',
  currentRecipeHash: hash,
  cachedRecipeHash: hash,
});

const validationDiagnostics = <Diagnostic>(
  value: CandidateValidation<Diagnostic>,
): readonly Diagnostic[] => {
  if (typeof value !== 'object' || value === null) return [];
  if ('ok' in value && value.ok === false) return value.diagnostics;
  return [];
};

/**
 * Creates a coordinator whose state transitions are synchronous.  Cache
 * adapters are intentionally invoked only after the reducer state changes.
 */
export function createInteractionCoordinator<
  Recipe,
  Hash extends string = string,
  Diagnostic = unknown,
  Profile = unknown,
  Output = unknown,
  RenderDiagnostic = unknown,
>(
  initialRecipe: Recipe,
  options: InteractionCoordinatorOptions<
    Recipe,
    Hash,
    Diagnostic,
    Profile,
    Output,
    RenderDiagnostic
  > = {},
): InteractionCoordinator<Recipe, Hash, Diagnostic, Profile, Output, RenderDiagnostic> {
  const canonicalizer = options.canonicalize ?? options.canonicalBytes;
  const stateOptions = {
    ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
    ...(canonicalizer === undefined ? {} : { canonicalize: canonicalizer }),
  };
  let state = createEditorState(initialRecipe, stateOptions);
  let previewRecipe = cloneRecipe(state.currentRecipe);
  let epoch = 0;
  let cacheToken = 0;
  let disposed = false;
  let cachedRecipeHash: Hash | undefined;
  let lastDiagnostics: readonly Diagnostic[] = [];
  let persistence: PersistenceStatus<Hash>;
  const listeners = new Set<() => void>();

  const hashFn: HashRecipe<Recipe, Hash> =
    options.hashRecipe ?? options.hash ?? ((_, bytes) => bytesHash<Hash>(bytes));

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Subscribers are observers and cannot interrupt a committed edit.
      }
    }
  };

  const currentCanonicalBytes = (recipe: Recipe): Uint8Array => {
    try {
      const bytes = canonicalizer?.(cloneRecipe(recipe)) ?? fallbackCanonicalBytes(recipe);
      return cloneCanonicalBytes(bytes);
    } catch {
      return fallbackCanonicalBytes(recipe) as Uint8Array;
    }
  };

  const initialHash = (() => {
    try {
      return hashFn(cloneRecipe(state.currentRecipe), currentCanonicalBytes(state.currentRecipe));
    } catch {
      return bytesHash<Hash>(currentCanonicalBytes(state.currentRecipe));
    }
  })();
  cachedRecipeHash =
    options.initialPersistence?.kind === 'cached'
      ? options.initialPersistence.cachedRecipeHash
      : undefined;
  persistence = options.initialPersistence ?? {
    kind: 'not-cached',
    currentRecipeHash: initialHash,
    ...(cachedRecipeHash === undefined ? {} : { cachedRecipeHash }),
    diagnostic: DEFAULT_CACHE_DIAGNOSTIC,
    canRetry: true,
    canExportRecipe: true,
  };

  const setState = (next: EditorState<Recipe>, nextPreview = next.currentRecipe): void => {
    state = next;
    previewRecipe = cloneRecipe(nextPreview);
    epoch += 1;
    notify();
  };

  const prepare = (
    candidate: Recipe,
    suppliedBytes?: CanonicalBytes,
  ): CandidateResult<Recipe, Diagnostic> => {
    let detached: Recipe;
    try {
      detached = cloneRecipe(candidate);
    } catch {
      return { kind: 'failure', diagnostics: [] };
    }

    if (options.prepareCandidate !== undefined) {
      try {
        const prepared = options.prepareCandidate(detached);
        if (
          typeof prepared === 'object' &&
          prepared !== null &&
          'kind' in prepared &&
          (prepared.kind === 'success' || prepared.kind === 'failure')
        ) {
          return prepared;
        }
        const preparedCandidate = prepared as CandidatePreparation<Recipe, Diagnostic>;
        detached = cloneRecipe(preparedCandidate.candidate);
        suppliedBytes = preparedCandidate.canonicalBytes ?? suppliedBytes;
      } catch {
        return { kind: 'failure', diagnostics: [] };
      }
    }
    if (options.normalize !== undefined) {
      try {
        detached = cloneRecipe(options.normalize(detached));
      } catch {
        return { kind: 'failure', diagnostics: [] };
      }
    }
    if (options.validate !== undefined) {
      try {
        const validation = options.validate(detached);
        const diagnostics = validationDiagnostics(validation);
        if (
          validation === false ||
          (typeof validation === 'object' &&
            validation !== null &&
            'ok' in validation &&
            validation.ok === false)
        ) {
          return { kind: 'failure', diagnostics };
        }
      } catch {
        return { kind: 'failure', diagnostics: [] };
      }
    }

    let bytes: CanonicalBytes;
    try {
      bytes =
        suppliedBytes ?? canonicalizer?.(cloneRecipe(detached)) ?? fallbackCanonicalBytes(detached);
    } catch {
      return { kind: 'failure', diagnostics: [] };
    }
    if (!isCanonicalBytes(bytes)) return { kind: 'failure', diagnostics: [] };
    return { kind: 'success', candidate: detached, canonicalBytes: cloneCanonicalBytes(bytes) };
  };

  const hashCandidate = (
    candidate: Recipe,
    canonicalBytes: CanonicalBytes,
  ): { readonly hash: Hash; readonly bytes: Uint8Array } | undefined => {
    try {
      const bytes = cloneCanonicalBytes(canonicalBytes);
      return { hash: hashFn(cloneRecipe(candidate), bytes), bytes };
    } catch {
      return undefined;
    }
  };

  const notCached = (hash: Hash, diagnostic: PersistenceDiagnostic): PersistenceStatus<Hash> => ({
    kind: 'not-cached',
    currentRecipeHash: hash,
    ...(cachedRecipeHash === undefined ? {} : { cachedRecipeHash }),
    diagnostic,
    canRetry: true,
    canExportRecipe: true,
  });

  const writeCache = (
    recipe: Recipe,
    hash: Hash,
    operationEpoch: number,
  ): PersistenceStatus<Hash> => {
    const token = ++cacheToken;
    if (options.cache === undefined) {
      persistence = notCached(hash, DEFAULT_CACHE_DIAGNOSTIC);
      notify();
      return persistence;
    }
    const envelope = {
      cacheFormat: LATEST_RECIPE_CACHE_FORMAT,
      recipeSchemaVersion: LATEST_RECIPE_SCHEMA_VERSION,
      recipeHash: hash,
      recipe: cloneRecipe(recipe),
    } as const;
    let result: CacheWriteResult<Hash>;
    try {
      result = options.cache.writeLatestCache(envelope);
    } catch (error) {
      if (operationEpoch !== epoch || token !== cacheToken) return persistence;
      persistence = notCached(hash, asDiagnostic(error, CACHE_WRITE_FAILURE));
      notify();
      return persistence;
    }
    const apply = (writeResult: CacheWriteResult<Hash>): PersistenceStatus<Hash> => {
      if (operationEpoch !== epoch || token !== cacheToken) return persistence;
      if (writeResult.kind === 'written') {
        cachedRecipeHash = writeResult.recipeHash;
        persistence = successStatus(writeResult.recipeHash);
      } else if (writeResult.kind === 'failed') {
        persistence = notCached(hash, writeResult.diagnostic);
      } else {
        persistence = notCached(hash, CACHE_WRITE_FAILURE);
      }
      notify();
      return persistence;
    };
    if (typeof (result as unknown as { then?: unknown }).then === 'function') {
      void Promise.resolve(result as unknown as Promise<CacheWriteResult<Hash>>).then(
        apply,
        (error: unknown) => {
          apply({
            kind: 'failed',
            key: 'texture-lab/latest-recipe/v1',
            diagnostic: asDiagnostic(error, CACHE_WRITE_FAILURE),
            priorCachePreserved: true,
          });
        },
      );
      persistence = notCached(hash, {
        ...CACHE_WRITE_FAILURE,
        message: 'Caching is pending; the committed recipe remains current.',
      });
      notify();
      return persistence;
    }
    return apply(result);
  };

  const resultFor = (
    recipe: Recipe,
    hash: Hash,
    finalized: boolean,
    status: PersistenceStatus<Hash>,
    transactionCreated = false,
  ): CommitResult<Recipe, Hash, Diagnostic> => ({
    ok: true,
    kind: 'committed',
    recipe: cloneRecipe(recipe),
    recipeHash: hash,
    history: {
      pointer: state.history.pointer,
      length: state.history.entries.length,
      finalized,
      ...(transactionCreated && state.history.entries.at(-1) !== undefined
        ? { transactionId: state.history.entries.at(-1)!.id }
        : {}),
    },
    persistence: status,
  });

  const commitPrepared = (
    candidate: Recipe,
    canonicalBytes: CanonicalBytes,
    next: EditorState<Recipe>,
    finalized: boolean,
    transactionCreated = false,
  ): CommitResult<Recipe, Hash, Diagnostic> => {
    const hashed = hashCandidate(candidate, canonicalBytes);
    if (hashed === undefined) return rejection('canonicalize', []);
    const operationEpoch = epoch + 1;
    setState(next, candidate);
    const status = writeCache(candidate, hashed.hash, operationEpoch);
    return resultFor(candidate, hashed.hash, finalized, status, transactionCreated);
  };

  const commitCommand = (
    command: DesignCommand<Recipe, Diagnostic>,
  ): CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed || state.history.openInteraction !== undefined) return rejection('derive', []);
    let result: CandidateResult<Recipe, Diagnostic>;
    try {
      result = command.prepare(cloneRecipe(state.currentRecipe));
    } catch {
      return rejection('derive', []);
    }
    if (result.kind !== 'success') {
      lastDiagnostics = result.diagnostics;
      return rejection('derive', result.diagnostics);
    }
    // When the coordinator has a domain canonicalizer, it is the final byte
    // authority. A command-provided byte sequence is only a fallback for the
    // generic reducer seam where no coordinator pipeline was installed.
    const prepared = prepare(
      result.candidate,
      canonicalizer === undefined ? result.canonicalBytes : undefined,
    );
    if (prepared.kind !== 'success') {
      lastDiagnostics = prepared.diagnostics;
      return rejection('validate', prepared.diagnostics);
    }
    const preparedCommand: DesignCommand<Recipe, Diagnostic> = {
      ...command,
      prepare: () => prepared,
      ...(canonicalizer === undefined ? {} : { canonicalize: canonicalizer }),
    };
    const next = reducerCommitDesignCommand(state, preparedCommand);
    if (next === state) return rejection('canonicalize', []);
    return commitPrepared(prepared.candidate, prepared.canonicalBytes, next, true, true);
  };

  const begin = (commandKind: string): ReducerInteractionGroup<Recipe> => {
    if (disposed) {
      const begun = reducerBeginInteraction(state, commandKind);
      return begun.group;
    }
    const wasOpen = state.history.openInteraction !== undefined;
    const begun = reducerBeginInteraction(state, commandKind);
    if (begun.state !== state) {
      setState(begun.state, begun.state.currentRecipe);
      if (!wasOpen) options.scheduler?.beginInteraction(cloneRecipe(state.currentRecipe));
    }
    return begun.group;
  };

  const interactionCommit = (
    group: PortInteractionGroup<Recipe>,
    candidate: Recipe,
    mode: 'pause' | 'release',
  ): CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed) return rejection('derive', []);
    const prepared = prepare(candidate);
    if (prepared.kind !== 'success') {
      lastDiagnostics = prepared.diagnostics;
      return rejection('validate', prepared.diagnostics);
    }
    const reducerGroup = group as ReducerInteractionGroup<Recipe>;
    const next =
      mode === 'pause'
        ? reducerPromoteInteraction(state, reducerGroup, prepared.candidate)
        : reducerFinishInteraction(state, reducerGroup, prepared.candidate);
    if (next === state) return rejection('derive', []);
    return commitPrepared(
      prepared.candidate,
      prepared.canonicalBytes,
      next,
      mode === 'release',
      mode === 'release',
    );
  };

  const cancel = (group: PortInteractionGroup<Recipe>): CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed) return rejection('derive', []);
    const next = reducerCancelInteraction(state, group as ReducerInteractionGroup<Recipe>);
    if (next === state) return rejection('derive', []);
    const bytes = currentCanonicalBytes(next.currentRecipe);
    const hashed = hashCandidate(next.currentRecipe, bytes);
    if (hashed === undefined) return rejection('canonicalize', []);
    const operationEpoch = epoch + 1;
    setState(next, next.currentRecipe);
    latestPreview = undefined;
    options.scheduler?.cancelInteraction();
    const status = writeCache(next.currentRecipe, hashed.hash, operationEpoch);
    return resultFor(next.currentRecipe, hashed.hash, true, status);
  };

  const moveHistory = (direction: 'undo' | 'redo'): CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed || state.history.openInteraction !== undefined) return rejection('derive', []);
    const targetIndex = direction === 'undo' ? state.history.pointer - 1 : state.history.pointer;
    const target = state.history.entries[targetIndex];
    if (target === undefined) return rejection('derive', []);
    const candidate = direction === 'undo' ? target.beforeRecipe : target.afterRecipe;
    const bytes = direction === 'undo' ? target.beforeCanonicalBytes : target.afterCanonicalBytes;
    const hashed = hashCandidate(candidate, bytes);
    if (hashed === undefined) return rejection('canonicalize', []);
    const next = direction === 'undo' ? reducerUndo(state) : reducerRedo(state);
    if (next === state) return rejection('derive', []);
    const operationEpoch = epoch + 1;
    setState(next, next.currentRecipe);
    const status = writeCache(next.currentRecipe, hashed.hash, operationEpoch);
    return resultFor(next.currentRecipe, hashed.hash, true, status);
  };

  let latestPreview:
    | {
        readonly candidate: Recipe;
        readonly epoch: number;
        readonly generation: number;
        readonly group: ReducerInteractionGroup<Recipe>;
      }
    | undefined;

  const submitPreview = (
    candidate: Recipe,
    profile: Profile,
    controlKey: string,
  ): number | CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed || options.scheduler === undefined) return rejection('derive', []);
    const group = state.history.openInteraction;
    if (group === undefined) return rejection('derive', []);
    const prepared = prepare(candidate);
    if (prepared.kind !== 'success') {
      lastDiagnostics = prepared.diagnostics;
      return rejection('validate', prepared.diagnostics);
    }
    previewRecipe = cloneRecipe(prepared.candidate);
    const generation = options.scheduler.submit({
      candidate: cloneRecipe(prepared.candidate),
      profile,
      controlKey,
    });
    latestPreview = { candidate: cloneRecipe(prepared.candidate), epoch, generation, group };
    notify();
    return generation;
  };

  const flushLatest = async (
    reason: RenderFlushReason = 'explicit',
  ): Promise<InteractionFlushResult<Recipe, Hash, Diagnostic, Output, RenderDiagnostic>> => {
    if (options.scheduler === undefined) return {};
    const token = epoch;
    const pending = latestPreview;
    const render = await options.scheduler.flushLatest(reason);
    if (pending === undefined || token !== epoch || pending.epoch !== token) return { render };
    if (render.kind !== 'applied') return { render };
    options.onPreviewApplied?.(cloneRecipe(pending.candidate), render.output, render.generation);
    const commit =
      reason === 'pause'
        ? interactionCommit(pending.group, pending.candidate, 'pause')
        : interactionCommit(pending.group, pending.candidate, 'release');
    if (commit.ok) latestPreview = undefined;
    return { render, commit };
  };

  const cancelPreview = (): void => {
    epoch += 1;
    latestPreview = undefined;
    options.scheduler?.cancelInteraction();
    previewRecipe = cloneRecipe(state.currentRecipe);
    notify();
  };

  const retry = (): CommitResult<Recipe, Hash, Diagnostic> => {
    if (disposed) return rejection('derive', []);
    const bytes = currentCanonicalBytes(state.currentRecipe);
    const hashed = hashCandidate(state.currentRecipe, bytes);
    if (hashed === undefined) return rejection('canonicalize', []);
    const status = writeCache(state.currentRecipe, hashed.hash, epoch);
    return resultFor(
      state.currentRecipe,
      hashed.hash,
      state.history.openInteraction === undefined,
      status,
    );
  };

  const getSnapshot = (): InteractionCoordinatorSnapshot<Recipe, Hash, Diagnostic> => ({
    state,
    currentRecipe: state.currentRecipe,
    history: state.history,
    previewRecipe,
    persistence,
    epoch,
    lastDiagnostics,
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    epoch += 1;
    latestPreview = undefined;
    options.scheduler?.dispose();
    listeners.clear();
  };

  return {
    getSnapshot,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commitDesignCommand: commitCommand,
    beginInteraction: begin,
    promoteInteraction: (group, candidate) => interactionCommit(group, candidate, 'pause'),
    finishInteraction: (group, candidate) => interactionCommit(group, candidate, 'release'),
    cancelInteraction: cancel,
    undo: () => moveHistory('undo'),
    redo: () => moveHistory('redo'),
    retryLatestCache: retry,
    submitPreview,
    flushLatest,
    cancelPreview,
    dispose,
  };
}

export type { CommitResult };
