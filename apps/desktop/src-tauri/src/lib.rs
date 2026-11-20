// استوديو الحركة الذكي — نسخة ويندوز (Tauri 2)
// أوامر محلية حقيقية: حفظ الملفات، كشف الأدوات، تحويل MP4 عبر FFmpeg، Piper، Whisper.

use base64::Engine;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

const PIPER_URL: &str =
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const PIPER_VOICE_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx";
const PIPER_VOICE_JSON_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json";
const WHISPER_URL: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip";
const WHISPER_MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin";
const FFMPEG_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.1-essentials_build.zip";

// بصمة SHA256 لكل حزمة: تُتحقّق قبل فكّ الضغط؛ أي ملف غير مطابق يُحذف ويُفشل التثبيت.
const PIPER_ZIP_SHA256: &str = "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea";
const PIPER_VOICE_SHA256: &str = "9e95cab07b679da603bba17c4dec7ab3111320571964ee95c0379603c086491e";
const PIPER_VOICE_JSON_SHA256: &str =
    "ea6d9b9d9076dbdb6bf5c98c6a141ef154959d2359709b37855727964e7d6c4d";
const WHISPER_ZIP_SHA256: &str = "ecca07b277d943e9b9f4712856a144b857271a6b333104e511e1988e80db582b";
const WHISPER_MODEL_SHA256: &str =
    "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21";
const FFMPEG_ZIP_SHA256: &str = "b9bbbb3acece000cbeec994f856649354e52c773807841e78908374b24d658fd";

const CANCEL_MSG: &str = "أُلغي التنزيل";

static INSTALL_CANCEL: AtomicBool = AtomicBool::new(false);

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

fn dir_has(dir: &str, matches: impl Fn(&str) -> bool) -> bool {
    std::fs::read_dir(tools_dir().join(dir))
        .ok()
        .map_or(false, |entries| {
            entries.flatten().any(|e| {
                e.path()
                    .extension()
                    .map_or(false, |x| matches(&x.to_string_lossy()))
            })
        })
}

#[tauri::command]
fn detect_tools() -> serde_json::Value {
    serde_json::json!({
        "ffmpeg": has_executable("ffmpeg"),
        "piper": has_executable("piper"),
        "whisper": has_executable("whisper-cli") || has_executable("whisper") || has_executable("main"),
        "piperVoice": dir_has("voices", |ext| ext.eq_ignore_ascii_case("onnx")),
        "whisperModel": dir_has("models", |ext| {
            ext.eq_ignore_ascii_case("bin")
        }),
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
fn piper_tts(
    text: String,
    model: String,
    length_scale: Option<f64>,
) -> Result<Option<String>, String> {
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
    let mut command = Command::new(&piper);
    command
        .arg("--model")
        .arg(&model_path)
        .arg("--output_file")
        .arg(&out_wav);
    if let Some(scale) = length_scale {
        command = command.arg("--length_scale").arg(format!("{scale}"));
    }
    let mut child = command
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

/// مدير تثبيت الأدوات الاختيارية: تنزيل بموافقة المستخدم عبر الواجهة.
fn emit_progress(app: &AppHandle, tool: &str, step: &str, start: f64, span: f64, step_pct: f64) {
    let _ = app.emit(
        "tool-progress",
        serde_json::json!({ "tool": tool, "step": step, "pct": (start + step_pct * span / 100.0).clamp(0.0, 100.0) }),
    );
}

fn emit_done(app: &AppHandle, tool: &str, error: bool, cancelled: bool, message: &str) {
    let _ = app.emit(
        "tool-progress",
        serde_json::json!({ "tool": tool, "step": message, "pct": 100.0, "done": true, "error": error, "cancelled": cancelled }),
    );
}

fn check_cancel() -> Result<(), String> {
    if INSTALL_CANCEL.load(Ordering::SeqCst) {
        return Err(CANCEL_MSG.into());
    }
    Ok(())
}

fn sha256_of(path: &PathBuf) -> Result<String, String> {
    let literal = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "(Get-FileHash -Algorithm SHA256 -LiteralPath '{}').Hash",
        literal
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("تعذّر حساب بصمة الملف".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_lowercase())
}

fn verify_hash(
    app: &AppHandle,
    tool: &str,
    start: f64,
    span: f64,
    path: &PathBuf,
    expected: &str,
    label: &str,
) -> Result<(), String> {
    emit_progress(
        app,
        tool,
        "التحقّق من سلامة الملفات (SHA256)",
        start,
        span,
        50.0,
    );
    let actual = sha256_of(path)?;
    if actual != expected.to_lowercase() {
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "فشل التحقق من سلامة {label} — الملف تالف أو تغيّر ليُصدره الموقع. أعد المحاولة"
        ));
    }
    Ok(())
}

fn curl_total_size(url: &str) -> u64 {
    if let Ok(out) = Command::new("curl").arg("-fsIL").arg(url).output() {
        let text = String::from_utf8_lossy(&out.stdout);
        let mut len: u64 = 0;
        for line in text.lines() {
            if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                len = v.trim().parse().unwrap_or(len);
            }
        }
        return len;
    }
    0
}

fn curl_download(
    app: &AppHandle,
    tool: &str,
    step: &str,
    start: f64,
    span: f64,
    url: &str,
    dest: &PathBuf,
) -> Result<(), String> {
    let total = curl_total_size(url);
    let _ = std::fs::remove_file(dest);
    let mut child = Command::new("curl")
        .args(["-fL", "--retry", "3", "--output"])
        .arg(dest)
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    if INSTALL_CANCEL.load(Ordering::SeqCst) {
                        let _ = std::fs::remove_file(dest);
                        return Err(CANCEL_MSG.into());
                    }
                    let _ = std::fs::remove_file(dest);
                    return Err("تعذّر تنزيل الملف — تحقق من الاتصال بالإنترنت وحاول مجدداً".into());
                }
                emit_progress(app, tool, step, start, span, 100.0);
                return Ok(());
            }
            Ok(None) => {
                if INSTALL_CANCEL.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = std::fs::remove_file(dest);
                    return Err(CANCEL_MSG.into());
                }
                if total > 0 {
                    let done_now = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
                    emit_progress(
                        app,
                        tool,
                        step,
                        start,
                        span,
                        (done_now as f64 / total as f64) * 100.0,
                    );
                }
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn find_path_named(base: &PathBuf, name: &str) -> Option<PathBuf> {
    if base
        .file_name()?
        .to_string_lossy()
        .eq_ignore_ascii_case(name)
    {
        return Some(base.clone());
    }
    for entry in std::fs::read_dir(base).ok()?.flatten() {
        let p = entry.path();
        if let Some(found) = find_path_named(&p, name) {
            return Some(found);
        }
    }
    None
}

