import { describe, expect, test } from 'vitest';

import type {
  PendingRender,
  RenderFlushResult,
  RenderSchedulerPort,
} from '../../../src/editor/state/ports';
import {
  createLatestOnlyScheduler,
  type ClockPort,
  type FrameCallback,
} from '../../../src/preview/latestOnlyScheduler';

/**
 * T026 is intentionally failure-first.  The tests specify the narrow public
 * seam that T031 must implement:
 *
 * - `createLatestOnlyScheduler(options)` returns the framework-independent
 *   `RenderSchedulerPort` (`beginInteraction`, `submit`, `flushLatest`,
 *   `cancelInteraction`, and `dispose`).
 * - `options.clock` supplies deterministic timeouts and animation frames;
 *   `options.render` receives an immutable candidate/profile and its
 *   monotonic generation token and returns a promise for render output.
 * - `flushLatest('pause' | 'release' | 'explicit')` cancels pending sampling,
 *   renders the newest candidate, and returns a generation-checked result.
 * - A stale completion is observable only as a `stale` result internally; it
 *   must never reach `onApply` or replace the latest preview.
 *
 * The optional `getDebugState()` read-only seam is consumed through a local
 * structural cast so the scheduler does not need to publish a second mutable
 * state model.  It exists only to make queue bounds testable.
 */

type TestRecipe = {
  readonly revision: number;
  readonly control: number;
};

type TestProfile = {
  readonly kind: 'preview';
};

type TestOutput = {
  readonly revision: number;
};

type RenderRequest = PendingRender<TestRecipe, TestProfile> & {
  readonly generation: number;
  readonly signal?: AbortSignal;
};

type SchedulerOptions = {
  readonly clock: ClockPort;
  readonly render: (request: RenderRequest) => Promise<TestOutput>;
  readonly onApply?: (request: RenderRequest, output: TestOutput) => void;
  readonly samplingWindowMs?: number;
};

type DebugState = {
  readonly generation: number;
  readonly pendingByControl: ReadonlyMap<string, unknown>;
  readonly queuedFrame?: unknown;
  readonly sampleDeadline?: number;
  readonly inFlight?: { readonly generation: number };
  readonly appliedPreviewGeneration: number;
};

type Scheduler = RenderSchedulerPort<TestRecipe, TestProfile, TestOutput, string> & {
  readonly getDebugState?: () => DebugState;
};

const createScheduler = createLatestOnlyScheduler as unknown as (
  options: SchedulerOptions,
) => Scheduler;

const profile: TestProfile = { kind: 'preview' };

const recipe = (revision: number, control = revision): TestRecipe => ({
  revision,
  control,
});

class FakeClock implements ClockPort {
  private currentTime = 0;

  private nextHandle = 1;

  private readonly timers = new Map<
    number,
    { readonly due: number; readonly callback: () => void }
  >();

  private readonly frames = new Map<number, FrameCallback>();

  now(): number {
    return this.currentTime;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timers.set(handle, {
      due: this.currentTime + Math.max(0, delayMs),
      callback,
    });
    return handle;
  }

  clearTimeout(handle: number): void {
    this.timers.delete(handle);
  }

  requestAnimationFrame(callback: FrameCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.frames.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.frames.delete(handle);
  }

  advanceBy(milliseconds: number): void {
    const target = this.currentTime + milliseconds;

    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort(
          ([leftHandle, left], [rightHandle, right]) =>
            left.due - right.due || leftHandle - rightHandle,
        )[0];

      if (next === undefined) break;
      const [handle, timer] = next;
      this.currentTime = timer.due;
      this.timers.delete(handle);
      timer.callback();
    }

    this.currentTime = target;
  }

  flushAnimationFrames(): void {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.currentTime));
  }

  get pendingTimerCount(): number {
    return this.timers.size;
  }
}

type DeferredRender = {
  readonly request: RenderRequest;
  readonly promise: Promise<TestOutput>;
  readonly resolve: (output: TestOutput) => void;
  readonly reject: (error: unknown) => void;
};

