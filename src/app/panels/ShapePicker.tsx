import { SHAPE_PRESETS, type ShapePresetId } from '../session/componentTemplates';

export type ShapePickerProps = {
  readonly onAddPreset: (presetId: ShapePresetId) => void;
  readonly disabled?: boolean;
};

/** Compact visual chooser for the deliberately small v0.2 shape vocabulary. */
export function ShapePicker({ onAddPreset, disabled = false }: ShapePickerProps) {
  return (
    <section className="shape-picker" aria-labelledby="shape-picker-title">
      <div className="shape-picker__heading">
        <h2 id="shape-picker-title">Add shape</h2>
        <p>Start with a Field or Band, then tune it on the canvas.</p>
      </div>
      <div className="shape-picker__grid">
        {SHAPE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="shape-picker__option"
            data-shape-preset={preset.id}
            onClick={() => onAddPreset(preset.id)}
            disabled={disabled}
          >
            <span
              className={`shape-picker__thumbnail shape-picker__thumbnail--${preset.id}`}
              aria-hidden="true"
            />
            <span className="shape-picker__label">Add {preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export default ShapePicker;
