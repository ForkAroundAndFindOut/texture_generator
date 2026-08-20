import type { ReactNode } from 'react';

import '../styles/layout.css';

export interface EditorLayoutProps {
  /** Optional compact controls placed above the canvas. */
  readonly authoring?: ReactNode;
  /** Front-to-back layer rail and shape picker. */
  readonly sidebar?: ReactNode;
  /** Live canvas surface. */
  readonly preview?: ReactNode;
  /** Persistent selected-layer inspector. */
  readonly panels?: ReactNode;
  /** Undo/redo and other compact toolbar controls. */
  readonly headerActions?: ReactNode;
  /** Short, user-facing session feedback. */
  readonly sessionStatus?: ReactNode;
  /** Truthful render/validation status adjacent to the live canvas. */
  readonly previewStatus?: ReactNode;
  /** Focuses the visible export card. */
  readonly onExport?: () => void;
  readonly exportDisabled?: boolean;
  readonly className?: string;
}

/** Three-region desktop workspace for simultaneous layer, canvas, and detail work. */
export function EditorLayout({
  authoring,
  sidebar,
  preview,
  panels,
  headerActions,
  sessionStatus,
  previewStatus,
  onExport,
  exportDisabled = false,
  className,
}: EditorLayoutProps) {
  const shellClassName = ['editor-layout', className].filter(Boolean).join(' ');

  return (
    <div className={shellClassName}>
      <a className="skip-link" href="#texture-lab-canvas">
        Skip to canvas
      </a>
      <header className="editor-header">
        <div className="editor-brand">
          <p className="editor-eyebrow">Textured gradients for the web</p>
          <h1>Texture Lab</h1>
        </div>
        <div className="editor-header-controls" role="group" aria-label="Design actions">
          {headerActions}
          <button
            className="primary-action"
            type="button"
            onClick={onExport}
            disabled={exportDisabled}
          >
            Export
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-sidebar" aria-label="Layers and shapes">
          {sidebar}
        </aside>

        <main id="texture-lab-canvas" className="editor-main">
          {authoring}
          <section className="preview-region" aria-labelledby="texture-lab-preview-heading">
            <div className="section-heading">
              <div>
                <p className="editor-eyebrow">Live design</p>
                <h2 id="texture-lab-preview-heading">Canvas</h2>
              </div>
              <span className="section-status" role="status" aria-live="polite">
                {previewStatus ?? 'Preview live'}
              </span>
            </div>
            <div className="preview-surface">{preview}</div>
          </section>
        </main>

        <aside className="editor-panels" aria-label="Fine tuning inspector">
          {panels}
        </aside>
      </div>

      <footer className="editor-footer" aria-label="Design status">
        {sessionStatus ?? <p>Choose a layer, shape the gradient, then export it for the web.</p>}
      </footer>
    </div>
  );
}

export default EditorLayout;
