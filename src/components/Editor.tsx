import { useRef, useState, useCallback, useEffect } from "react";
import type { VideoInfo, WatermarkRegion, RemovalMethod } from "../App";
import { invoke } from "@tauri-apps/api/core";
import { SelectionCanvas } from "./SelectionCanvas";

type Props = {
  video: VideoInfo;
  previewFrame: string;
  region: WatermarkRegion | null;
  onRegionChange: (region: WatermarkRegion | null) => void;
  method: RemovalMethod;
  onMethodChange: (method: RemovalMethod) => void;
  onProcess: (video: VideoInfo, region: WatermarkRegion) => void;
  onBack: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const METHODS: { value: RemovalMethod; label: string; desc: string }[] = [
  { value: "delogo", label: "Smart Remove", desc: "Interpolates surrounding pixels" },
  { value: "blur", label: "Blur", desc: "Heavy gaussian blur over area" },
  { value: "fill", label: "Black Fill", desc: "Covers with solid black" },
];

export function Editor({
  video,
  previewFrame,
  region,
  onRegionChange,
  method,
  onMethodChange,
  onProcess,
  onBack,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [timestamp, setTimestamp] = useState(Math.min(1.0, video.duration * 0.1));
  const [currentFrame, setCurrentFrame] = useState(previewFrame);
  const [loadingFrame, setLoadingFrame] = useState(false);

  // Track rendered image dimensions for coordinate mapping
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const updateSize = () => {
      setImgSize({ width: img.clientWidth, height: img.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(img);
    return () => observer.disconnect();
  }, [currentFrame]);

  // Fetch new frame when timestamp changes
  const handleTimestampChange = useCallback(
    async (newTimestamp: number) => {
      setTimestamp(newTimestamp);
      setLoadingFrame(true);
      try {
        const frame = await invoke<string>("extract_preview", {
          path: video.path,
          timestamp: newTimestamp,
        });
        setCurrentFrame(frame);
      } catch {
        // Keep current frame
      } finally {
        setLoadingFrame(false);
      }
    },
    [video.path]
  );

  const canProcess = region !== null && region.width > 5 && region.height > 5;

  return (
    <div className="editor">
      {/* Preview Area */}
      <div className="editor-preview">
        <div className="preview-frame glass">
          {currentFrame ? (
            <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%" }}>
              <img
                ref={imgRef}
                src={currentFrame}
                alt="Video preview"
                draggable={false}
                style={{ display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                onLoad={() => {
                  const img = imgRef.current;
                  if (img) setImgSize({ width: img.clientWidth, height: img.clientHeight });
                }}
              />
              {imgSize.width > 0 && (
                <SelectionCanvas
                  canvasWidth={imgSize.width}
                  canvasHeight={imgSize.height}
                  videoWidth={video.width}
                  videoHeight={video.height}
                  region={region}
                  onRegionChange={onRegionChange}
                />
              )}
              {!region && (
                <div className="preview-hint">
                  Click and drag to select the watermark area
                </div>
              )}
            </div>
          ) : (
            <div className="spinner spinner-lg" />
          )}
        </div>

        {/* Timestamp Slider */}
        <div className="timestamp-slider glass">
          <label>Preview at:</label>
          <input
            type="range"
            min={0}
            max={video.duration}
            step={0.1}
            value={timestamp}
            onChange={(e) => handleTimestampChange(Number(e.target.value))}
          />
          <label style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDuration(timestamp)} {loadingFrame && "⏳"}
          </label>
        </div>
      </div>

      {/* Sidebar */}
      <div className="editor-sidebar">
        {/* Video Info */}
        <div className="sidebar-section glass">
          <h4>Video Info</h4>
          <div className="video-meta">
            <div className="meta-row">
              <span className="label">File</span>
              <span className="value" title={video.filename}>
                {video.filename.length > 22
                  ? video.filename.slice(0, 20) + "…"
                  : video.filename}
              </span>
            </div>
            <div className="meta-row">
              <span className="label">Resolution</span>
              <span className="value">{video.width}×{video.height}</span>
            </div>
            <div className="meta-row">
              <span className="label">Duration</span>
              <span className="value">{formatDuration(video.duration)}</span>
            </div>
            <div className="meta-row">
              <span className="label">Size</span>
              <span className="value">{formatBytes(video.size_bytes)}</span>
            </div>
            <div className="meta-row">
              <span className="label">Codec</span>
              <span className="value">{video.codec}</span>
            </div>
          </div>
        </div>

        {/* Selection Region */}
        <div className="sidebar-section glass">
          <h4>Watermark Region</h4>
          {region ? (
            <div className="region-info">
              <div className="region-field">
                <label>X</label>
                <span className="value">{region.x}px</span>
              </div>
              <div className="region-field">
                <label>Y</label>
                <span className="value">{region.y}px</span>
              </div>
              <div className="region-field">
                <label>Width</label>
                <span className="value">{region.width}px</span>
              </div>
              <div className="region-field">
                <label>Height</label>
                <span className="value">{region.height}px</span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Draw a rectangle on the preview to select the watermark
            </p>
          )}
        </div>

        {/* Removal Method */}
        <div className="sidebar-section glass">
          <h4>Removal Method</h4>
          <div className="method-options">
            {METHODS.map((m) => (
              <div
                key={m.value}
                className={`method-option ${method === m.value ? "active" : ""}`}
                onClick={() => onMethodChange(m.value)}
              >
                <div className="method-radio" />
                <div>
                  <div className="method-label">{m.label}</div>
                  <div className="method-desc">{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <button
          className="btn-primary"
          disabled={!canProcess}
          onClick={() => region && onProcess(video, region)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          Remove Watermark
        </button>
        <button className="btn-secondary" onClick={onBack} style={{ marginTop: 8 }}>
          ← Back
        </button>
      </div>
    </div>
  );
}
