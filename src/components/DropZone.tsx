import { useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";

type Props = {
  onFileSelected: (path: string) => void;
};

const SUPPORTED_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "ts", "3gp"];

export function DropZone({ onFileSelected }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const validateFile = useCallback((path: string): boolean => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported format: .${ext}. Try MP4, MKV, AVI, MOV, or WebM.`);
      return false;
    }
    setError(null);
    return true;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        // In Tauri, dropped files give us the path
        const path = (file as any).path || file.name;
        if (validateFile(path)) {
          onFileSelected(path);
        }
      }
    },
    [onFileSelected, validateFile]
  );

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Video Files",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (selected) {
        const path = typeof selected === "string" ? selected : selected;
        if (path && validateFile(path as string)) {
          onFileSelected(path as string);
        }
      }
    } catch {
      // User cancelled
    }
  }, [onFileSelected, validateFile]);

  return (
    <div className="dropzone-container">
      <div
        ref={dropRef}
        className={`dropzone glass ${isDragOver ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowse}
      >
        <div className="dropzone-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="dropzone-text">
          <h3>{isDragOver ? "Drop it here!" : "Drop your video here"}</h3>
          <p>or click to browse files</p>
        </div>
        <div className="dropzone-formats">
          MP4 · MKV · AVI · MOV · WebM · FLV
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ animation: "fadeIn 0.3s ease" }}>
          {error}
        </div>
      )}

      <button className="btn-browse" onClick={handleBrowse}>
        Browse Files
      </button>
    </div>
  );
}
