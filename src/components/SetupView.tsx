import { useState, useEffect } from "react";
import welcomeSound from "../assets/welcome.mp3";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Props = {
  onReady: () => void;
};

export function SetupView({ onReady }: Props) {
  const [step, setStep] = useState<"init" | "welcome" | "downloading">("init");
  const [status, setStatus] = useState("Checking for ffmpeg...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Tap into the radio frequency for incoming status transmissions from base camp (Rust)
    const unlisten = listen<string>("ffmpeg-status", (event) => {
      setStatus(event.payload);
    });

    // Scouting run: Do we already have the heavy weapons in the armory?
    (async () => {
      try {
        const result = await invoke<{ ready: boolean }>("get_ffmpeg_status");
        const welcomePlayed = localStorage.getItem("welcomePlayed");

        // Negative on the weapons check. Do we need to brief the commander first?
        if (!welcomePlayed) {
          setStep("welcome");
        } else if (result.ready) {
          onReady();
        } else {
          startDownload();
        }
      } catch (err) {
        setError(String(err));
      }
    })();

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onReady]);

  const startDownload = async () => {
    setStep("downloading");
    setStatus("ffmpeg not found. Setting up...");
    try {
      await invoke<string>("ensure_ffmpeg");
      setStatus("ffmpeg ready!");
      setTimeout(onReady, 800);
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlayWelcome = () => {
    const audio = new Audio(welcomeSound);
    audio.play().catch(console.error);
    localStorage.setItem("welcomePlayed", "true");
    startDownload();
  };

  if (step === "welcome") {
    return (
      <div className="setup">
        <div className="setup-icon" style={{ background: "rgba(220, 38, 38, 0.1)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="setup-title">Message from the Developer</div>
        <div className="setup-text">
          Hey there! The Developer has a quick message for you before we finish setting up VideoDeWatermark.
        </div>
        <button
          className="btn-primary"
          onClick={handlePlayWelcome}
          style={{ width: "auto", padding: "12px 32px", marginTop: "8px" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Play Message & Continue
        </button>
      </div>
    );
  }

  return (
    <div className="setup">
      <div className="setup-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>

      <div className="setup-title">Setting Up</div>

      <div className="setup-text">
        VideoDeWatermark needs ffmpeg to process videos.
        {step === "downloading"
          ? " Downloading it now — this only happens once."
          : " Checking your system..."}
      </div>

      {error ? (
        <>
          <div className="error-message">{error}</div>
          <button
            className="btn-primary"
            style={{ width: "auto", padding: "10px 24px" }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
          <div className="setup-text" style={{ fontSize: 12 }}>
            Or install ffmpeg manually: <strong>brew install ffmpeg</strong> (macOS) / <strong>sudo apt install ffmpeg</strong> (Linux)
          </div>
        </>
      ) : (
        <div className="setup-status">
          <div className="spinner" />
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
