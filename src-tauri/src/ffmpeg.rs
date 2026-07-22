use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

/// Safe house. Where we cache the ffmpeg binary so we don't have to call for an airdrop every time.
fn app_bin_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".videodewatermark").join("bin")
}

/// Intel check: Retrieve the platform-specific coordinates (URL) to parachute the ffmpeg payload.
fn ffmpeg_download_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    } else if cfg!(target_os = "macos") {
        "https://evermeet.cx/ffmpeg/getrelease/zip"
    } else {
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    }
}

/// Separate airdrop coordinates for ffprobe on macOS (evermeet serves them individually).
fn ffprobe_download_url() -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some("https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip")
    } else {
        None // Windows & Linux bundles already include ffprobe
    }
}

/// Weapon check: Fire a blank round (-version) to verify the binary is fully operational.
async fn command_works(cmd: &str) -> bool {
    Command::new(cmd)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Common hiding spots where ffmpeg might be stationed on the user's machine.
/// macOS .app bundles don't inherit the shell PATH, so we sweep these manually.
/// Windows users often dump ffmpeg in random folders, so we cover those too.
fn common_bin_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin"),       // Apple Silicon Homebrew
        PathBuf::from("/usr/local/bin"),           // Intel Homebrew / manual installs
        PathBuf::from("/usr/bin"),                 // System default
        PathBuf::from("/bin"),                     // Unlikely but cover our bases
        PathBuf::from("/snap/bin"),                // Ubuntu Snap installs
    ];

    // Windows-specific hiding spots
    if cfg!(target_os = "windows") {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            paths.push(PathBuf::from(format!("{}\\ffmpeg\\bin", program_files)));
        }
        if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
            paths.push(PathBuf::from(format!("{}\\ffmpeg\\bin", local_app)));
        }
        paths.push(PathBuf::from("C:\\ffmpeg\\bin"));
    }

    paths
}

