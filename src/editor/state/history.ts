import { cloneCanonicalBytes, cloneRecipe, type CanonicalBytes } from './commands';

export const DEFAULT_HISTORY_LIMIT = 100;

export type DesignTransaction<Recipe> = {
  readonly id: string;
  readonly kind: string;
  readonly beforeRecipe: Recipe;
  readonly afterRecipe: Recipe;
  readonly beforeCanonicalBytes: CanonicalBytes;
  readonly afterCanonicalBytes: CanonicalBytes;
  readonly summary: string;
};

export type InteractionGroup<Recipe, ControlKey extends string = string> = {
  readonly id: string;
  readonly commandKind: string;
  readonly beforeRecipe: Recipe;
  readonly latestCandidate: Recipe;
  readonly changedControlKeys: ReadonlySet<ControlKey>;
  readonly beforeCanonicalBytes: CanonicalBytes;
  readonly latestCanonicalBytes: CanonicalBytes;
};

export type DesignHistory<Recipe> = {
  readonly entries: readonly DesignTransaction<Recipe>[];
  /** Number of entries currently applied; 0 is the initial recipe. */
  readonly pointer: number;
  readonly openInteraction?: InteractionGroup<Recipe>;
  readonly historyLimit: number;
  readonly nextTransactionId: number;
  readonly nextInteractionId: number;
};

type HistoryPatch<Recipe> = Partial<Omit<DesignHistory<Recipe>, 'openInteraction'>> & {
  readonly openInteraction?: InteractionGroup<Recipe> | undefined;
};

/** Copy history while retaining its non-enumerable serializer hook. */
export function updateHistory<Recipe>(
  history: DesignHistory<Recipe>,
  patch: HistoryPatch<Recipe>,
): DesignHistory<Recipe> {
  const next = { ...history, ...patch } as DesignHistory<Recipe>;
  const descriptor = Object.getOwnPropertyDescriptor(history, 'canonicalize');
  if (descriptor !== undefined) Object.defineProperty(next, 'canonicalize', descriptor);
  return next;
}

export function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT;
  return Math.max(DEFAULT_HISTORY_LIMIT, Math.floor(value));
}

export function createHistory<Recipe>(historyLimit?: number): DesignHistory<Recipe> {
  return {
    entries: [],
    pointer: 0,
    historyLimit: normalizeHistoryLimit(historyLimit),
    nextTransactionId: 1,
    nextInteractionId: 1,
  };
}

export function appendTransaction<Recipe>(
  history: DesignHistory<Recipe>,
  transaction: Omit<DesignTransaction<Recipe>, 'id'>,
): DesignHistory<Recipe> {
  // A new finalized command after Undo invalidates the redo tail before the
  // command becomes visible.  Clone every snapshot so caller-owned drafts
  // cannot mutate history after commit.
  const base = clearOpenInteraction(history);
  const retained = base.entries.slice(0, base.pointer);
  const committed: DesignTransaction<Recipe> = {
    id: `transaction-${base.nextTransactionId}`,
    kind: transaction.kind,
    beforeRecipe: cloneRecipe(transaction.beforeRecipe),
    afterRecipe: cloneRecipe(transaction.afterRecipe),
    beforeCanonicalBytes: cloneCanonicalBytes(transaction.beforeCanonicalBytes),
    afterCanonicalBytes: cloneCanonicalBytes(transaction.afterCanonicalBytes),
    summary: transaction.summary,
  };
  const bounded = [...retained, committed];
  const trimmed =
    bounded.length > base.historyLimit
      ? bounded.slice(bounded.length - base.historyLimit)
      : bounded;

  return updateHistory(base, {
    entries: trimmed,
    pointer: trimmed.length,
    nextTransactionId: base.nextTransactionId + 1,
  });
}

export function withOpenInteraction<Recipe>(
  history: DesignHistory<Recipe>,
  group: InteractionGroup<Recipe>,
): DesignHistory<Recipe> {
  return updateHistory(history, { openInteraction: group });
}

export function clearOpenInteraction<Recipe>(
  history: DesignHistory<Recipe>,
): DesignHistory<Recipe> {
  const next = updateHistory(history, {});
  Reflect.deleteProperty(next, 'openInteraction');
  return next;
}
