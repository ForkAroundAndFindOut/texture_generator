import { useEffect, useRef, useState } from 'react';

import type { Component, ComponentId } from '../../domain';

export type ComponentReorderDirection = 'up' | 'down';

export type ComponentListPanelProps = {
  /** Components are passed in canonical back-to-front z-order. */
  readonly components: readonly Component[];
  readonly selectedComponentIds?: readonly ComponentId[];
  readonly selectedComponentId?: ComponentId;
  readonly onSelectComponent?: (componentId: ComponentId) => void;
  readonly onSelectComponents?: (componentIds: readonly ComponentId[]) => void;
  readonly onDuplicateComponent?: (componentId: ComponentId) => ComponentId | undefined | void;
  readonly onRemoveComponent?: (componentId: ComponentId) => void;
  readonly onReorderComponent?: (
    componentId: ComponentId,
    direction: ComponentReorderDirection,
  ) => void;
  readonly onReorderTo?: (componentId: ComponentId, targetIndex: number) => void;
  readonly onRenameComponent?: (componentId: ComponentId, name: string) => boolean | void;
  readonly onToggleVisibility?: (componentId: ComponentId) => void;
  readonly isComponentVisible?: (componentId: ComponentId) => boolean;
  readonly colorForComponent?: (component: Component) => string | undefined;
  readonly disabled?: boolean;
  readonly className?: string;
};

/**
 * A front-to-back layer rail. Drag and keyboard/button reordering affect the
 * same canonical component order; this panel never mutates the recipe itself.
 */
