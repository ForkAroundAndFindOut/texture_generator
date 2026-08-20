import { afterEach, beforeEach, vi } from 'vitest';

/**
 * A single epoch is shared by Node simulation fixtures. Browser-mode tests
 * receive their clock from the real browser context and intentionally do not
 * install fake timers here.
 */
export const TEST_EPOCH = new Date('2026-01-01T00:00:00.000Z');

const isNodeSimulation = typeof window === 'undefined';

if (typeof process !== 'undefined') {
  // Locale/timezone are defaults only; a caller may explicitly override them.
  process.env['TZ'] ??= 'UTC';
  process.env['LANG'] ??= 'en_US.UTF-8';
  process.env['LC_ALL'] ??= 'C.UTF-8';
}

if (isNodeSimulation) {
  beforeEach(() => {
    vi.useFakeTimers({ now: TEST_EPOCH, shouldAdvanceTime: false });
  });
}

afterEach(() => {
  // Remove pending work before restoring real time so a fixture cannot leak
  // a callback into the next test. Tests that need to assert a callback must
  // advance the clock explicitly inside that test.
  if (isNodeSimulation) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }

  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();

  // Browser-mode tests get a fresh page in normal operation, but clearing
  // fixture-owned DOM nodes keeps an accidental shared context deterministic.
  const testDocument = globalThis.document;
  if (testDocument !== undefined) {
    testDocument
      .querySelectorAll('[data-texture-lab-test-fixture]')
      .forEach((node) => node.remove());
  }

  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      storage?.clear();
    } catch {
      // Some browser contexts intentionally expose storage that is unavailable.
    }
  }
});
