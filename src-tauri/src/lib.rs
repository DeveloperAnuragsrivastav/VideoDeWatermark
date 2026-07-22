mod commands;
mod ffmpeg;
mod progress;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::ProcessState::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_video,
            commands::extract_preview,
            commands::process_video,
            commands::cancel_processing,
            commands::pick_video_file,
            commands::get_ffmpeg_status,
            commands::ensure_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