const deferredRenderer = () => {
  const requests: RenderRequest[] = [];
  const deferred: DeferredRender[] = [];

  const render = (request: RenderRequest): Promise<TestOutput> => {
    let resolve!: (output: TestOutput) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<TestOutput>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    requests.push(request);
    deferred.push({ request, promise, resolve, reject });
    return promise;
  };

  return { deferred, render, requests };
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const debugState = (scheduler: Scheduler): DebugState => {
  const debug = scheduler.getDebugState;
  if (debug === undefined) {
    throw new Error(
      'T031 must expose a read-only getDebugState() seam for bounded-state assertions',
    );
  }
  return debug();
};

describe('T026 latest-only preview scheduler contract', () => {
  test('coalesces rapid values within 100 ms and renders only the newest generation', async () => {
    const clock = new FakeClock();
    const requests: RenderRequest[] = [];
    const applied: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: async (request) => {
        requests.push(request);
        return { revision: request.candidate.revision };
      },
      onApply: (request) => applied.push(request),
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    expect(scheduler.submit({ candidate: recipe(1), profile, controlKey: 'slider' })).toBe(1);
    clock.advanceBy(50);
    expect(scheduler.submit({ candidate: recipe(2), profile, controlKey: 'slider' })).toBe(2);

    clock.advanceBy(49);
    clock.flushAnimationFrames();
    await settle();
    expect(requests).toHaveLength(0);

    clock.advanceBy(1);
    expect(clock.pendingTimerCount).toBe(0);
    clock.flushAnimationFrames();
    await settle();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      candidate: recipe(2),
      controlKey: 'slider',
      generation: 2,
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.generation).toBe(2);
    expect(debugState(scheduler).appliedPreviewGeneration).toBe(2);

    scheduler.dispose();
  });

  test('keeps one pending snapshot per active key and one queued render batch', async () => {
    const clock = new FakeClock();
    const requests: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: async (request) => {
        requests.push(request);
        return { revision: request.candidate.revision };
      },
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    for (let revision = 1; revision <= 80; revision += 1) {
      scheduler.submit({
        candidate: recipe(revision),
        profile,
        controlKey: revision % 2 === 0 ? 'x' : 'y',
      });
      expect(debugState(scheduler).pendingByControl.size).toBeLessThanOrEqual(2);
      expect(clock.pendingTimerCount).toBeLessThanOrEqual(1);
    }

    const pending = debugState(scheduler);
    expect(pending.generation).toBe(80);
    expect(pending.pendingByControl.size).toBe(2);
    expect(pending.queuedFrame).toBeUndefined();

    clock.advanceBy(100);
    expect(debugState(scheduler).queuedFrame).toBeDefined();
    clock.flushAnimationFrames();
    await settle();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.generation).toBe(80);
    expect(debugState(scheduler).pendingByControl.size).toBe(0);
    expect(debugState(scheduler).inFlight).toBeUndefined();

    scheduler.dispose();
  });

  test('rejects stale asynchronous completion even when abort is unavailable', async () => {
    const clock = new FakeClock();
    const renderer = deferredRenderer();
    const applied: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: renderer.render,
      onApply: (request) => applied.push(request),
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    scheduler.submit({ candidate: recipe(1), profile, controlKey: 'drag' });
    clock.advanceBy(100);
    clock.flushAnimationFrames();
    await settle();
    expect(renderer.requests).toHaveLength(1);

    scheduler.submit({ candidate: recipe(2), profile, controlKey: 'drag' });
    const release = scheduler.flushLatest('release');
    await settle();
    expect(renderer.requests).toHaveLength(2);
    expect(renderer.requests[1]?.generation).toBe(2);

    renderer.deferred[0]?.resolve({ revision: 1 });
    await settle();
    expect(applied).toEqual([]);
    expect(debugState(scheduler).appliedPreviewGeneration).toBe(0);

    renderer.deferred[1]?.resolve({ revision: 2 });
    await expect(release).resolves.toMatchObject({ kind: 'applied', generation: 2 });
    expect(applied.map((request) => request.generation)).toEqual([2]);
    expect(debugState(scheduler).inFlight).toBeUndefined();

    scheduler.dispose();
  });

  test('pause flush promotes the latest candidate while keeping the interaction open', async () => {
    const clock = new FakeClock();
    const requests: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: async (request) => {
        requests.push(request);
        return { revision: request.candidate.revision };
      },
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    scheduler.submit({ candidate: recipe(3), profile, controlKey: 'drag' });
    const pause = await scheduler.flushLatest('pause');
    expect(pause).toMatchObject({ kind: 'applied', generation: 1, output: { revision: 3 } });
    expect(requests).toHaveLength(1);

    // Resumed input replaces the open interaction's after snapshot rather than
    // creating another history entry; a second pause promotes only its latest.
    scheduler.submit({ candidate: recipe(4), profile, controlKey: 'drag' });
    const resumedPause = await scheduler.flushLatest('pause');
    expect(resumedPause).toMatchObject({ kind: 'applied', generation: 2, output: { revision: 4 } });
    expect(requests.map((request) => request.candidate.revision)).toEqual([3, 4]);

    scheduler.dispose();
  });

  test('release flushes immediately, commits one latest value, and does not duplicate at idle', async () => {
    const clock = new FakeClock();
    const requests: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: async (request) => {
        requests.push(request);
        return { revision: request.candidate.revision };
      },
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    scheduler.submit({ candidate: recipe(9), profile, controlKey: 'slider' });
    const committed = await scheduler.flushLatest('release');
    expect(committed).toMatchObject({ kind: 'applied', generation: 1, output: { revision: 9 } });
    expect(requests).toHaveLength(1);

    const idleRelease = await scheduler.flushLatest('release');
    expect(idleRelease).toEqual({ kind: 'idle' });
    expect(requests).toHaveLength(1);

    scheduler.dispose();
  });

  test('cancel restores the interaction boundary and prevents late work from applying', async () => {
    const clock = new FakeClock();
    const renderer = deferredRenderer();
    const applied: RenderRequest[] = [];
    const scheduler = createScheduler({
      clock,
      render: renderer.render,
      onApply: (request) => applied.push(request),
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    scheduler.submit({ candidate: recipe(7), profile, controlKey: 'drag' });
    clock.advanceBy(100);
    clock.flushAnimationFrames();
    await settle();
    expect(renderer.requests).toHaveLength(1);

    scheduler.cancelInteraction();
    expect(debugState(scheduler).pendingByControl.size).toBe(0);
    expect(debugState(scheduler).queuedFrame).toBeUndefined();

    renderer.deferred[0]?.resolve({ revision: 7 });
    await settle();
    expect(applied).toEqual([]);
    expect(debugState(scheduler).inFlight).toBeUndefined();

    scheduler.beginInteraction(recipe(0));
    expect(scheduler.submit({ candidate: recipe(8), profile, controlKey: 'drag' })).toBeGreaterThan(
      1,
    );

    scheduler.dispose();
  });

  test('keeps state bounded across a long input burst and uses monotonic generations', () => {
    const clock = new FakeClock();
    const scheduler = createScheduler({
      clock,
      render: async (request) => ({ revision: request.candidate.revision }),
      samplingWindowMs: 100,
    });

    scheduler.beginInteraction(recipe(0));
    const generations = Array.from({ length: 200 }, (_, index) =>
      scheduler.submit({
        candidate: recipe(index + 1),
        profile,
        controlKey: 'continuous-slider',
      }),
    );

    expect(generations).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
    expect(debugState(scheduler).pendingByControl.size).toBe(1);
    expect(clock.pendingTimerCount).toBe(1);
    expect(debugState(scheduler).generation).toBe(200);

    scheduler.cancelInteraction();
    expect(debugState(scheduler).pendingByControl.size).toBe(0);
    expect(clock.pendingTimerCount).toBe(0);
    scheduler.dispose();
  });
});

// Keep the imported result type referenced in this failure-first contract so
// the expected generation/result vocabulary stays visible to implementers.
type _ExpectedFlushResult = RenderFlushResult<TestOutput, string>;
void (undefined as _ExpectedFlushResult | undefined);
