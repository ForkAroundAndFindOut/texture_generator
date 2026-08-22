import { useRef, useState, type ChangeEvent } from 'react';

import {
  buildPaletteImportPreview,
  createPaletteFile,
  MAX_SCENE_PALETTE_ENTRIES,
  PALETTE_FILE_MAX_BYTES,
  parsePaletteFile,
  type PaletteImportEntry,
  type PaletteImportMode,
  type PaletteImportParseResult,
  type ScenePaletteEntryPatch,
} from '../../editor';
import {
  parseSceneColor,
  rgbToSceneColor,
  sceneColorToRgb,
  type ScenePaletteEntry,
  type SceneRgb,
  type SceneV03,
} from '../../domain';
import { downloadTextFile } from '../../export';
import { SCENE_QUICK_COLORS } from './sceneQuickColors';

export type ScenePalettePanelProps = {
  readonly scene: SceneV03;
  readonly background: string;
  readonly palette: readonly ScenePaletteEntry[];
  readonly onBackgroundChange: (color: string) => void;
  readonly onPaletteChange: (paletteId: string, patch: ScenePaletteEntryPatch) => void;
  readonly onAddPaletteEntry: () => void;
  readonly onDeletePaletteEntry: (paletteId: string) => void;
  readonly onImportPalette: (
    entries: readonly PaletteImportEntry[],
    mode: PaletteImportMode,
  ) => boolean;
  readonly onRemix: () => void;
};

function parseRgbDraft(rgb: Readonly<Record<keyof SceneRgb, string>>): SceneRgb | undefined {
  const values = [rgb.r, rgb.g, rgb.b].map((value) => Number(value));
  return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ? { r: values[0]!, g: values[1]!, b: values[2]! }
    : undefined;
}

