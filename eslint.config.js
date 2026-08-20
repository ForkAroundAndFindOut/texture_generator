import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,tsx}'];

const ignores = [
  'node_modules/**',
  '.tools/**',
  'dist/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  '.codex/**',
  '.specify/orchestration/runs/**',
  'tests/evidence/**',
  '**/generated/**',
  '**/*.generated.{js,jsx,ts,tsx}',
];

const parserOptions = {
  requireConfigFile: false,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  ecmaVersion: 'latest',
  babelOptions: {
    babelrc: false,
    configFile: false,
    presets: [
      ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
      ['@babel/preset-react', { runtime: 'automatic' }],
    ],
  },
};

const commonRules = {
  ...js.configs.recommended.rules,
  'no-duplicate-imports': 'error',
  'no-unused-vars': [
    'error',
    { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^_' },
  ],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

export default [
  { ignores },
  {
    name: 'texture-lab/javascript-and-typescript',
    files: sourceFiles,
    languageOptions: {
      parser: babelParser,
      parserOptions,
      globals: globals.es2024,
    },
    rules: commonRules,
  },
  {
    name: 'texture-lab/browser-module-boundary',
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.es2024, ...globals.browser },
    },
    rules: {
      // T008 performs the authoritative graph check. This catches accidental Node-only
      // imports early without duplicating the complete dependency matrix here.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'assert',
                'child_process',
                'fs',
                'fs/**',
                'module',
                'path',
                'path/**',
                'process',
                'url',
                'url/**',
              ],
              message: 'Browser modules must not import Node-only modules.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'texture-lab/typescript-semantic-checking',
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Babel supplies syntax-only parsing here. TypeScript owns semantic diagnostics,
      // including unused declarations and name resolution that require the compiler's
      // type information.
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    name: 'texture-lab/node-tooling',
    files: [
      '*.config.{js,mjs,cjs,ts}',
      'scripts/**/*.{js,mjs,cjs,ts}',
      'tests/**/*.{js,mjs,cjs,ts,tsx}',
    ],
    languageOptions: {
      globals: { ...globals.es2024, ...globals.node },
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['src/**/*.{ts,tsx}'],
  },
  {
    ...reactRefresh.configs.vite,
    files: ['src/**/*.{tsx}'],
  },
  prettierRecommended,
];
