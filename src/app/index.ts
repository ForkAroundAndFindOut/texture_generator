/**
 * Public application boundary.
 *
 * The app layer owns React composition and browser-facing presentation only.
 * Keep this barrel dependency-light: export app composition and UI contracts
 * explicitly as they are implemented; do not re-export domain, persistence,
 * compiler, or test-support internals from here.
 */

export { App } from './App';
export type { AppProps } from './App';

export { EditorLayout } from './layout/EditorLayout';
export type { EditorLayoutProps } from './layout/EditorLayout';
