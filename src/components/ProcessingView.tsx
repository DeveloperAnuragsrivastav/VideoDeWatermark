import type { VideoInfo } from "../App";

type Props = {
  video: VideoInfo;
  percent: number;
  onCancel: () => void;
};

export function ProcessingView({ video, percent, onCancel }: Props) {
  const displayPercent = Math.round(percent * 100);

  return (
    <div className="processing">
      <div className="spinner spinner-lg" />
      <div className="processing-title">Removing Watermark...</div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {video.filename}
      </p>

      <div className="progress-container">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${displayPercent}%` }}
          />
        </div>
        <div className="progress-info">
          <span className="progress-percent">{displayPercent}%</span>
          <span>Processing video...</span>
        </div>
      </div>

      <button className="btn-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
