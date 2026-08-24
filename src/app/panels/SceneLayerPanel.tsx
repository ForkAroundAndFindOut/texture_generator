import { useEffect, useRef, useState } from 'react';

import type { GroupId, SceneGroup } from '../../domain';

export type SceneLayerPanelProps = {
  readonly groups: readonly SceneGroup[];
  readonly selectedGroupId?: GroupId;
  readonly onSelect: (groupId: GroupId) => void;
  readonly onRename: (groupId: GroupId, name: string) => boolean;
  readonly onSetVisibility: (groupId: GroupId, visible: boolean) => boolean;
  readonly onReorder: (groupId: GroupId, direction: 'up' | 'down') => void;
  readonly onReorderTo?: (groupId: GroupId, targetIndex: number) => void;
  readonly onDuplicate: (groupId: GroupId) => void;
  readonly onRemove: (groupId: GroupId) => void;
};

export function canonicalIndexForSceneLayerDrop(
  groups: readonly SceneGroup[],
  sourceGroupId: GroupId,
  targetGroupId: GroupId,
  position: 'before' | 'after',
): number | undefined {
  if (sourceGroupId === targetGroupId) return undefined;
  const displayedIds = [...groups].reverse().map((group) => group.id);
  const sourceIndex = displayedIds.indexOf(sourceGroupId);
  const targetIndex = displayedIds.indexOf(targetGroupId);
  if (sourceIndex < 0 || targetIndex < 0) return undefined;
  const remaining = displayedIds.filter((id) => id !== sourceGroupId);
  let displayedInsertionIndex = targetIndex + (position === 'after' ? 1 : 0);
  if (sourceIndex < displayedInsertionIndex) displayedInsertionIndex -= 1;
  displayedInsertionIndex = Math.max(0, Math.min(remaining.length, displayedInsertionIndex));
  return groups.length - displayedInsertionIndex - 1;
}

/** Front-to-back layer rail for the scene's durable root-group z order. */
export function SceneLayerPanel({
  groups,
  selectedGroupId,
  onSelect,
  onRename,
  onSetVisibility,
  onReorder,
  onReorderTo,
  onDuplicate,
  onRemove,
}: SceneLayerPanelProps) {
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draggedGroupId, setDraggedGroupId] = useState<GroupId | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<
    { readonly groupId: GroupId; readonly position: 'before' | 'after' } | undefined
  >(undefined);
  const previousGroups = useRef(groups);
  const visibleGroups = [...groups].reverse();

  useEffect(() => {
    if (previousGroups.current === groups) return;
    previousGroups.current = groups;
    setDraftNames((current) => {
      const next: Record<string, string> = {};
      for (const group of groups) {
        if (current[group.id] !== undefined) next[group.id] = current[group.id]!;
      }
      return next;
    });
  }, [groups]);

  function commitName(group: SceneGroup): void {
    const draft = draftNames[group.id];
    if (draft === undefined) return;
    const accepted = onRename(group.id, draft);
    if (!accepted) return;
    setDraftNames((current) => {
      const next = { ...current };
      delete next[group.id];
      return next;
    });
  }

  function clearLayerDrag(): void {
    setDraggedGroupId(undefined);
    setDropTarget(undefined);
  }

  return (
    <section className="scene-layer-panel" aria-labelledby="scene-layers-title">
      <div className="scene-panel-heading">
        <div>
          <p className="editor-eyebrow">Composition</p>
          <h2 id="scene-layers-title">Layers</h2>
        </div>
        <span className="scene-panel-count">{groups.length}</span>
      </div>
      <p className="scene-panel-copy">Front at top. New layers always start there.</p>
      {groups.length === 0 ? (
        <p className="scene-layer-panel__empty">Add a visual gesture to begin your composition.</p>
      ) : (
        <ol className="scene-layer-panel__list" aria-label="Composition layers">
          {visibleGroups.map((group, displayedIndex) => {
            const selected = group.id === selectedGroupId;
            const isFront = displayedIndex === 0;
            const isBack = displayedIndex === visibleGroups.length - 1;
            const dropPosition = dropTarget?.groupId === group.id ? dropTarget.position : undefined;
            return (
              <li
                key={group.id}
                className={`scene-layer-row${selected ? ' is-selected' : ''}${group.visible ? '' : ' is-hidden'}${dropPosition === 'before' ? ' is-drop-before' : ''}${dropPosition === 'after' ? ' is-drop-after' : ''}`}
                data-scene-group-id={group.id}
                data-z-order={groups.length - 1 - displayedIndex}
                aria-posinset={displayedIndex + 1}
                aria-setsize={groups.length}
                onDragOver={(event) => {
                  if (draggedGroupId === undefined || draggedGroupId === group.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    groupId: group.id,
                    position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceGroupId =
                    draggedGroupId ?? (event.dataTransfer.getData('text/plain') as GroupId);
                  const position =
                    dropTarget?.groupId === group.id ? dropTarget.position : 'before';
                  const targetIndex = canonicalIndexForSceneLayerDrop(
                    groups,
                    sourceGroupId,
                    group.id,
                    position,
                  );
                  if (targetIndex !== undefined) onReorderTo?.(sourceGroupId, targetIndex);
                  clearLayerDrag();
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDropTarget(undefined);
                  }
                }}
                onDragEnd={clearLayerDrag}
                onClick={() => onSelect(group.id)}
              >
                <div className="scene-layer-row__main">
                  <button
                    type="button"
                    className="scene-layer-row__drag-handle"
                    draggable={onReorderTo !== undefined}
                    aria-label={`Drag to reorder ${group.name}`}
                    title="Drag to reorder"
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      if (onReorderTo === undefined) return;
                      event.stopPropagation();
                      setDraggedGroupId(group.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', group.id);
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <button
                    type="button"
                    className="scene-layer-row__select"
                    aria-label={`Select ${group.name}`}
                    aria-pressed={selected}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(group.id);
                    }}
                  >
                    <span aria-hidden="true">◒</span>
                  </button>
                  <label className="scene-layer-row__identity">
                    <span className="visually-hidden">Layer name</span>
                    <input
                      value={draftNames[group.id] ?? group.name}
                      maxLength={80}
                      aria-label={`Layer name ${group.name}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraftNames((current) => ({
                          ...current,
                          [group.id]: value,
                        }));
                      }}
                      onBlur={() => commitName(group)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') {
                          setDraftNames((current) => {
                            const next = { ...current };
                            delete next[group.id];
                            return next;
                          });
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <small>
                      {group.children.length} material{group.children.length === 1 ? '' : 's'}
                    </small>
                  </label>
                </div>
                <div className="scene-layer-row__actions" aria-label={`${group.name} actions`}>
                  <button
                    type="button"
                    aria-label={group.visible ? 'Hide layer' : 'Show layer'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSetVisibility(group.id, !group.visible);
                    }}
                  >
                    {group.visible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    aria-label="Move layer up"
                    disabled={isFront}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorder(group.id, 'up');
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move layer down"
                    disabled={isBack}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorder(group.id, 'down');
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Duplicate layer"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate(group.id);
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    aria-label="Remove layer"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(group.id);
                    }}
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

export default SceneLayerPanel;