function PaletteEntryRow({
  entry,
  canDelete,
  onChange,
  onDelete,
}: {
  readonly entry: ScenePaletteEntry;
  readonly canDelete: boolean;
  readonly onChange: (patch: ScenePaletteEntryPatch) => void;
  readonly onDelete: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(entry.color);
  const [rgbDraft, setRgbDraft] = useState<Readonly<Record<keyof SceneRgb, string>>>(() => {
    const rgb = sceneColorToRgb(entry.color);
    return { r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) };
  });
  const rgbDraftRef = useRef(rgbDraft);
  const [nameDraft, setNameDraft] = useState(entry.name);
  const [colorError, setColorError] = useState<string | undefined>(undefined);

  function setColorDraft(value: string): void {
    setHexDraft(value);
    const parsed = parseSceneColor(value);
    if (parsed.kind === 'valid') {
      const next = { r: String(parsed.rgb.r), g: String(parsed.rgb.g), b: String(parsed.rgb.b) };
      rgbDraftRef.current = next;
      setRgbDraft(next);
      setColorError(undefined);
    } else {
      setColorError(parsed.message);
    }
  }

  function setRgbChannel(channel: keyof SceneRgb, value: string): void {
    const next = { ...rgbDraftRef.current, [channel]: value };
    rgbDraftRef.current = next;
    setRgbDraft(next);
    const rgb = parseRgbDraft(next);
    if (rgb === undefined) {
      setColorError('RGB channels must be integers from 0 through 255.');
      return;
    }
    setHexDraft(rgbToSceneColor(rgb));
    setColorError(undefined);
  }

  function commitColor(value: string): void {
    const parsed = parseSceneColor(value);
    if (parsed.kind === 'invalid') {
      setColorError(parsed.message);
      setHexDraft(entry.color);
      const rgb = sceneColorToRgb(entry.color);
      const next = { r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) };
      rgbDraftRef.current = next;
      setRgbDraft(next);
      return;
    }
    setHexDraft(parsed.color);
    const next = { r: String(parsed.rgb.r), g: String(parsed.rgb.g), b: String(parsed.rgb.b) };
    rgbDraftRef.current = next;
    setRgbDraft(next);
    setColorError(undefined);
    if (parsed.color !== entry.color) onChange({ color: parsed.color });
  }

  function commitRgbDraft(channel: keyof SceneRgb, value: string): void {
    const next = { ...rgbDraftRef.current, [channel]: value };
    const rgb = parseRgbDraft(next);
    if (rgb === undefined) {
      setColorError('RGB channels must be integers from 0 through 255.');
      return;
    }
    commitColor(rgbToSceneColor(rgb));
  }

  function resetColor(): void {
    const rgb = sceneColorToRgb(entry.color);
    setHexDraft(entry.color);
    const next = { r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) };
    rgbDraftRef.current = next;
    setRgbDraft(next);
    setColorError(undefined);
  }

  function commitName(): void {
    onChange({ name: nameDraft });
    setNameDraft(entry.name);
  }

  return (
    <div className="scene-palette-panel__entry">
      <input
        type="color"
        aria-label={`${entry.name} palette color picker`}
        value={entry.color}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setColorDraft(value);
          onChange({ color: value });
        }}
      />
      <div className="scene-palette-panel__entry-fields">
        <input
          aria-label={`${entry.name} palette name`}
          value={nameDraft}
          maxLength={80}
          onChange={(event) => setNameDraft(event.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setNameDraft(entry.name);
              event.currentTarget.blur();
            }
          }}
        />
        <div className="scene-palette-panel__color-fields">
          <input
            aria-label={`${entry.name} hex color`}
            value={hexDraft}
            inputMode="text"
            onChange={(event) => setColorDraft(event.currentTarget.value)}
            onBlur={(event) => commitColor(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                resetColor();
                event.currentTarget.blur();
              }
            }}
          />
          {(['r', 'g', 'b'] as const).map((channel) => (
            <input
              key={channel}
              aria-label={`${entry.name} ${channel.toUpperCase()} value`}
              type="number"
              min={0}
              max={255}
              step={1}
              value={rgbDraft[channel]}
              onChange={(event) => setRgbChannel(channel, event.currentTarget.value)}
              onBlur={(event) => commitRgbDraft(channel, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  resetColor();
                  event.currentTarget.blur();
                }
              }}
            />
          ))}
          <button
            type="button"
            aria-label={`Delete ${entry.name} palette entry`}
            title={canDelete ? 'Delete palette entry' : 'At least one palette entry is required'}
            disabled={!canDelete}
            onClick={onDelete}
          >
            🗑️
          </button>
        </div>
        {colorError === undefined ? null : (
          <p className="scene-palette-panel__error" role="alert">
            {colorError}
          </p>
        )}
      </div>
    </div>
  );
}

