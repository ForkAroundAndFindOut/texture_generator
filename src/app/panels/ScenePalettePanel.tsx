import type { ScenePaletteEntry } from '../../domain';
import type { ScenePaletteEntryPatch } from '../../editor';
import { SCENE_QUICK_COLORS } from './sceneQuickColors';

export type ScenePalettePanelProps = {
  readonly background: string;
  readonly palette: readonly ScenePaletteEntry[];
  readonly onBackgroundChange: (color: string) => void;
  readonly onPaletteChange: (paletteId: string, patch: ScenePaletteEntryPatch) => void;
};

/** Canvas and named palette controls stay separate from each material's fill source. */
export function ScenePalettePanel({
  background,
  palette,
  onBackgroundChange,
  onPaletteChange,
}: ScenePalettePanelProps) {
  return (
    <section className="scene-palette-panel" aria-labelledby="scene-palette-title">
      <div className="scene-panel-heading">
        <div>
          <p className="editor-eyebrow">Composition</p>
          <h2 id="scene-palette-title">Canvas & palette</h2>
        </div>
      </div>
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
      <div className="scene-palette-panel__entries">
        {palette.map((entry) => (
          <div key={entry.id} className="scene-palette-panel__entry">
            <input
              type="color"
              aria-label={`${entry.name} palette color`}
              value={entry.color}
              onChange={(event) => onPaletteChange(entry.id, { color: event.currentTarget.value })}
            />
            <input
              key={`${entry.id}-${entry.name}`}
              aria-label={`${entry.name} palette name`}
              defaultValue={entry.name}
              maxLength={80}
              onBlur={(event) => onPaletteChange(entry.id, { name: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') event.currentTarget.value = entry.name;
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default ScenePalettePanel;
