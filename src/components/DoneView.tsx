import { revealItemInDir } from "@tauri-apps/plugin-opener";

type Props = {
  outputPath: string;
  onReset: () => void;
};

export function DoneView({ outputPath, onReset }: Props) {
  const filename = outputPath.split(/[/\\]/).pop() || outputPath;

  const handleOpenFolder = async () => {
    try {
      await revealItemInDir(outputPath);
    } catch {
      // fallback — ignore
    }
  };

  return (
    <div className="done">
      <div className="done-checkmark">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div className="done-title">Watermark Removed!</div>
      <div className="done-subtitle">
        Saved as: <strong>{filename}</strong>
      </div>

      <div className="done-actions">
        <button className="btn-primary" onClick={handleOpenFolder}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5H7a5 5 0 0 0-5 5v5z" />
          </svg>
          Open Folder
        </button>
      </div>

      <button
        className="btn-secondary"
        onClick={onReset}
        style={{ marginTop: 8, width: "auto", padding: "10px 32px" }}
      >
        Remove Another Watermark
      </button>
    </div>
  );
}
