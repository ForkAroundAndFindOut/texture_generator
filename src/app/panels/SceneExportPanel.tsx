import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import type { SceneV03 } from '../../domain';
import {
  createSceneV03ExportBundle,
  downloadTextFile,
  SCENE_V03_EXPORT_FILENAMES,
  SCENE_V03_EXPORT_MIME_TYPES,
} from '../../export';

export type SceneExportPanelProps = {
  readonly scene: SceneV03;
  readonly onImportScene: (candidate: unknown) => boolean;
};

type DownloadKind = 'sceneJson' | 'svg' | 'css';

const downloadLabels: Readonly<Record<DownloadKind, string>> = {
  sceneJson: 'Scene JSON',
  svg: 'SVG',
  css: 'CSS',
};

/** Portable source-file actions for the same vector model shown on the canvas. */
export function SceneExportPanel({ scene, onImportScene }: SceneExportPanelProps) {
  const bundle = useMemo(() => createSceneV03ExportBundle(scene), [scene]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('Download portable source or load a scene JSON document.');

  function download(kind: DownloadKind): void {
    downloadTextFile({
      filename: SCENE_V03_EXPORT_FILENAMES[kind],
      text: bundle[kind],
      mimeType: SCENE_V03_EXPORT_MIME_TYPES[kind],
    });
    setStatus(`${downloadLabels[kind]} download started.`);
  }

  async function copyCss(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bundle.css);
      setStatus('Responsive CSS copied to the clipboard.');
    } catch {
      setStatus('Copy is unavailable here. Select the CSS source below instead.');
    }
  }

  async function importScene(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    if (file.size > 1_000_000) {
      setStatus('That JSON file is too large. Choose a scene source under 1 MB.');
      input.value = '';
      return;
    }
    try {
      const candidate = JSON.parse(await file.text()) as unknown;
      setStatus(
        onImportScene(candidate)
          ? 'Scene imported. Its coordinates and colors remain editable.'
          : 'Import rejected. Your current composition is unchanged.',
      );
    } catch {
      setStatus('Could not read that file as scene JSON. Your current composition is unchanged.');
    } finally {
      input.value = '';
    }
  }

  return (
    <section
      id="texture-lab-export-panel"
      className="export-panel scene-export-panel"
      aria-labelledby="scene-export-title"
      tabIndex={-1}
    >
      <p className="editor-eyebrow">Ship to the web</p>
      <h2 id="scene-export-title">Portable export</h2>
      <p className="scene-export-panel__copy">
        These are resolution-independent source files, not an image. Colors, paths, transforms, edge
        fade, bloom, grain, and blend behavior scale with the host element.
      </p>
      <div className="export-panel__actions">
        <button type="button" onClick={() => download('sceneJson')}>
          Download scene JSON
        </button>
        <button type="button" onClick={() => download('svg')}>
          Download SVG
        </button>
        <button type="button" onClick={() => download('css')}>
          Download CSS
        </button>
        <button type="button" onClick={() => void copyCss()}>
          Copy CSS
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Load scene JSON
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Import scene JSON"
          onChange={(event) => void importScene(event)}
        />
      </div>
      <details className="export-panel__code">
        <summary>View responsive CSS</summary>
        <pre aria-label="Generated responsive CSS">{bundle.css}</pre>
      </details>
      <details className="export-panel__code">
        <summary>View scene JSON</summary>
        <pre aria-label="Generated scene JSON">{bundle.sceneJson}</pre>
      </details>
      <p className="export-panel__status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

export default SceneExportPanel;
