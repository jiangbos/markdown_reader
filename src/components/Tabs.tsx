import { displayName } from "../api";
import { XIcon } from "./Icons";
import type { Tab } from "../types";

interface Props {
  tabs: Tab[];
  activeId: string | null;
  dirtyPaths: Set<string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export default function Tabs({ tabs, activeId, dirtyPaths, onActivate, onClose }: Props) {
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isDirty = dirtyPaths.has(tab.path);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`tab${isActive ? " tab-active" : ""}`}
            title={tab.path}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.id);
              } else if (e.button === 0) {
                onActivate(tab.id);
              }
            }}
          >
            <span className="tab-title">{displayName(tab.path)}</span>
            <button
              className={`tab-close${isDirty ? " tab-dirty" : ""}`}
              aria-label={`Close ${displayName(tab.path)}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              <span className="tab-dot" />
              <XIcon size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
