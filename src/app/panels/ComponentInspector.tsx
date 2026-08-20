import { useEffect, useRef, useState } from 'react';

import type { AnchorId, Component, ComponentId } from '../../domain';

export type TransformControl =
  'positionX' | 'positionY' | 'width' | 'height' | 'rotation' | 'scale';
export type AppearanceControl = 'softness' | 'highlight' | 'grain' | 'asymmetry';
export type InspectorControl = TransformControl | AppearanceControl;

export type ComponentInspectorChange =
  | { readonly kind: 'transform'; readonly control: TransformControl; readonly value: number }
  | { readonly kind: 'appearance'; readonly control: AppearanceControl; readonly value: number };

export type ComponentInspectorProps = {
  readonly component?: Component | null;
  readonly componentColor?: string;
  readonly anchorEditMode?: boolean;
  readonly selectedAnchorId?: AnchorId;
  readonly feedback?: string;
  readonly onChange?: (componentId: ComponentId, change: ComponentInspectorChange) => void;
  readonly onTransformChange?: (
    componentId: ComponentId,
    control: TransformControl,
    value: number,
  ) => void;
  readonly onAppearanceChange?: (
    componentId: ComponentId,
    control: AppearanceControl,
    value: number,
  ) => void;
  readonly onBlendModeChange?: (
    componentId: ComponentId,
    value: Component['appearance']['blendMode'],
  ) => void;
  readonly onBandShapeChange?: (
    componentId: ComponentId,
    patch: Partial<Extract<Component, { type: 'band' }>['band']>,
  ) => void;
  readonly onNameChange?: (componentId: ComponentId, name: string) => boolean | void;
  readonly onDuplicate?: (componentId: ComponentId) => void;
  readonly onRemove?: (componentId: ComponentId) => void;
  readonly onResetTransform?: () => void;
  readonly onAnchorEditModeChange?: (enabled: boolean) => void;
  readonly onAddAnchor?: () => void;
  readonly onRemoveAnchor?: () => void;
  readonly onGestureStart?: (componentId: ComponentId, control: InspectorControl) => void;
  readonly onGestureInput?: (
    componentId: ComponentId,
    control: InspectorControl,
    value: number,
  ) => void;
  readonly onGestureEnd?: (componentId: ComponentId, control: InspectorControl) => void;
  readonly onGestureCancel?: (componentId: ComponentId, control: InspectorControl) => void;
  readonly disabled?: boolean;
  readonly className?: string;
};

type Drafts = Partial<Record<InspectorControl, string>>;
type FieldConfig = {
  readonly control: InspectorControl;
  readonly label: string;
  readonly unit: string;
  readonly step: string;
  readonly min: number;
  readonly max: number;
};

const TRANSFORM_FIELDS: readonly FieldConfig[] = [
  { control: 'positionX', label: 'Position X', unit: 'canvas', step: '0.001', min: -2, max: 3 },
  { control: 'positionY', label: 'Position Y', unit: 'canvas', step: '0.001', min: -2, max: 3 },
  { control: 'width', label: 'Width', unit: 'relative', step: '0.001', min: 0.001, max: 4 },
  { control: 'height', label: 'Height', unit: 'relative', step: '0.001', min: 0.001, max: 4 },
  { control: 'rotation', label: 'Rotation', unit: 'degrees', step: '1', min: -180, max: 179 },
  { control: 'scale', label: 'Scale', unit: 'x', step: '0.01', min: 0.05, max: 4 },
];

const APPEARANCE_FIELDS: readonly FieldConfig[] = [
  { control: 'softness', label: 'Softness', unit: '0–1', step: '0.01', min: 0, max: 1 },
  { control: 'highlight', label: 'Highlight', unit: '0–1', step: '0.01', min: 0, max: 1 },
  { control: 'grain', label: 'Grain', unit: '0–1', step: '0.01', min: 0, max: 1 },
  { control: 'asymmetry', label: 'Asymmetry', unit: '−1–1', step: '0.01', min: -1, max: 1 },
];

function valueFor(component: Component, control: InspectorControl): number {
  switch (control) {
    case 'positionX':
      return component.transform.translation.x;
    case 'positionY':
      return component.transform.translation.y;
    case 'width':
      return component.transform.baseSize.width;
    case 'height':
      return component.transform.baseSize.height;
    case 'rotation':
      return component.transform.rotationDeg;
    case 'scale':
      return component.transform.uniformScale;
    case 'softness':
      return component.appearance.softness;
    case 'highlight':
      return component.appearance.highlight;
    case 'grain':
      return component.appearance.grain;
    case 'asymmetry':
      return component.appearance.asymmetry;
  }
}

const formatNumber = (value: number): string => Number(value.toFixed(6)).toString();

/**
 * Precise controls that remain synchronized with direct canvas gestures and
 * history. Draft text is intentionally local and is never mistaken for a
 * committed design value.
 */
