import { useState } from 'react';

import { downloadTextFile } from '../../export';

export type ExportPanelProps = {
  readonly svgText: string;
  readonly cssText: string;
  readonly width?: number;
  readonly height?: number;
};

export function ExportPanel({ svgText, cssText, width = 720, height = 480 }: ExportPanelProps) {
  const [status, setStatus] = useState('Choose SVG, CSS, or copy CSS.');

  function download(kind: 'svg' | 'css'): void {
    const isSvg = kind === 'svg';
    downloadTextFile({
      filename: `texture-lab.${kind}`,
      text: isSvg ? svgText : cssText,
      mimeType: isSvg ? 'image/svg+xml;charset=utf-8' : 'text/css;charset=utf-8',
    });
    setStatus(`${kind.toUpperCase()} download started.`);
  }

  async function copyCss(): Promise<void> {
    try {
      await navigator.clipboard.writeText(cssText);
      setStatus('CSS copied to the clipboard.');
    } catch {
      setStatus('Copy is unavailable here. Select the code below instead.');
    }
  }

  return (
    <aside
      id="texture-lab-export-panel"
      className="export-panel"
      aria-label="Export texture"
      tabIndex={-1}
    >
      <h2>Export</h2>
      <p>
        {width} × {height} px · both formats come from the same live canvas.
      </p>
      <div className="export-panel__actions">
        <button type="button" onClick={() => download('svg')}>
          Download SVG
        </button>
        <button type="button" onClick={() => download('css')}>
          Download CSS
        </button>
        <button type="button" onClick={() => void copyCss()}>
          Copy CSS
        </button>
      </div>
      <details className="export-panel__code">
        <summary>View CSS</summary>
        <pre aria-label="Generated CSS">{cssText}</pre>
      </details>
      <p className="export-panel__status" role="status" aria-live="polite">
        {status}
      </p>
    </aside>
  );
}

export default ExportPanel;
