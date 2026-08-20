/**
 * Public preview boundary.
 *
 * Preview scheduling and profiles coordinate render work without mutating
 * durable recipes. Keep browser scheduling adapters explicit and avoid
 * re-exporting React UI, persistence, compiler, or test-support internals.
 */
export { createLatestOnlyScheduler } from './latestOnlyScheduler';
export type {
  ClockPort,
  FrameCallback,
  LatestOnlyRenderRequest,
  LatestOnlySchedulerDebugState,
  LatestOnlySchedulerOptions,
} from './latestOnlyScheduler';
