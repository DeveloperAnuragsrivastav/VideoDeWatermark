import { useState, useEffect, useCallback } from "react";
import logoSvg from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DropZone } from "./components/DropZone";
import { Editor } from "./components/Editor";
import { ProcessingView } from "./components/ProcessingView";
import { DoneView } from "./components/DoneView";
import { SetupView } from "./components/SetupView";
import "./index.css";

export type VideoInfo = {
  path: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  size_bytes: number;
  format_name: string;
};

export type WatermarkRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RemovalMethod = "delogo" | "blur" | "fill";

type Phase =
  | { name: "initializing" }
  | { name: "setup" }
  | { name: "idle" }
  | { name: "editing"; video: VideoInfo; previewFrame: string }
  | { name: "processing"; video: VideoInfo; percent: number }
  | { name: "done"; video: VideoInfo; outputPath: string }
  | { name: "error"; message: string; video?: VideoInfo };

function App() {
  const [phase, setPhase] = useState<Phase>({ name: "initializing" });
  const [region, setRegion] = useState<WatermarkRegion | null>(null);
  const [method, setMethod] = useState<RemovalMethod>("delogo");

  // Reconnaissance: Check if our heavy weapons (ffmpeg) are deployed at startup.
  useEffect(() => {
    (async () => {
      try {
        const status = await invoke<{ ready: boolean }>("get_ffmpeg_status");
        const welcomePlayed = localStorage.getItem("welcomePlayed");
        
        if (!welcomePlayed) {
          // Force them into setup so they get the Welcome message!
          setPhase({ name: "setup" });
        } else if (status.ready) {
          setPhase({ name: "idle" });
        } else {
          setPhase({ name: "setup" });
        }
      } catch {
        setPhase({ name: "setup" });
      }
    })();
  }, []);

  // Radio chatter: Listen for live progress updates from the trenches (Rust backend).
  useEffect(() => {
    const unlisten = listen<{ percent: number }>("processing-progress", (event) => {
      setPhase((prev) => {
        if (prev.name === "processing") {
          return { ...prev, percent: event.payload.percent };
        }
        return prev;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleFfmpegReady = useCallback(() => {
    setPhase({ name: "idle" });
  }, []);

  const handleFileSelected = useCallback(async (path: string) => {
    try {
      const video = await invoke<VideoInfo>("load_video", { path });
      const previewFrame = await invoke<string>("extract_preview", {
        path,
        timestamp: Math.min(1.0, video.duration * 0.1),
      });
      setRegion(null);
      setPhase({ name: "editing", video, previewFrame });
    } catch (err) {
      setPhase({ name: "error", message: String(err) });
    }
  }, []);

  const handleProcess = useCallback(
    async (video: VideoInfo, region: WatermarkRegion) => {
      setPhase({ name: "processing", video, percent: 0 });

      // Secure the extraction point: Build output path in the same sector, with a "_clean" tag.
      const ext = video.path.split(".").pop() || "mp4";
      const base = video.path.replace(/\.[^.]+$/, "");
      const output = `${base}_clean.${ext}`;

      try {
        const result = await invoke<string>("process_video", {
          input: video.path,
          output,
          region,
          method,
          duration: video.duration,
        });
        setPhase({ name: "done", video, outputPath: result });
      } catch (err) {
        const msg = String(err);
        if (msg.includes("cancelled")) {
          setPhase({ name: "editing", video, previewFrame: "" });
          // Tactical retreat: Re-establish visual on the target if they abort.
          try {
            const frame = await invoke<string>("extract_preview", {
              path: video.path,
              timestamp: Math.min(1.0, video.duration * 0.1),
            });
            setPhase({ name: "editing", video, previewFrame: frame });
          } catch {
            setPhase({ name: "editing", video, previewFrame: "" });
          }
        } else {
          setPhase({ name: "error", message: msg, video });
        }
      }
    },
    [method]
  );

  const handleCancel = useCallback(async () => {
    try {
      await invoke("cancel_processing");
    } catch {
      // Ghost town — they already pulled the plug. Ignore.
    }
  }, []);

  const handleReset = useCallback(() => {
    setPhase({ name: "idle" });
    setRegion(null);
  }, []);

  const handleBack = useCallback(() => {
    setPhase((prev) => {
      if (prev.name === "error" && prev.video) {
        return { name: "idle" };
      }
      return { name: "idle" };
    });
    setRegion(null);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header glass">
        <div className="header-brand">
          <img src={logoSvg} alt="VideoDeWatermark Logo" className="header-logo" style={{ height: "40px", width: "auto" }} />
          <div className="header-title">
            Video<span>De</span>Watermark
          </div>
        </div>
        <div className="header-tagline">Clean Video, Zero Trace</div>
        <div className="header-version">v0.1.0</div>
      </header>

      {/* Main Content */}
      <main className="main">
        {phase.name === "setup" && (
          <SetupView onReady={handleFfmpegReady} />
        )}

        {phase.name === "idle" && (
          <DropZone onFileSelected={handleFileSelected} />
        )}

        {phase.name === "editing" && (
          <Editor
            video={phase.video}
            previewFrame={phase.previewFrame}
            region={region}
            onRegionChange={setRegion}
            method={method}
            onMethodChange={setMethod}
            onProcess={handleProcess}
            onBack={handleBack}
          />
        )}

        {phase.name === "processing" && (
          <ProcessingView
            video={phase.video}
            percent={phase.percent}
            onCancel={handleCancel}
          />
        )}

        {phase.name === "done" && (
          <DoneView
            outputPath={phase.outputPath}
            onReset={handleReset}
          />
        )}

        {phase.name === "error" && (
          <div className="error-view">
            <div className="done-checkmark" style={{ background: "rgba(220, 38, 38, 0.1)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className="error-message">{phase.message}</div>
            <button className="btn-secondary" onClick={handleBack}>
              ← Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
