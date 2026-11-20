// استوديو الحركة الذكي — نسخة ويندوز (Tauri 2)
// أوامر محلية حقيقية: حفظ الملفات، كشف الأدوات، تحويل MP4 عبر FFmpeg، Piper، Whisper.

use base64::Engine;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
struct ProgressPayload {
    seconds: f64,
    total: f64,
}

fn tools_dir() -> PathBuf {
    if let Some(dir) = dirs_local() {
        let p = dir.join("msaipro");
        let _ = std::fs::create_dir_all(&p);
        return p;
    }
    PathBuf::from(".")
}

#[cfg(windows)]
fn dirs_local() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

#[cfg(not(windows))]
fn dirs_local() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share"))
}

fn has_executable(name: &str) -> bool {
    let path_env = std::env::var_os("PATH").unwrap_or_default();
    let exts: Vec<String> = if cfg!(windows) {
        vec!["".into(), ".exe".into()]
    } else {
        vec!["".into()]
    };
    for dir in std::env::split_paths(&path_env) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return true;
            }
        }
    }
    // also check our managed tools folder
    for ext in &exts {
        let candidate = tools_dir().join("bin").join(format!("{name}{ext}"));
        if candidate.is_file() {
            return true;
        }
    }
    false
}

#[tauri::command]
fn detect_tools() -> serde_json::Value {
    serde_json::json!({
        "ffmpeg": has_executable("ffmpeg"),
        "piper": has_executable("piper"),
        "whisper": has_executable("whisper-cli") || has_executable("whisper") || has_executable("main"),
    })
}

#[tauri::command]
fn save_file(
    app: AppHandle,
    default_name: String,
    data_base64: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    let filter_name = "ملف";
    app.dialog()
        .file()
        .add_filter(filter_name, &["mp4", "webm", "srt", "json"])
        .set_file_name(&default_name)
        .save_file(move |path| {
            tx.send(path.and_then(|p| p.into_path().ok())).ok();
        });
    let Some(path) = rx.recv().map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn transcode_to_mp4(app: AppHandle, input: String, output: String) -> Result<bool, String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg غير مثبت")?;
    let mut child = Command::new(&ffmpeg)
        .args([
            "-y",
            "-i",
            &input,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:1",
            "-nostats",
            &output,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(stdout) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut total: f64 = 0.0;
            for line in reader.lines().flatten() {
                if let Some(ms) = line.strip_prefix("out_time_ms=") {
                    if let Ok(secs) = ms.trim().parse::<f64>() {
                        let secs = secs / 1_000_000.0;
                        let _ = app2.emit(
                            "export-log",
                            format!(
                                "تقدم التحويل: {:.1}ث{}",
                                secs,
                                if total > 0.0 {
                                    format!(" / {}", total)
                                } else {
                                    String::new()
                                }
                            ),
                        );
                        let _ = app2.emit(
                            "export-progress",
                            ProgressPayload {
                                seconds: secs,
                                total,
                            },
                        );
                    }
                } else if let Some(dur) = line.strip_prefix("duration=") {
                    total = dur.trim().parse::<f64>().unwrap_or(0.0);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !line.trim().is_empty() {
                    let _ = app2.emit("export-log", line);
                }
            }
        });
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    Ok(status.success())
}

fn find_tool(name: &str) -> Option<PathBuf> {
    let exts: Vec<String> = if cfg!(windows) {
        vec!["".into(), ".exe".into()]
    } else {
        vec!["".into()]
    };
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_env) {
            for ext in &exts {
                let candidate = dir.join(format!("{name}{ext}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    for ext in &exts {
        let candidate = tools_dir().join("bin").join(format!("{name}{ext}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[tauri::command]
fn piper_tts(text: String, model: String) -> Result<Option<String>, String> {
    let piper = match find_tool("piper") {
        Some(p) => p,
        None => return Ok(None),
    };
    let out_wav = tools_dir().join("piper-out.wav");
    let model_path = if model.contains('/') || model.contains('\\') {
        PathBuf::from(&model)
    } else {
        tools_dir().join("voices").join(format!("{model}.onnx"))
    };
    if !model_path.is_file() {
        return Ok(None);
    }
    let mut child = Command::new(&piper)
        .arg("--model")
        .arg(&model_path)
        .arg("--output_file")
        .arg(&out_wav)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    child
        .stdin
        .take()
        .ok_or("تعذر بدء Piper")?
        .write_all(text.as_bytes())
        .map_err(|e| e.to_string())?;
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Ok(None);
    }
    let bytes = std::fs::read(&out_wav).map_err(|e| e.to_string())?;
    Ok(Some(
        base64::engine::general_purpose::STANDARD.encode(bytes),
    ))
}

#[tauri::command]
fn whisper_transcribe(data_base64: String, file_name: String) -> Result<Option<String>, String> {
    let whisper = match find_tool("whisper-cli")
        .or_else(|| find_tool("whisper"))
        .or_else(|| find_tool("main"))
    {
        Some(w) => w,
        None => return Ok(None),
    };
    let model = {
        let dir = tools_dir().join("models");
        let found = std::fs::read_dir(&dir).ok().and_then(|entries| {
            entries
                .flatten()
                .find(|e| {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    n.ends_with(".bin") && n.contains("ggml")
                })
                .map(|e| e.path())
        });
        match found {
            Some(m) => m,
            None => return Ok(None),
        }
    };
    let input = tools_dir().join(&file_name);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&input, bytes).map_err(|e| e.to_string())?;

    let output = Command::new(&whisper)
        .arg("-m")
        .arg(&model)
        .arg("-l")
        .arg("auto")
        .arg("-nt")
        .arg(&input)
        .output()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&input);
    if !output.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_tools,
            save_file,
            transcode_to_mp4,
            piper_tts,
            whisper_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("تعذر تشغيل استوديو الحركة الذكي");
}
