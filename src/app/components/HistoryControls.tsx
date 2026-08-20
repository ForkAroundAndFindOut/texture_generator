export type HistoryControlsProps = {
  readonly depth: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly className?: string;
};

/** Session history controls. Depth is an observable, non-authoritative view. */
export function HistoryControls({
  depth,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: HistoryControlsProps) {
  return (
    <div className={className ?? 'history-controls'} role="group" aria-label="History controls">
      <button type="button" onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo}>
        Redo
      </button>
      <span className="visually-hidden" data-testid="history-depth" aria-label="History depth">
        {depth}
      </span>
    </div>
  );
}

export default HistoryControls;
