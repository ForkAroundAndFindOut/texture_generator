import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

const nodeProject: TestProjectInlineConfiguration = {
  extends: true,
  test: {
    name: 'node',
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    fakeTimers: {
      now: FIXED_NOW,
      shouldAdvanceTime: false,
      toFake: [
        'Date',
        'hrtime',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    },
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false, shuffle: false },
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
};

export default defineConfig({ test: { projects: [nodeProject] } });