fn copy_dir_contents(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_contents(&from, &to)?;
        } else {
            if let Some(p) = dst.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_zip(zip: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let script = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        zip.display(),
        dest.display()
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err("تعذّر فكّ ضغط الحزمة".into())
    }
}

fn run_install(app: AppHandle, tool: String) -> Result<String, String> {
    let root = tools_dir();
    let dl = root.join("downloads");
    let bin = root.join("bin");
    std::fs::create_dir_all(&dl).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&bin).map_err(|e| e.to_string())?;

    INSTALL_CANCEL.store(false, Ordering::SeqCst);
    let result: Result<String, String> = (|| {
        match tool.as_str() {
            "piper" => {
                let zip = dl.join("piper.zip");
                curl_download(
                    &app,
                    "piper",
                    "تنزيل برنامج Piper (21 م.ب)",
                    0.0,
                    25.0,
                    PIPER_URL,
                    &zip,
                )?;
                verify_hash(
                    &app,
                    "piper",
                    25.0,
                    5.0,
                    &zip,
                    PIPER_ZIP_SHA256,
                    "برنامج Piper",
                )?;
                let xtag = dl.join("piper-x");
                emit_progress(&app, "piper", "فكّ ضغط البرنامج", 25.0, 5.0, 50.0);
                extract_zip(&zip, &xtag)?;
                let src = find_path_named(&xtag, "piper").ok_or("بناء الحزمة غير متوقع")?;
                copy_dir_contents(&src, &bin)?;
                emit_progress(
                    &app,
                    "piper",
                    "تنزيل الصوت العربي “كريم” (60 م.ب)",
                    30.0,
                    68.0,
                    0.0,
                );
                curl_download(
                    &app,
                    "piper",
                    "تنزيل الصوت العربي “كريم” (60 م.ب)",
                    30.0,
                    68.0,
                    PIPER_VOICE_URL,
                    &root.join("voices").join("ar_JO-kareem-medium.onnx"),
                )?;
                verify_hash(
                    &app,
                    "piper",
                    98.0,
                    2.0,
                    &root.join("voices").join("ar_JO-kareem-medium.onnx"),
                    PIPER_VOICE_SHA256,
                    "الصوت العربي “كريم”",
                )?;
                check_cancel()?;
                curl_download(
                    &app,
                    "piper",
                    "تنزيل بيانات الصوت",
                    98.0,
                    2.0,
                    PIPER_VOICE_JSON_URL,
                    &root.join("voices").join("ar_JO-kareem-medium.onnx.json"),
                )?;
                verify_hash(
                    &app,
                    "piper",
                    100.0,
                    0.0,
                    &root.join("voices").join("ar_JO-kareem-medium.onnx.json"),
                    PIPER_VOICE_JSON_SHA256,
                    "بيانات الصوت",
                )?;
            }
            "whisper" => {
                let zip = dl.join("whisper-bin-x64.zip");
                curl_download(
                    &app,
                    "whisper",
                    "تنزيل برنامج Whisper (9 م.ب)",
                    0.0,
                    12.0,
                    WHISPER_URL,
                    &zip,
                )?;
                verify_hash(
                    &app,
                    "whisper",
                    12.0,
                    3.0,
                    &zip,
                    WHISPER_ZIP_SHA256,
                    "برنامج Whisper",
                )?;
                let xtag = dl.join("whisper-x");
                emit_progress(&app, "whisper", "فكّ ضغط البرنامج", 12.0, 3.0, 50.0);
                extract_zip(&zip, &xtag)?;
                let src = find_path_named(&xtag, "Release").ok_or("بناء الحزمة غير متوقع")?;
                copy_dir_contents(&src, &bin)?;
                emit_progress(
                    &app,
                    "whisper",
                    "تنزيل النموذج الصغير (75 م.ب)",
                    15.0,
                    85.0,
                    0.0,
                );
                curl_download(
                    &app,
                    "whisper",
                    "تنزيل النموذج الصغير (75 م.ب)",
                    15.0,
                    85.0,
                    WHISPER_MODEL_URL,
                    &root.join("models").join("ggml-tiny.bin"),
                )?;
                verify_hash(
                    &app,
                    "whisper",
                    100.0,
                    0.0,
                    &root.join("models").join("ggml-tiny.bin"),
                    WHISPER_MODEL_SHA256,
                    "النموذج الصغير",
                )?;
            }
            "ffmpeg" => {
                let zip = dl.join("ffmpeg-essentials.zip");
                curl_download(
                    &app,
                    "ffmpeg",
                    "تنزيل FFmpeg (114 م.ب)",
                    0.0,
                    92.0,
                    FFMPEG_URL,
                    &zip,
                )?;
                verify_hash(
                    &app,
                    "ffmpeg",
                    92.0,
                    6.0,
                    &zip,
                    FFMPEG_ZIP_SHA256,
                    "حزمة FFmpeg",
                )?;
                let xtag = dl.join("ffmpeg-x");
                emit_progress(&app, "ffmpeg", "فكّ ضغط الحزمة", 92.0, 6.0, 50.0);
                extract_zip(&zip, &xtag)?;
                emit_progress(&app, "ffmpeg", "تثبيت الملفات", 98.0, 2.0, 50.0);
                for name in ["ffmpeg.exe", "ffprobe.exe"] {
                    let found = find_path_named(&xtag, name).ok_or("بناء الحزمة غير متوقع")?;
                    std::fs::copy(&found, bin.join(name)).map_err(|e| e.to_string())?;
                }
            }
            _ => return Err("أداة غير معروفة".into()),
        }
        Ok(tool.clone())
    })();

    let _ = std::fs::remove_dir_all(&dl).ok();
    match &result {
        Ok(t) => {
            emit_done(&app, t, false, false, "اكتمل التثبيت ✓");
            Ok(t.clone())
        }
        Err(m) => {
            let cancelled = m == CANCEL_MSG;
            emit_done(&app, &tool, true, cancelled, m);
            Err(m.clone())
        }
    }
}

#[tauri::command]
fn cancel_install(tool: String) -> bool {
    let _ = tool;
    INSTALL_CANCEL.store(true, Ordering::SeqCst);
    true
}

#[tauri::command]
fn install_tool(app: AppHandle, tool: String) -> bool {
    let app2 = app.clone();
    std::thread::spawn(move || {
        let _ = run_install(app2, tool);
    });
    true
}

#[tauri::command]
fn open_tools_folder() -> bool {
    let root = tools_dir();
    let _ = std::fs::create_dir_all(&root);
    #[cfg(windows)]
    {
        if let Ok(mut child) = Command::new("explorer").arg(&root).spawn() {
            let _ = child.wait().ok();
        }
    }
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_tools,
            install_tool,
            cancel_install,
            open_tools_folder,
            save_file,
            transcode_to_mp4,
            piper_tts,
            whisper_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("تعذر تشغيل استوديو الحركة الذكي");
}
