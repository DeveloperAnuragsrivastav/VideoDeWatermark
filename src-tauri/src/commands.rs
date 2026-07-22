use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use tauri::{Emitter, Manager, State, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use std::process::Stdio;

use crate::ffmpeg::{self, RemovalMethod, VideoInfo, WatermarkRegion};
use crate::progress;

/// The tactical war room state. Holds the kill-switch (cancel token) 
/// so we can pull the plug on the operation at a moment's notice.
pub struct ProcessState {
    pub cancel_token: Arc<Mutex<Arc<AtomicBool>>>,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            cancel_token: Arc::new(Mutex::new(progress::create_cancel_token())),
        }
    }
}

/// Recon mission: Check if our heavy artillery (ffmpeg & ffprobe) is locked and loaded.
#[tauri::command]
pub async fn get_ffmpeg_status() -> Result<serde_json::Value, String> {
    let ffmpeg = ffmpeg::find_ffmpeg().await;
    let ffprobe = ffmpeg::find_ffprobe().await;
    Ok(serde_json::json!({
        "ffmpeg": ffmpeg,
        "ffprobe": ffprobe,
        "ready": ffmpeg.is_some() && ffprobe.is_some(),
    }))
}

/// Download ffmpeg on first run (YOINKS-style).
#[tauri::command]
pub async fn ensure_ffmpeg(window: Window) -> Result<String, String> {
    // Hold up, maybe we already secured the package?
    if let Some(path) = ffmpeg::find_ffmpeg().await {
        return Ok(path);
    }

    // Negative, ghost rider. Initiating airdrop sequence.
    let win = window.clone();
    ffmpeg::download_ffmpeg(move |status| {
        let _ = win.emit("ffmpeg-status", status);
    }).await
}

/// Open a file picker dialog for video files.
#[tauri::command]
pub async fn pick_video_file() -> Result<Option<String>, String> {
    // We'll handle this from the frontend using the dialog plugin
    // This is a placeholder — actual dialog is called from JS
    Ok(None)
}

/// Load a video file and return its metadata.
#[tauri::command]
pub async fn load_video(path: String) -> Result<VideoInfo, String> {
    let ffprobe = ffmpeg::find_ffprobe().await
        .ok_or("ffprobe not found. Please ensure ffmpeg is installed.")?;
    ffmpeg::get_video_info(&ffprobe, &path).await
}

/// Extract a preview frame at a given timestamp.
#[tauri::command]
pub async fn extract_preview(path: String, timestamp: f64) -> Result<String, String> {
    let ffmpeg_path = ffmpeg::find_ffmpeg().await
        .ok_or("ffmpeg not found. Please ensure ffmpeg is installed.")?;
    ffmpeg::extract_frame(&ffmpeg_path, &path, timestamp).await
}

/// The main event. Go loud and scrub that watermark off the frame.
/// We'll radio back progress updates ("processing-progress") to headquarters in real-time.
#[tauri::command]
pub async fn process_video(
    window: Window,
    app: tauri::AppHandle,
    input: String,
    output: String,
    region: WatermarkRegion,
    method: RemovalMethod,
    duration: f64,
) -> Result<String, String> {
    let ffmpeg_path = ffmpeg::find_ffmpeg().await
        .ok_or("ffmpeg not found")?;

    // Create a new cancel token for this run
    let cancel_token = progress::create_cancel_token();
    {
        let state: State<ProcessState> = app.state();
        let mut token = state.cancel_token.lock().unwrap();
        *token = cancel_token.clone();
    }

    let vf = method.to_vf(&region);

    let mut child = Command::new(&ffmpeg_path)
        .args([
            "-i", &input,
            "-map", "0:v",
            "-map", "0:a?",        // Optional audio map. Don't crash if it's a silent film.
            "-vf", &vf,
            "-c:a", "copy",       // Smuggle the audio out untouched.
            "-y",                  // No mercy. Overwrite the target.
            "-progress", "pipe:2", // Pipe tactical intel (progress) directly to stderr.
            &output,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    // Read stderr for progress
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let mut reader = BufReader::new(stderr).lines();

    let win = window.clone();
    let token = cancel_token.clone();

    // Spawn a task to read progress
    let progress_handle = tokio::spawn(async move {
        let mut current_line_buf = String::new();
        while let Ok(Some(line)) = reader.next_line().await {
            if progress::is_cancelled(&token) {
                break;
            }
            current_line_buf.push_str(&line);
            current_line_buf.push('\n');

            if let Some(percent) = progress::parse_progress_line(&line, duration) {
                let _ = win.emit("processing-progress", serde_json::json!({
                    "percent": percent,
                    "time_str": &line,
                }));
            }
        }
    });

    // Hold the line until the bombardment finishes...
    let status = child.wait().await
        .map_err(|e| format!("ffmpeg process error: {}", e))?;

    // Recon: Did the commander (user) hit the abort button while we were in the trenches?
    let user_cancelled = progress::is_cancelled(&cancel_token);

    // Stand down the intel listener thread. Operation is over.
    progress::cancel(&cancel_token);
    let _ = progress_handle.await;

    if user_cancelled {
        // Clean up output file on cancel
        let _ = tokio::fs::remove_file(&output).await;
        return Err("Processing cancelled".to_string());
    }

    if status.success() {
        let _ = window.emit("processing-progress", serde_json::json!({
            "percent": 1.0,
            "time_str": "complete",
        }));
        Ok(output)
    } else {
        Err("ffmpeg failed to process the video".to_string())
    }
}

/// Smash the big red ABORT button. Pull our troops out immediately.
#[tauri::command]
pub async fn cancel_processing(app: tauri::AppHandle) -> Result<(), String> {
    let state: State<ProcessState> = app.state();
    let token = state.cancel_token.lock().unwrap();
    progress::cancel(&token);
    Ok(())
}