export function ComponentListPanel({
  components,
  selectedComponentIds,
  selectedComponentId,
  onSelectComponent,
  onSelectComponents,
  onDuplicateComponent,
  onRemoveComponent,
  onReorderComponent,
  onReorderTo,
  onRenameComponent,
  onToggleVisibility,
  isComponentVisible,
  colorForComponent,
  disabled = false,
  className,
}: ComponentListPanelProps) {
  const [draggedId, setDraggedId] = useState<ComponentId | undefined>(undefined);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const selected = new Set<ComponentId>(
    selectedComponentIds ?? (selectedComponentId === undefined ? [] : [selectedComponentId]),
  );
  const visibleComponents = [...components].reverse();
  const previousComponents = useRef(components);

  useEffect(() => {
    if (previousComponents.current === components) return;
    previousComponents.current = components;
    setNameDrafts((current) => {
      const next: Record<string, string> = {};
      for (const component of components) {
        if (current[component.id] !== undefined) next[component.id] = current[component.id]!;
      }
      return next;
    });
  }, [components]);

  function select(componentId: ComponentId): void {
    if (onSelectComponents !== undefined) onSelectComponents([componentId]);
    else onSelectComponent?.(componentId);
  }

  function commitName(component: Component): void {
    const draft = nameDrafts[component.id];
    if (draft === undefined) return;
    const next = draft.trim();
    const result = onRenameComponent?.(component.id, next);
    if (result === false || next.length === 0) {
      setNameDrafts((current) => {
        const updated = { ...current };
        delete updated[component.id];
        return updated;
      });
      return;
    }
    setNameDrafts((current) => {
      const updated = { ...current };
      delete updated[component.id];
      return updated;
    });
  }

  function moveToDroppedIndex(componentId: ComponentId, displayedTargetIndex: number): void {
    if (onReorderTo === undefined) return;
    const canonicalTargetIndex = components.length - 1 - displayedTargetIndex;
    onReorderTo(componentId, canonicalTargetIndex);
  }

  const panelClassName = className ?? 'component-list-panel';

  return (
    <section className={panelClassName} aria-labelledby="layers-panel-title">
      <div className="component-list-panel__header">
        <div>
          <h2 id="layers-panel-title">Layers</h2>
          <p>Front at top · back at bottom</p>
        </div>
        <span className="component-list-panel__count">{components.length}</span>
      </div>

      {components.length === 0 ? (
        <p className="component-list-panel__empty">Add a Field or Band to begin a texture.</p>
      ) : (
        <ol className="component-list-panel__list" aria-label="Layers">
          {visibleComponents.map((component, displayedIndex) => {
            const isSelected = selected.has(component.id);
            const isVisible = isComponentVisible?.(component.id) ?? true;
            const color = colorForComponent?.(component);
            return (
              <li
                key={component.id}
                className={`component-list-panel__row${isSelected ? ' is-selected' : ''}${isVisible ? '' : ' is-hidden'}`}
                data-component-id={component.id}
                data-component-type={component.type}
                data-z-order={components.length - 1 - displayedIndex}
                aria-posinset={displayedIndex + 1}
                aria-setsize={components.length}
                draggable={!disabled && onReorderTo !== undefined}
                onDragStart={(event) => {
                  setDraggedId(component.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', component.id);
                }}
                onDragOver={(event) => {
                  if (draggedId !== undefined) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source =
                    draggedId ?? (event.dataTransfer.getData('text/plain') as ComponentId);
                  if (source !== undefined && source !== component.id)
                    moveToDroppedIndex(source, displayedIndex);
                  setDraggedId(undefined);
                }}
                onDragEnd={() => setDraggedId(undefined)}
                onClick={() => select(component.id)}
              >
                <div className="component-list-panel__row-main">
                  <button
                    type="button"
                    className="component-list-panel__select"
                    aria-label={`Select ${component.name}`}
                    aria-pressed={isSelected}
                    onClick={(event) => {
                      event.stopPropagation();
                      select(component.id);
                    }}
                    disabled={disabled}
                  >
                    <span className="component-list-panel__type-icon" aria-hidden="true">
                      {component.type === 'field' ? '●' : '━'}
                    </span>
                  </button>
                  <div className="component-list-panel__identity">
                    <label className="visually-hidden" htmlFor={`layer-name-${component.id}`}>
                      Rename {component.name}
                    </label>
                    <input
                      id={`layer-name-${component.id}`}
                      aria-label={`Layer name ${component.name}`}
                      value={nameDrafts[component.id] ?? component.name}
                      maxLength={80}
                      disabled={disabled || onRenameComponent === undefined}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setNameDrafts((current) => ({
                          ...current,
                          [component.id]: event.currentTarget.value,
                        }))
                      }
                      onBlur={() => commitName(component)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') {
                          setNameDrafts((current) => {
                            const updated = { ...current };
                            delete updated[component.id];
                            return updated;
                          });
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <span className="component-list-panel__type">{component.type}</span>
                  </div>
                  {color === undefined ? null : (
                    <input
                      className="component-list-panel__color-chip"
                      aria-label={`${component.name} color`}
                      type="color"
                      value={color}
                      tabIndex={-1}
                      disabled
                    />
                  )}
                </div>
                <div
                  className="component-list-panel__row-actions"
                  aria-label={`${component.name} actions`}
                >
                  <button
                    type="button"
                    aria-label={isVisible ? 'Hide layer' : 'Show layer'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleVisibility?.(component.id);
                    }}
                    disabled={disabled || onToggleVisibility === undefined}
                  >
                    {isVisible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    aria-label="Move layer up"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorderComponent?.(component.id, 'up');
                    }}
                    disabled={disabled || onReorderComponent === undefined || displayedIndex === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move layer down"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorderComponent?.(component.id, 'down');
                    }}
                    disabled={
                      disabled ||
                      onReorderComponent === undefined ||
                      displayedIndex === visibleComponents.length - 1
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Duplicate layer"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicateComponent?.(component.id);
                    }}
                    disabled={disabled || onDuplicateComponent === undefined}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    aria-label="Remove layer"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveComponent?.(component.id);
                    }}
                    disabled={disabled || onRemoveComponent === undefined}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default ComponentListPanel;
