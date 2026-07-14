import { useEffect, useState } from "react";
import EditorPane from "./EditorPane";
import { api, basename } from "../api";
import { fileKind } from "../fileTypes";
import { FileIcon } from "./Icons";

interface Props {
  path: string;
  visible: boolean;
  reading: boolean;
  onOpenFile: (path: string, newTab: boolean) => void;
}

/** Picks the right viewer for a tab: markdown gets the editor, media renders
 * natively, everything else is shown as read-only text (or a "can't open"
 * panel when the server reports binary content). */
export default function FileViewer(props: Props) {
  const kind = fileKind(props.path);
  if (kind === "markdown") return <EditorPane {...props} />;

  const { path, visible } = props;
  const style = { display: visible ? undefined : "none" };
  const raw = api.rawUrl(path);

  switch (kind) {
    case "image":
      return (
        <div className="file-view" style={style}>
          <div className="media-view">
            <img src={raw} alt={basename(path)} />
          </div>
        </div>
      );
    case "pdf":
      return (
        <div className="file-view" style={style}>
          <iframe className="pdf-frame" src={raw} title={basename(path)} />
        </div>
      );
    case "video":
      return (
        <div className="file-view" style={style}>
          <div className="media-view">
            <video src={raw} controls />
          </div>
        </div>
      );
    case "audio":
      return (
        <div className="file-view" style={style}>
          <div className="media-view">
            <audio src={raw} controls />
          </div>
        </div>
      );
    default:
      return <TextView path={path} visible={visible} />;
  }
}

function TextView({ path, visible }: { path: string; visible: boolean }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    api.readFile(path).then(
      (res) => {
        if (!cancelled) setContent(res.content);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="file-view" style={{ display: visible ? undefined : "none" }}>
      {error ? (
        <div className="unsupported">
          <FileIcon size={30} />
          <p className="unsupported-name">{basename(path)}</p>
          <p>This file can’t be opened here.</p>
          <p className="pane-error-detail">{error}</p>
        </div>
      ) : content === null ? null : (
        <div className="text-view">
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
}