function ImportPreview({
  preview,
  onConfirm,
  onCancel,
}: {
  readonly preview: ReturnType<typeof buildPaletteImportPreview>;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      className="scene-palette-panel__import-preview"
      role="region"
      aria-label="Palette import preview"
    >
      <strong>Import preview</strong>
      <p>
        Result: {preview.resultingCount} entries ({preview.retainedCount} retained,{' '}
        {preview.overwrittenCount} overwritten, {preview.appendedCount} added).
      </p>
      {preview.replacesPalette ? (
        <p className="scene-palette-panel__warning">
          Clear then import will replace the entire palette with the approved valid subset.{' '}
          {preview.referencedConversionCount} referenced color
          {preview.referencedConversionCount === 1 ? '' : 's'} will be converted to local colors.
        </p>
      ) : null}
      {preview.issues.length === 0 ? null : (
        <ul className="scene-palette-panel__import-issues">
          {preview.issues.map((issue, index) => (
            <li key={`${issue.sourceIndex ?? 'file'}-${index}`}>
              {issue.sourceIndex === undefined ? '' : `Entry ${issue.sourceIndex + 1}: `}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <div className="scene-palette-panel__import-actions">
        <button type="button" disabled={!preview.canApply} onClick={onConfirm}>
          Confirm import
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Canvas and named palette controls stay separate from each material's fill source. */
export function ScenePalettePanel({
  scene,
  background,
  palette,
  onBackgroundChange,
  onPaletteChange,
  onAddPaletteEntry,
  onDeletePaletteEntry,
  onImportPalette,
  onRemix,
}: ScenePalettePanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<PaletteImportMode>('append');
  const [parsedImport, setParsedImport] = useState<PaletteImportParseResult | undefined>(undefined);
  const [status, setStatus] = useState('Download or load a named palette JSON file.');
  const preview =
    parsedImport === undefined ? undefined : buildPaletteImportPreview(scene, parsedImport, mode);

  function downloadPalette(): void {
    downloadTextFile({
      filename: 'texture-lab-palette.json',
      text: `${JSON.stringify(createPaletteFile(scene), null, 2)}\n`,
      mimeType: 'application/json;charset=utf-8',
    });
    setStatus('Palette JSON download started.');
  }

  async function importPalette(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    try {
      if (file.size > PALETTE_FILE_MAX_BYTES) {
        setParsedImport({
          entries: [],
          issues: [{ kind: 'file', message: 'Palette files must be smaller than 1 MiB.' }],
        });
        setStatus('Palette import rejected.');
        return;
      }
      const parsed = parsePaletteFile(JSON.parse(await file.text()) as unknown);
      setParsedImport(parsed);
      setStatus('Review the palette import preview before confirming.');
    } catch {
      setParsedImport({
        entries: [],
        issues: [{ kind: 'file', message: 'Could not read that file as JSON.' }],
      });
      setStatus('Palette import rejected.');
    } finally {
      input.value = '';
    }
  }

  function confirmImport(): void {
    if (preview === undefined || !preview.canApply) return;
    if (onImportPalette(preview.approvedEntries, mode)) {
      setParsedImport(undefined);
      setStatus('Palette imported as one undoable change.');
    }
  }

  return (
    <section className="scene-palette-panel" aria-labelledby="scene-palette-title">
      <div className="scene-panel-heading">
        <div>
          <p className="editor-eyebrow">Composition</p>
          <h2 id="scene-palette-title">Canvas & palette</h2>
        </div>
        <button type="button" onClick={onRemix}>
          Remix palette
        </button>
      </div>
      <p className="scene-panel-copy">
        Remix changes palette-linked materials together; custom local fills stay put.
      </p>
      <label className="scene-palette-panel__background">
        <span>Canvas color</span>
        <input
          aria-label="Canvas color"
          type="color"
          value={background}
          onChange={(event) => onBackgroundChange(event.currentTarget.value)}
        />
      </label>
      <div className="scene-palette-panel__quick" role="group" aria-label="Canvas quick colors">
        {SCENE_QUICK_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            aria-label={`Use ${color.name} ${color.hex} for canvas`}
            title={`${color.name} ${color.hex}`}
            style={{ background: color.hex }}
            onClick={() => onBackgroundChange(color.hex)}
          />
        ))}
      </div>
      <div className="scene-palette-panel__toolbar">
        <button
          type="button"
          onClick={onAddPaletteEntry}
          disabled={palette.length >= MAX_SCENE_PALETTE_ENTRIES}
        >
          Add palette entry
        </button>
        <button type="button" onClick={downloadPalette}>
          Export palette JSON
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import palette JSON
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Import palette JSON file"
          onChange={(event) => void importPalette(event)}
        />
        <label>
          <span className="visually-hidden">Palette import mode</span>
          <select
            aria-label="Palette import mode"
            value={mode}
            onChange={(event) => setMode(event.currentTarget.value as PaletteImportMode)}
          >
            <option value="append">Append</option>
            <option value="overwrite">Overwrite slots</option>
            <option value="clear">Clear then import</option>
          </select>
        </label>
      </div>
      {preview === undefined ? null : (
        <ImportPreview
          preview={preview}
          onConfirm={confirmImport}
          onCancel={() => setParsedImport(undefined)}
        />
      )}
      <div className="scene-palette-panel__entries">
        {palette.map((entry) => (
          <PaletteEntryRow
            key={`${entry.id}-${entry.name}`}
            entry={entry}
            canDelete={palette.length > 1}
            onChange={(patch) => onPaletteChange(entry.id, patch)}
            onDelete={() => onDeletePaletteEntry(entry.id)}
          />
        ))}
      </div>
      <p className="scene-palette-panel__status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

export default ScenePalettePanel;
