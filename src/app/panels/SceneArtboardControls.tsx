import { ARTBOARD_RATIOS, type ArtboardFitMode, type ArtboardRatio } from '../../domain';

export type SceneArtboardControlsProps = {
  readonly ratio: ArtboardRatio;
  readonly fitMode: ArtboardFitMode;
  readonly onRatioChange: (ratio: ArtboardRatio) => void;
  readonly onFitModeChange: (fitMode: ArtboardFitMode) => void;
  readonly onReframe: () => void;
};

/** Ratio changes intentionally crop/viewBox only; they never stretch stored geometry. */
export function SceneArtboardControls({
  ratio,
  fitMode,
  onRatioChange,
  onFitModeChange,
  onReframe,
}: SceneArtboardControlsProps) {
  return (
    <section className="scene-artboard-controls" aria-labelledby="scene-artboard-controls-title">
      <div>
        <p className="editor-eyebrow">Responsive canvas</p>
        <h2 id="scene-artboard-controls-title">Artboard</h2>
      </div>
      <div className="scene-artboard-controls__ratio-group" role="group" aria-label="Canvas ratio">
        {ARTBOARD_RATIOS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={ratio === candidate}
            onClick={() => onRatioChange(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      <label className="scene-artboard-controls__fit">
        <span>Framing</span>
        <select
          aria-label="Framing"
          value={fitMode}
          onChange={(event) => onFitModeChange(event.currentTarget.value as ArtboardFitMode)}
        >
          <option value="cover">Cover</option>
          <option value="fit">Fit</option>
        </select>
      </label>
      <button type="button" onClick={onReframe}>
        Reframe visible content
      </button>
      <p>Ratios crop the shared coordinate world; your objects keep their proportions.</p>
    </section>
  );
}

export default SceneArtboardControls;
