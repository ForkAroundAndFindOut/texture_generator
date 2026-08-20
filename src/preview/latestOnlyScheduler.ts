/** Local structural copies keep the preview layer independent of editor and
 * persistence implementations.  They intentionally match the shared ports
 * in `editor/state/ports.ts` and `persistence/ports.ts`. */
type ClockHandle = number | string | object;
type FrameHandle = ClockHandle;
export type FrameCallback = (timestampMs: number) => void;

export interface ClockPort {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ClockHandle;
  clearTimeout(handle: ClockHandle): void;
  requestAnimationFrame(callback: FrameCallback): FrameHandle;
  cancelAnimationFrame(handle: FrameHandle): void;
}

interface PendingRender<Recipe = unknown, Profile = unknown> {
  readonly candidate: Recipe;
  readonly profile: Profile;
  readonly controlKey: string;
}

type RenderFlushReason = 'pause' | 'release' | 'hidden' | 'explicit';

type RenderFlushResult<Output = unknown, Diagnostic = unknown> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'applied'; readonly generation: number; readonly output: Output }
  | { readonly kind: 'stale'; readonly generation: number }
  | { readonly kind: 'failed'; readonly generation: number; readonly diagnostic: Diagnostic };

interface RenderSchedulerPort<
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

/**
 * The scheduler deliberately knows nothing about a renderer or the DOM.  A
 * browser adapter supplies the clock and the render function, while the
 * generation check below remains the source of truth for newest-value
 * correctness (an abort is only an optimisation).
 */
export interface LatestOnlyRenderRequest<Recipe = unknown, Profile = unknown> extends PendingRender<
  Recipe,
  Profile
> {
  readonly generation: number;
  readonly signal?: { readonly aborted: boolean };
}

export interface LatestOnlySchedulerOptions<Recipe = unknown, Profile = unknown, Output = unknown> {
  readonly clock: ClockPort;
  readonly render: (request: LatestOnlyRenderRequest<Recipe, Profile>) => Promise<Output>;
  readonly onApply?: (request: LatestOnlyRenderRequest<Recipe, Profile>, output: Output) => void;
  readonly samplingWindowMs?: number;
}

export interface LatestOnlySchedulerDebugState {
  readonly generation: number;
  readonly pendingByControl: ReadonlyMap<string, unknown>;
  readonly queuedFrame?: FrameHandle;
  readonly sampleDeadline?: number;
  readonly inFlight?: { readonly generation: number };
  readonly appliedPreviewGeneration: number;
}

type AbortSignalLike = { readonly aborted: boolean };
type AbortControllerLike = { readonly signal: AbortSignalLike; abort(): void };

type RenderRecord<Recipe, Profile, Output, Diagnostic> = {
  readonly generation: number;
  readonly interactionVersion: number;
  readonly request: LatestOnlyRenderRequest<Recipe, Profile>;
  readonly promise: Promise<RenderFlushResult<Output, Diagnostic>>;
  readonly controller?: AbortControllerLike;
};

const abortController = (): AbortControllerLike | undefined => {
  const constructor = (globalThis as { readonly AbortController?: new () => AbortControllerLike })
    .AbortController;
  return constructor === undefined ? undefined : new constructor();
};

const normaliseWindow = (windowMs: number | undefined): number => {
  if (windowMs === undefined || !Number.isFinite(windowMs)) return 100;
  return Math.max(0, windowMs);
};

/**
 * Create a latest-only preview scheduler.
 *
 * At most one timer, one frame, one pending value per control key, and one
 * in-flight render are retained.  Every input receives a strictly increasing
 * generation; async completion can therefore be rejected even when a
 * renderer does not support cancellation.
 */
export function createLatestOnlyScheduler<
  Recipe = unknown,
  Profile = unknown,
  Output = unknown,
  Diagnostic = unknown,