/// Search and rescue: Sweep the perimeter (PATH) first, then check common
/// hiding spots, and finally the safe house for ffmpeg.
/// Returns the extraction coordinates if found, or MIA (None).
pub async fn find_ffmpeg() -> Option<String> {
    // 1. Check system PATH (works in terminal, rarely in .app bundles)
    if command_works("ffmpeg").await {
        return Some("ffmpeg".to_string());
    }

    // 2. Sweep known locations on the filesystem
    let bin_name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    for dir in common_bin_paths() {
        let candidate = dir.join(bin_name);
        if candidate.exists() && command_works(candidate.to_str().unwrap_or("")).await {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    // 3. Check our cached binary in the safe house
    let local = app_bin_dir().join(bin_name);
    if local.exists() && command_works(local.to_str().unwrap_or("")).await {
        return Some(local.to_string_lossy().to_string());
    }

    None
}

/// Find ffprobe: same sweep pattern as ffmpeg — PATH, common paths, then cache.
pub async fn find_ffprobe() -> Option<String> {
    if command_works("ffprobe").await {
        return Some("ffprobe".to_string());
    }

    let bin_name = if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" };
    for dir in common_bin_paths() {
        let candidate = dir.join(bin_name);
        if candidate.exists() && command_works(candidate.to_str().unwrap_or("")).await {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    let local = app_bin_dir().join(bin_name);
    if local.exists() && command_works(local.to_str().unwrap_or("")).await {
        return Some(local.to_string_lossy().to_string());
    }

    None
}

/// The Airdrop: Calling in the heavy artillery from the internet. 
/// We'll radio back our extraction progress to the frontend via the callback.
pub async fn download_ffmpeg<F>(on_status: F) -> Result<String, String>
where
    F: Fn(&str) + Send + 'static,
{
    let bin_dir = app_bin_dir();
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;

    let url = ffmpeg_download_url();
    on_status("Downloading ffmpeg...");

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download ffmpeg: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to download ffmpeg: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read ffmpeg download: {}", e))?;

    on_status("Extracting ffmpeg...");

    let ffmpeg_name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    let ffprobe_name = if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" };

    if cfg!(target_os = "macos") || cfg!(target_os = "windows") {
        // ZIP archives for macOS and Windows
        extract_zip(bytes, bin_dir.clone(), ffmpeg_name.to_string(), ffprobe_name.to_string()).await?;
    } else {
        // tar.xz for Linux
        extract_tar_xz(bytes, bin_dir.clone(), ffmpeg_name.to_string(), ffprobe_name.to_string()).await?;
    }

    // macOS special ops: evermeet.cx ships ffmpeg and ffprobe as separate payloads.
    // We need a second airdrop specifically for ffprobe.
    if let Some(ffprobe_url) = ffprobe_download_url() {
        let probe_path = bin_dir.join(ffprobe_name);
        if !probe_path.exists() {
            on_status("Downloading ffprobe...");
            let probe_resp = reqwest::get(ffprobe_url)
                .await
                .map_err(|e| format!("Failed to download ffprobe: {}", e))?;

            if probe_resp.status().is_success() {
                let probe_bytes = probe_resp
                    .bytes()
                    .await
                    .map_err(|e| format!("Failed to read ffprobe download: {}", e))?;

                on_status("Extracting ffprobe...");
                extract_zip(probe_bytes, bin_dir.clone(), ffprobe_name.to_string(), ffprobe_name.to_string()).await?;
            }
        }
    }

    // Give the troops the clearance codes to execute on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let ffmpeg_path = bin_dir.join(ffmpeg_name);
        let ffprobe_path = bin_dir.join(ffprobe_name);
        if ffmpeg_path.exists() {
            tokio::fs::set_permissions(&ffmpeg_path, std::fs::Permissions::from_mode(0o755))
                .await
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }
        if ffprobe_path.exists() {
            tokio::fs::set_permissions(&ffprobe_path, std::fs::Permissions::from_mode(0o755))
                .await
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }
    }

    let ffmpeg_path = bin_dir.join(ffmpeg_name);
    if ffmpeg_path.exists() {
        on_status("ffmpeg ready!");
        Ok(ffmpeg_path.to_string_lossy().to_string())
    } else {
        Err("ffmpeg binary not found after extraction".to_string())
    }
}

/// Extract ffmpeg/ffprobe from a ZIP archive.
async fn extract_zip(data: bytes::Bytes, dest: PathBuf, ffmpeg_name: String, ffprobe_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        use std::io::{Cursor, Read, Write};

        let reader = Cursor::new(data);
        let mut archive = zip::ZipArchive::new(reader)
            .map_err(|e| format!("Failed to open zip: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;

            let name = file.name().to_string();
            let basename = std::path::Path::new(&name)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if basename == ffmpeg_name || basename == ffprobe_name {
                let out_path = dest.join(&basename);
                let mut buf = Vec::new();
                file.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read {}: {}", basename, e))?;
                let mut out_file = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create {}: {}", basename, e))?;
                out_file.write_all(&buf)
                    .map_err(|e| format!("Failed to write {}: {}", basename, e))?;
            }
        }
        Ok(())
    })
    .await
    .unwrap_or_else(|_| Err("Extraction task panicked".to_string()))
}

/// Extract ffmpeg/ffprobe from a tar.xz archive (Linux).
async fn extract_tar_xz(data: bytes::Bytes, dest: PathBuf, ffmpeg_name: String, ffprobe_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        use std::io::{Cursor, Read, Write};

        let cursor = Cursor::new(data);
        let xz_decoder = xz2::read::XzDecoder::new(cursor);
        let mut archive = tar::Archive::new(xz_decoder);

        let entries = archive.entries()
            .map_err(|e| format!("Failed to read tar entries: {}", e))?;

        for entry_result in entries {
            let mut entry = entry_result
                .map_err(|e| format!("Failed to read tar entry: {}", e))?;

            let path = entry.path()
                .map_err(|e| format!("Failed to get entry path: {}", e))?;

            let basename = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if basename == ffmpeg_name || basename == ffprobe_name {
                let out_path = dest.join(&basename);
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read {}: {}", basename, e))?;
                let mut out_file = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create {}: {}", basename, e))?;
                out_file.write_all(&buf)
                    .map_err(|e| format!("Failed to write {}: {}", basename, e))?;
            }
        }
        Ok(())
    })
    .await
    .unwrap_or_else(|_| Err("Extraction task panicked".to_string()))
}