export function ComponentInspector({
  component,
  componentColor,
  anchorEditMode = false,
  selectedAnchorId,
  feedback,
  onChange,
  onTransformChange,
  onAppearanceChange,
  onBlendModeChange,
  onBandShapeChange,
  onNameChange,
  onDuplicate,
  onRemove,
  onResetTransform,
  onAnchorEditModeChange,
  onAddAnchor,
  onRemoveAnchor,
  onGestureStart,
  onGestureInput,
  onGestureEnd,
  onGestureCancel,
  disabled = false,
  className,
}: ComponentInspectorProps) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const [errors, setErrors] = useState<Partial<Record<InspectorControl, string>>>({});
  const [nameDraft, setNameDraft] = useState(component?.name ?? '');
  const activeGesture = useRef<InspectorControl | undefined>(undefined);
  const activeComponentId = useRef<ComponentId | undefined>(component?.id);
  const editingName = useRef(false);

  useEffect(() => {
    if (activeGesture.current === undefined) {
      setDrafts({});
      setErrors({});
    }
    activeComponentId.current = component?.id;
    if (!editingName.current) setNameDraft(component?.name ?? '');
  }, [component]);

  if (component === null || component === undefined) {
    return (
      <aside className={className ?? 'component-inspector'} aria-label="Layer inspector">
        <h2>Fine tune</h2>
        <p>Select a Field or Band on the canvas or in Layers to fine-tune it.</p>
      </aside>
    );
  }

  const activeComponent = component;
  const id = activeComponent.id;

  function clearDraft(control: InspectorControl): void {
    setDrafts((current) => {
      const next = { ...current };
      delete next[control];
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[control];
      return next;
    });
  }

  function beginGesture(control: InspectorControl): void {
    if (activeGesture.current === control && activeComponentId.current === id) return;
    if (activeGesture.current !== undefined && activeComponentId.current === id) {
      onGestureEnd?.(id, activeGesture.current);
      clearDraft(activeGesture.current);
    }
    activeGesture.current = control;
    activeComponentId.current = id;
    onGestureStart?.(id, control);
  }

  function endGesture(control: InspectorControl): void {
    if (activeGesture.current !== control || activeComponentId.current !== id) return;
    activeGesture.current = undefined;
    onGestureEnd?.(id, control);
    clearDraft(control);
  }

  function cancelGesture(control: InspectorControl): void {
    if (activeGesture.current === control && activeComponentId.current === id) {
      activeGesture.current = undefined;
      onGestureCancel?.(id, control);
    }
    clearDraft(control);
  }

  function emitValue(field: FieldConfig, rawValue: string): void {
    setDrafts((current) => ({ ...current, [field.control]: rawValue }));
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      setErrors((current) => ({
        ...current,
        [field.control]: `Use ${field.min} to ${field.max} ${field.unit}.`,
      }));
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[field.control];
      return next;
    });
    beginGesture(field.control);
    const change: ComponentInspectorChange =
      field.control === 'softness' ||
      field.control === 'highlight' ||
      field.control === 'grain' ||
      field.control === 'asymmetry'
        ? { kind: 'appearance', control: field.control, value }
        : { kind: 'transform', control: field.control, value };
    onChange?.(id, change);
    if (change.kind === 'transform') onTransformChange?.(id, change.control, value);
    else onAppearanceChange?.(id, change.control, value);
    onGestureInput?.(id, field.control, value);
  }

  function renderNumericField(field: FieldConfig) {
    const value = valueFor(activeComponent, field.control);
    const inputId = `component-${id}-${field.control}`;
    const error = errors[field.control];
    return (
      <div className="component-inspector__field" key={field.control}>
        <label htmlFor={inputId}>
          <span>{field.label}</span>
          <small>{field.unit}</small>
        </label>
        <div className="component-inspector__input-stack">
          <input
            id={inputId}
            name={field.control}
            type="number"
            inputMode="decimal"
            min={field.min}
            max={field.max}
            step={field.step}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : `${inputId}-error`}
            value={drafts[field.control] ?? formatNumber(value)}
            disabled={disabled}
            onPointerDown={() => beginGesture(field.control)}
            onPointerUp={() => endGesture(field.control)}
            onPointerCancel={() => cancelGesture(field.control)}
            onChange={(event) => emitValue(field, event.currentTarget.value)}
            onBlur={() => {
              if (errors[field.control] !== undefined) cancelGesture(field.control);
              else endGesture(field.control);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') endGesture(field.control);
              if (event.key === 'Escape') cancelGesture(field.control);
            }}
          />
          {error === undefined ? null : (
            <small id={`${inputId}-error`} className="component-inspector__error" role="alert">
              {error}
            </small>
          )}
        </div>
      </div>
    );
  }

  function commitName(): void {
    editingName.current = false;
    const next = nameDraft.trim();
    if (next.length === 0) {
      setNameDraft(activeComponent.name);
      return;
    }
    const result = onNameChange?.(id, next);
    if (result === false) setNameDraft(activeComponent.name);
  }

  const panelClassName = className ?? 'component-inspector';
  const scaleValue = valueFor(activeComponent, 'scale');

  return (
    <aside className={panelClassName} aria-label="Layer inspector">
      <div className="component-inspector__heading">
        <div>
          <p className="component-inspector__eyebrow">Fine tune layer</p>
          <label htmlFor={`component-${id}-name`} className="visually-hidden">
            Layer name
          </label>
          <input
            id={`component-${id}-name`}
            className="component-inspector__name"
            value={nameDraft}
            maxLength={80}
            disabled={disabled}
            onFocus={() => {
              editingName.current = true;
            }}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setNameDraft(activeComponent.name);
                event.currentTarget.blur();
              }
            }}
          />
          <p className="component-inspector__selection">
            {activeComponent.type === 'field' ? 'Field' : 'Band'} layer
          </p>
        </div>
        {componentColor === undefined ? null : (
          <input
            aria-label="Layer color swatch"
            className="component-inspector__color-chip"
            type="color"
            value={componentColor}
            tabIndex={-1}
            disabled
          />
        )}
      </div>

      <div
        className="component-inspector__actions"
        role="group"
        aria-label="Selected layer actions"
      >
        <button
          type="button"
          onClick={() => onDuplicate?.(id)}
          disabled={disabled || onDuplicate === undefined}
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => onRemove?.(id)}
          disabled={disabled || onRemove === undefined}
        >
          Remove
        </button>
      </div>

      <fieldset>
        <legend>Geometry</legend>
        {activeComponent.type === 'field' ? (
          <>
            <p className="component-inspector__help">
              {activeComponent.contour.anchors.length} anchors. Use anchor mode for bounded contour
              edits.
            </p>
            <div className="component-inspector__actions">
              <button
                type="button"
                aria-pressed={anchorEditMode}
                onClick={() => onAnchorEditModeChange?.(!anchorEditMode)}
                disabled={disabled || onAnchorEditModeChange === undefined}
              >
                {anchorEditMode ? 'Done editing anchors' : 'Edit anchors'}
              </button>
              <button
                type="button"
                onClick={onAddAnchor}
                disabled={disabled || !anchorEditMode || onAddAnchor === undefined}
              >
                Add anchor
              </button>
              <button
                type="button"
                onClick={onRemoveAnchor}
                disabled={
                  disabled ||
                  !anchorEditMode ||
                  selectedAnchorId === undefined ||
                  onRemoveAnchor === undefined
                }
              >
                Remove anchor
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="component-inspector__field">
              <label htmlFor={`component-${id}-taper`}>
                <span>Taper</span>
                <small>0–1</small>
              </label>
              <input
                id={`component-${id}-taper`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activeComponent.band.taper}
                disabled={disabled}
                onChange={(event) =>
                  onBandShapeChange?.(id, { taper: Number(event.currentTarget.value) })
                }
              />
            </div>
            <div className="component-inspector__field">
              <label htmlFor={`component-${id}-end-cap`}>
                <span>End cap</span>
              </label>
              <select
                id={`component-${id}-end-cap`}
                value={activeComponent.band.endCap}
                disabled={disabled}
                onChange={(event) =>
                  onBandShapeChange?.(id, {
                    endCap: event.currentTarget.value as Extract<
                      Component,
                      { type: 'band' }
                    >['band']['endCap'],
                  })
                }
              >
                <option value="round">Round</option>
                <option value="flat">Flat</option>
              </select>
            </div>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Transform</legend>
        {TRANSFORM_FIELDS.map(renderNumericField)}
        <div className="component-inspector__field component-inspector__field--range">
          <label htmlFor={`component-${id}-scale-range`}>
            <span>Scale</span>
            <small>0.05–4x</small>
          </label>
          <input
            id={`component-${id}-scale-range`}
            type="range"
            aria-label="Scale slider"
            min={0.05}
            max={4}
            step={0.01}
            value={scaleValue}
            disabled={disabled}
            onPointerDown={() => beginGesture('scale')}
            onPointerUp={() => endGesture('scale')}
            onPointerCancel={() => cancelGesture('scale')}
            onChange={(event) =>
              emitValue(
                TRANSFORM_FIELDS.find((field) => field.control === 'scale')!,
                event.currentTarget.value,
              )
            }
            onBlur={() => endGesture('scale')}
          />
        </div>
        <button
          type="button"
          onClick={onResetTransform}
          disabled={disabled || onResetTransform === undefined}
        >
          Reset transform
        </button>
      </fieldset>

      <fieldset>
        <legend>Texture and blend</legend>
        {APPEARANCE_FIELDS.map(renderNumericField)}
        <div className="component-inspector__field">
          <label htmlFor={`component-${id}-blend-mode`}>
            <span>Blend mode</span>
          </label>
          <select
            id={`component-${id}-blend-mode`}
            name="blendMode"
            value={activeComponent.appearance.blendMode}
            disabled={disabled}
            onChange={(event) =>
              onBlendModeChange?.(
                id,
                event.currentTarget.value as Component['appearance']['blendMode'],
              )
            }
          >
            <option value="normal">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="soft-light">Soft light</option>
          </select>
        </div>
      </fieldset>

      {feedback === undefined ? null : (
        <p className="component-inspector__feedback" role="status">
          {feedback}
        </p>
      )}
    </aside>
  );
}

export default ComponentInspector;