>(
  options: LatestOnlySchedulerOptions<Recipe, Profile, Output>,
): RenderSchedulerPort<Recipe, Profile, Output, Diagnostic> & {
  readonly getDebugState: () => LatestOnlySchedulerDebugState;
} {
  const samplingWindowMs = normaliseWindow(options.samplingWindowMs);
  const pendingByControl = new Map<
    string,
    PendingRender<Recipe, Profile> & { readonly generation: number }
  >();

  let generation = 0;
  let interactionVersion = 0;
  let disposed = false;
  let timerHandle: ClockHandle | undefined;
  let sampleDeadline: number | undefined;
  let queuedFrame: FrameHandle | undefined;
  let inFlight: RenderRecord<Recipe, Profile, Output, Diagnostic> | undefined;
  let appliedPreviewGeneration = 0;

  const clearTimer = (): void => {
    if (timerHandle !== undefined) {
      options.clock.clearTimeout(timerHandle);
      timerHandle = undefined;
    }
    sampleDeadline = undefined;
  };

  const clearFrame = (): void => {
    if (queuedFrame !== undefined) {
      options.clock.cancelAnimationFrame(queuedFrame);
      queuedFrame = undefined;
    }
  };

  const abortInFlight = (): void => {
    inFlight?.controller?.abort();
    inFlight = undefined;
  };

  const latestPending = ():
    (PendingRender<Recipe, Profile> & { readonly generation: number }) | undefined => {
    let latest: (PendingRender<Recipe, Profile> & { readonly generation: number }) | undefined;
    for (const value of pendingByControl.values()) {
      if (latest === undefined || value.generation > latest.generation) latest = value;
    }
    return latest;
  };

  const isCurrent = (record: RenderRecord<Recipe, Profile, Output, Diagnostic>): boolean =>
    !disposed &&
    record.interactionVersion === interactionVersion &&
    record.generation === generation &&
    record === inFlight;

  const complete = (
    record: RenderRecord<Recipe, Profile, Output, Diagnostic>,
    output: Output,
  ): RenderFlushResult<Output, Diagnostic> => {
    if (!isCurrent(record)) {
      if (record === inFlight) inFlight = undefined;
      return { kind: 'stale', generation: record.generation };
    }
    inFlight = undefined;
    appliedPreviewGeneration = record.generation;
    try {
      options.onApply?.(record.request, output);
    } catch {
      // An observer cannot invalidate a successful render or leave the
      // scheduler's in-flight marker stuck.
    }
    return { kind: 'applied', generation: record.generation, output };
  };

  const fail = (
    record: RenderRecord<Recipe, Profile, Output, Diagnostic>,
    error: unknown,
  ): RenderFlushResult<Output, Diagnostic> => {
    if (!isCurrent(record)) {
      if (record === inFlight) inFlight = undefined;
      return { kind: 'stale', generation: record.generation };
    }
    inFlight = undefined;
    return { kind: 'failed', generation: record.generation, diagnostic: error as Diagnostic };
  };

  const startRender = (
    pending: PendingRender<Recipe, Profile> & { readonly generation: number },
  ): Promise<RenderFlushResult<Output, Diagnostic>> => {
    abortInFlight();
    const controller = abortController();
    const request: LatestOnlyRenderRequest<Recipe, Profile> = {
      candidate: pending.candidate,
      profile: pending.profile,
      controlKey: pending.controlKey,
      generation: pending.generation,
      ...(controller === undefined ? {} : { signal: controller.signal }),
    };

    let renderPromise: Promise<Output>;
    try {
      renderPromise = options.render(request);
    } catch (error) {
      renderPromise = Promise.reject(error);
    }

    // Promise.resolve also assimilates thenables from framework adapters while
    // keeping synchronous renderer throws on the same result path.
    let record!: RenderRecord<Recipe, Profile, Output, Diagnostic>;
    const resultPromise = Promise.resolve(renderPromise).then(
      (output) => complete(record, output),
      (error: unknown) => fail(record, error),
    );
    record = {
      generation: pending.generation,
      interactionVersion,
      request,
      promise: resultPromise,
      ...(controller === undefined ? {} : { controller }),
    };
    inFlight = record;
    return resultPromise;
  };

  const queueFrame = (): void => {
    if (disposed || queuedFrame !== undefined || pendingByControl.size === 0) return;
    queuedFrame = options.clock.requestAnimationFrame(() => {
      queuedFrame = undefined;
      if (disposed) return;
      const pending = latestPending();
      pendingByControl.clear();
      if (pending !== undefined) void startRender(pending);
    });
  };

  const sample = (): void => {
    timerHandle = undefined;
    sampleDeadline = undefined;
    queueFrame();
  };

  const scheduleSample = (): void => {
    if (
      disposed ||
      timerHandle !== undefined ||
      queuedFrame !== undefined ||
      pendingByControl.size === 0
    )
      return;
    sampleDeadline = options.clock.now() + samplingWindowMs;
    timerHandle = options.clock.setTimeout(sample, samplingWindowMs);
  };

  const flushLatest = async (
    _reason: RenderFlushReason = 'explicit',
  ): Promise<RenderFlushResult<Output, Diagnostic>> => {
    if (disposed) return { kind: 'idle' };
    clearTimer();
    clearFrame();
    const pending = latestPending();
    pendingByControl.clear();
    if (pending !== undefined) return startRender(pending);
    if (inFlight !== undefined) return inFlight.promise;
    return { kind: 'idle' };
  };

  const beginInteraction = (beforeRecipe: Recipe): void => {
    void beforeRecipe;
    interactionVersion += 1;
    clearTimer();
    clearFrame();
    abortInFlight();
    pendingByControl.clear();
  };

  const submit = (input: PendingRender<Recipe, Profile>): number => {
    if (disposed) return generation;
    generation += 1;
    pendingByControl.set(input.controlKey, { ...input, generation });
    scheduleSample();
    return generation;
  };

  const cancelInteraction = (): void => {
    if (disposed) return;
    interactionVersion += 1;
    clearTimer();
    clearFrame();
    abortInFlight();
    pendingByControl.clear();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    interactionVersion += 1;
    clearTimer();
    clearFrame();
    abortInFlight();
    pendingByControl.clear();
  };

  const scheduler = {
    beginInteraction,
    submit,
    flushLatest,
    cancelInteraction,
    dispose,
    getDebugState: (): LatestOnlySchedulerDebugState => ({
      generation,
      pendingByControl: new Map(pendingByControl),
      ...(queuedFrame === undefined ? {} : { queuedFrame }),
      ...(sampleDeadline === undefined ? {} : { sampleDeadline }),
      ...(inFlight === undefined ? {} : { inFlight: { generation: inFlight.generation } }),
      appliedPreviewGeneration,
    }),
  };

  return scheduler;
}