/// Recon data: The full intel dossier returned from our ffprobe scouts.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VideoInfo {
    pub path: String,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub fps: f64,
    pub codec: String,
    pub size_bytes: u64,
    pub format_name: String,
}

/// Dispatch the scouts: Send ffprobe behind enemy lines to retrieve video specs.
pub async fn get_video_info(ffprobe: &str, path: &str) -> Result<VideoInfo, String> {
    let output = Command::new(ffprobe)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Find the video stream
    let streams = json.get("streams").and_then(|s| s.as_array())
        .ok_or("No streams found in video")?;

    let video_stream = streams.iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"))
        .ok_or("No video stream found")?;

    let width = video_stream.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let height = video_stream.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let codec = video_stream.get("codec_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();

    // Parse FPS from r_frame_rate "30/1" or "30000/1001"
    let fps_str = video_stream.get("r_frame_rate").and_then(|v| v.as_str()).unwrap_or("30/1");
    let fps = parse_fps(fps_str);

    let format = json.get("format").ok_or("No format info found")?;
    let duration = format.get("duration").and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let size_bytes = format.get("size").and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let format_name = format.get("format_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();

    let filename = std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    Ok(VideoInfo {
        path: path.to_string(),
        filename,
        width,
        height,
        duration,
        fps,
        codec,
        size_bytes,
        format_name,
    })
}

fn parse_fps(fps_str: &str) -> f64 {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<f64>().unwrap_or(30.0);
        let den = parts[1].parse::<f64>().unwrap_or(1.0);
        if den > 0.0 { num / den } else { 30.0 }
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    }
}

/// Sniper shot: Extract a single tactical frame from the video and package it as base64 PNG.
pub async fn extract_frame(ffmpeg: &str, path: &str, timestamp: f64) -> Result<String, String> {
    let output = Command::new(ffmpeg)
        .args([
            "-ss", &format!("{:.3}", timestamp),
            "-i", path,
            "-frames:v", "1",
            "-f", "image2pipe",
            "-vcodec", "png",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to extract frame: {}", e))?;

    if !output.status.success() || output.stdout.is_empty() {
        return Err("Failed to extract frame from video".to_string());
    }

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Watermark region coordinates (in actual video pixel space).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatermarkRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Removal method.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum RemovalMethod {
    #[serde(rename = "delogo")]
    Delogo,
    #[serde(rename = "blur")]
    Blur,
    #[serde(rename = "fill")]
    Fill,
}

impl RemovalMethod {
    /// Build the ffmpeg video filter string.
    pub fn to_vf(&self, region: &WatermarkRegion) -> String {
        match self {
            RemovalMethod::Delogo => {
                format!(
                    "delogo=x={}:y={}:w={}:h={}:show=0",
                    region.x, region.y, region.width, region.height
                )
            }
            RemovalMethod::Blur => {
                format!(
                    "split[main][blur];[blur]crop={}:{}:{}:{},boxblur=15[blurred];[main][blurred]overlay={}:{}",
                    region.width, region.height, region.x, region.y,
                    region.x, region.y
                )
            }
            RemovalMethod::Fill => {
                format!(
                    "drawbox=x={}:y={}:w={}:h={}:color=black:t=fill",
                    region.x, region.y, region.width, region.height
                )
            }
        }
    }
}
