/**
 * Framework-independent editor transaction and preview boundaries.
 *
 * These contracts intentionally use generic recipe/command/profile parameters.
 * The canonical domain modules supply those parameters once implemented; this
 * file does not define a second recipe or render model.
 */

export type CommitFailureStage = 'derive' | 'normalize' | 'validate' | 'canonicalize';

export type PersistenceStatusLike<Hash extends string = string> =
  | {
      readonly kind: 'cached';
      readonly currentRecipeHash: Hash;
      readonly cachedRecipeHash: Hash;
    }
  | {
      readonly kind: 'not-cached';
      readonly currentRecipeHash: Hash;
      readonly cachedRecipeHash?: Hash;
      readonly diagnostic: {
        readonly code: string;
        readonly message: string;
        readonly recovery: string;
      };
      readonly canRetry: true;
      readonly canExportRecipe: true;
    };

export interface HistoryCommit {
  readonly transactionId?: string;
  readonly pointer: number;
  readonly length: number;
  /** False for a pause promotion: the open interaction is not yet an entry. */
  readonly finalized: boolean;
}

export type CommitResult<
  Recipe = unknown,
  Hash extends string = string,
  Diagnostic = unknown,
  PersistenceStatus extends PersistenceStatusLike<Hash> = PersistenceStatusLike<Hash>,
> =
  | {
      readonly ok: true;
      readonly kind: 'committed';
      readonly recipe: Recipe;
      readonly recipeHash: Hash;
      readonly history: HistoryCommit;
      /** Cache failure is represented here as not-cached, after commit. */
      readonly persistence: PersistenceStatus;
    }
  | {
      readonly ok: false;
      readonly kind: 'rejected';
      readonly stage: CommitFailureStage;
      readonly diagnostics: readonly Diagnostic[];
    };

/** Open interaction state is ephemeral and never enters a cache envelope. */
export interface InteractionGroup<Recipe = unknown, ControlKey extends string = string> {
  readonly id: string;
  readonly commandKind: string;
  readonly beforeRecipe: Recipe;
  readonly latestCandidate: Recipe;
  readonly changedControlKeys: ReadonlySet<ControlKey>;
}

/**
 * Transaction coordinator boundary.  Implementations must derive, normalize,
 * validate, and canonicalize before any method can return `committed`; after
 * that return, cache persistence is best effort and cannot undo recipe/history
 * state.  A promotion keeps `history.finalized === false` until finish.
 */
export interface TransactionPort<
  Recipe = unknown,
  Command = unknown,
  Hash extends string = string,
  Diagnostic = unknown,
  PersistenceStatus extends PersistenceStatusLike<Hash> = PersistenceStatusLike<Hash>,
> {
  commitDesignCommand(command: Command): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
  beginInteraction(commandKind: string): InteractionGroup<Recipe>;
  promoteInteraction(
    group: InteractionGroup<Recipe>,
    candidate: Recipe,
  ): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
  finishInteraction(
    group: InteractionGroup<Recipe>,
    candidate: Recipe,
  ): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
  cancelInteraction(
    group: InteractionGroup<Recipe>,
  ): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
  undo(): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
  redo(): CommitResult<Recipe, Hash, Diagnostic, PersistenceStatus>;
}

export type RenderFlushReason = 'pause' | 'release' | 'hidden' | 'explicit';

export interface PendingRender<Recipe = unknown, Profile = unknown> {
  readonly candidate: Recipe;
  readonly profile: Profile;
  readonly controlKey: string;
}

export type RenderFlushResult<Output = unknown, Diagnostic = unknown> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'applied'; readonly generation: number; readonly output: Output }
  | { readonly kind: 'stale'; readonly generation: number }
  | { readonly kind: 'failed'; readonly generation: number; readonly diagnostic: Diagnostic };

/**
 * Latest-only preview scheduler port.  Its implementation owns the sampling
 * timer/frame queue and may abort work, but correctness comes from the
 * generation check represented by `RenderFlushResult`, not cancellation alone.
 */
export interface RenderSchedulerPort<
  Recipe = unknown,
  Profile = unknown,
  Output = unknown,
  Diagnostic = unknown,
> {
  beginInteraction(beforeRecipe: Recipe): void;
  submit(input: PendingRender<Recipe, Profile>): number;
  flushLatest(reason?: RenderFlushReason): Promise<RenderFlushResult<Output, Diagnostic>>;
  cancelInteraction(): void;
  dispose(): void;
}
