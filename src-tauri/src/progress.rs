use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Parse ffmpeg's stderr progress output into a percentage.
/// ffmpeg outputs lines like:
///   frame=  120 fps= 30 q=28.0 size=    1234kB time=00:00:04.00 bitrate=2527.4kbits/s speed=1.2x
///
/// We extract the `time=` value and compare it against the total duration.
pub fn parse_progress_line(line: &str, total_duration: f64) -> Option<f64> {
    if total_duration <= 0.0 {
        return None;
    }

    // Find "time=" in the line
    let time_idx = line.find("time=")?;
    let time_str = &line[time_idx + 5..];

    // Extract the time value (format: HH:MM:SS.ms or negative like -00:00:00.00)
    let end = time_str.find(|c: char| c == ' ' || c == '\r' || c == '\n').unwrap_or(time_str.len());
    let time_val = &time_str[..end];

    // Skip negative time values (happen at the start)
    if time_val.starts_with('-') {
        return Some(0.0);
    }

    let seconds = parse_time_to_seconds(time_val)?;
    let percent = (seconds / total_duration).min(1.0).max(0.0);
    Some(percent)
}

/// Parse a time string like "00:01:23.45" into seconds.
fn parse_time_to_seconds(time: &str) -> Option<f64> {
    let parts: Vec<&str> = time.split(':').collect();
    match parts.len() {
        3 => {
            let hours = parts[0].parse::<f64>().ok()?;
            let minutes = parts[1].parse::<f64>().ok()?;
            let seconds = parts[2].parse::<f64>().ok()?;
            Some(hours * 3600.0 + minutes * 60.0 + seconds)
        }
        2 => {
            let minutes = parts[0].parse::<f64>().ok()?;
            let seconds = parts[1].parse::<f64>().ok()?;
            Some(minutes * 60.0 + seconds)
        }
        1 => parts[0].parse::<f64>().ok(),
        _ => None,
    }
}

/// A cancellation token that can be shared across threads.
pub fn create_cancel_token() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

pub fn is_cancelled(token: &Arc<AtomicBool>) -> bool {
    token.load(Ordering::Relaxed)
}

pub fn cancel(token: &Arc<AtomicBool>) {
    token.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_progress() {
        let line = "frame=  120 fps= 30 q=28.0 size=    1234kB time=00:00:04.00 bitrate=2527.4kbits/s speed=1.2x";
        let result = parse_progress_line(line, 10.0);
        assert_eq!(result, Some(0.4));
    }

    #[test]
    fn test_parse_time() {
        assert_eq!(parse_time_to_seconds("00:01:30.50"), Some(90.5));
        assert_eq!(parse_time_to_seconds("01:00:00.00"), Some(3600.0));
    }
}
