import {
  SCENE_SHAPE_PRESETS,
  type SceneShapePreset,
  type SceneShapePresetId,
} from '../session/sceneTemplates';

export type SceneShapeLibraryProps = {
  readonly onAddShape: (presetId: SceneShapePresetId) => void;
};

const families: ReadonlyArray<Readonly<{ id: SceneShapePreset['family']; label: string }>> = [
  { id: 'gesture', label: 'Visual gestures' },
  { id: 'shape', label: '2D shapes' },
  { id: 'silhouette', label: '3D-style silhouettes' },
];

/** Composition gestures come first; the broader shape library remains one disclosure away. */
export function SceneShapeLibrary({ onAddShape }: SceneShapeLibraryProps) {
  return (
    <section className="scene-shape-library" aria-labelledby="scene-shape-library-title">
      <div className="scene-panel-heading">
        <div>
          <p className="editor-eyebrow">Add a layer</p>
          <h2 id="scene-shape-library-title">Visual gestures</h2>
        </div>
      </div>
      <p className="scene-panel-copy">One action creates a solid, editable material on top.</p>
      {families.map((family, familyIndex) => {
        const presets = SCENE_SHAPE_PRESETS.filter((preset) => preset.family === family.id);
        const content = (
          <div className="scene-shape-library__grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="scene-shape-option"
                data-scene-shape={preset.id}
                onClick={() => onAddShape(preset.id)}
              >
                <span
                  className={`scene-shape-option__thumbnail is-${preset.id}`}
                  aria-hidden="true"
                />
                <span>{preset.label}</span>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>
        );
        return familyIndex === 0 ? (
          <div key={family.id}>{content}</div>
        ) : (
          <details key={family.id} className="scene-shape-library__more">
            <summary>{family.label}</summary>
            {content}
          </details>
        );
      })}
    </section>
  );
}

export default SceneShapeLibrary;
