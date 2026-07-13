import { useEffect, useState } from "react";
import {
  ACTIONS,
  bindingFor,
  comboFromEvent,
  formatCombo,
  isCustom,
  resetAllBindings,
  setBinding,
} from "../keys";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const [recording, setRecording] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((n) => n + 1);

  // Record the next key combo pressed while a row is armed.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setConflict(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // bare modifier — keep waiting
      if (!/^(Mod|Ctrl|Alt)-/.test(combo) && !/^F\d+$/.test(combo)) {
        setConflict("Shortcuts need a modifier key (⌘, ⌥ or ⌃).");
        return;
      }
      const clash = ACTIONS.find((a) => a.id !== recording && bindingFor(a.id) === combo);
      if (clash) {
        setConflict(`${formatCombo(combo)} is already used by “${clash.label}”.`);
        return;
      }
      setBinding(recording, combo);
      setRecording(null);
      setConflict(null);
      refresh();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  // Escape closes the dialog when not recording.
  useEffect(() => {
    if (recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <h2>Settings</h2>
        <p className="modal-hint">Keyboard shortcuts — click one, then press the new combination.</p>
        <div className="settings-list">
          {ACTIONS.map((a) => (
            <div className="settings-row" key={a.id}>
              <span className="settings-label">{a.label}</span>
              {isCustom(a.id) && recording !== a.id && (
                <button
                  className="settings-reset"
                  title={`Reset to ${formatCombo(a.def)}`}
                  onClick={() => {
                    setBinding(a.id, null);
                    refresh();
                  }}
                >
                  reset
                </button>
              )}
              <button
                className={`settings-key${recording === a.id ? " settings-key-recording" : ""}`}
                onClick={() => {
                  setRecording(recording === a.id ? null : a.id);
                  setConflict(null);
                }}
              >
                {recording === a.id ? "Press keys…" : formatCombo(bindingFor(a.id))}
              </button>
            </div>
          ))}
        </div>
        {conflict && <div className="picker-error">{conflict}</div>}
        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              resetAllBindings();
              setRecording(null);
              setConflict(null);
              refresh();
            }}
          >
            Restore defaults
          </button>
          <span className="modal-spacer" />
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
