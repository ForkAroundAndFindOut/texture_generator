import { SCENE_STARTERS, type SceneStarterId } from '../session/sceneStarters';

export type SceneStarterGalleryProps = {
  readonly onChooseStarter: (starterId: SceneStarterId) => void;
};

/** A small, visual-first starting-point library for one-click compositions. */
export function SceneStarterGallery({ onChooseStarter }: SceneStarterGalleryProps) {
  return (
    <section className="scene-starter-gallery" aria-labelledby="scene-starter-title">
      <div className="scene-panel-heading">
        <div>
          <p className="editor-eyebrow">Start here</p>
          <h2 id="scene-starter-title">Starter compositions</h2>
        </div>
        <span className="scene-panel-count">{SCENE_STARTERS.length}</span>
      </div>
      <p className="scene-panel-copy">Choose a visual direction, then make it your own.</p>
      <div className="scene-starter-gallery__grid">
        {SCENE_STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            className="scene-starter-card"
            data-scene-starter={starter.id}
            onClick={() => onChooseStarter(starter.id)}
            aria-label={`Choose ${starter.label} starter`}
          >
            <span
              className="scene-starter-card__swatch"
              aria-hidden="true"
              style={{
                background: `radial-gradient(circle at 24% 20%, ${starter.colors[1] ?? starter.colors[0]}, transparent 44%), radial-gradient(circle at 76% 72%, ${starter.colors[2] ?? starter.colors[0]}, transparent 52%), ${starter.colors[0]}`,
              }}
            />
            <span className="scene-starter-card__label">{starter.label}</span>
            <small>{starter.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export default SceneStarterGallery;
