import { useId, useState, type ReactNode } from 'react';

export type ViewTab = 'design' | 'generated-css';

export type ViewTabsProps = {
  readonly design: ReactNode;
  readonly generatedCssText: string;
  readonly defaultTab?: ViewTab;
  readonly className?: string;
};

const TABS: readonly { readonly id: ViewTab; readonly label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'generated-css', label: 'Generated CSS' },
];

/**
 * Session-only workspace views. CSS text is a read-only projection of the
 * current render state; this component never becomes an authoring authority.
 */
export function ViewTabs({
  design,
  generatedCssText,
  defaultTab = 'design',
  className,
}: ViewTabsProps) {
  const [selectedTab, setSelectedTab] = useState<ViewTab>(defaultTab);
  const idPrefix = useId();
  const panelId = `${idPrefix}-view-panel`;
  const classNames = ['view-tabs', className].filter(Boolean).join(' ');

  function moveTab(current: ViewTab, delta: number): void {
    const index = TABS.findIndex((tab) => tab.id === current);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    if (next !== undefined) setSelectedTab(next.id);
  }

  return (
    <section className={classNames} aria-label="Workspace views">
      <div className="view-tabs__list" role="tablist" aria-label="Workspace views">
        {TABS.map((tab) => {
          const tabId = `${idPrefix}-tab-${tab.id}`;
          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.id}
              aria-controls={panelId}
              tabIndex={selectedTab === tab.id ? 0 : -1}
              onClick={() => setSelectedTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveTab(tab.id, 1);
                  const next =
                    TABS[(TABS.findIndex((item) => item.id === tab.id) + 1) % TABS.length];
                  document.getElementById(`${idPrefix}-tab-${next?.id}`)?.focus();
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveTab(tab.id, -1);
                  const nextIndex =
                    (TABS.findIndex((item) => item.id === tab.id) - 1 + TABS.length) % TABS.length;
                  const next = TABS[nextIndex];
                  document.getElementById(`${idPrefix}-tab-${next?.id}`)?.focus();
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  const next = event.key === 'Home' ? TABS[0] : TABS.at(-1);
                  if (next !== undefined) {
                    setSelectedTab(next.id);
                    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
                  }
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        className="view-tabs__panel"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${selectedTab}`}
        tabIndex={0}
      >
        {selectedTab === 'design' ? (
          design
        ) : (
          <pre className="view-tabs__code" aria-label="Generated CSS">
            {generatedCssText}
          </pre>
        )}
      </div>
    </section>
  );
}

export default ViewTabs;
