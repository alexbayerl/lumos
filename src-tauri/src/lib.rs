use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Utc;
use keyring::Entry;
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, COOKIE, ETAG, IF_NONE_MATCH, REFERER, USER_AGENT};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::{self, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tokio::sync::Notify;
use tokio::time::{sleep, Duration};
#[cfg(target_os = "windows")]
use window_vibrancy::{apply_acrylic, apply_mica};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE,
};

const SERVICE_NAME: &str = "CursorUsageOverlay";
const USERNAME: &str = "session_cookie";
const API_URL: &str = "https://cursor.com/api/usage-summary";
const DASHBOARD_REFERER: &str = "https://cursor.com/dashboard/spending";
const APP_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CursorUsageOverlay/0.1";

const MIN_INTERVAL_SECS: u64 = 5;
const MAX_BACKOFF_SECS: u64 = 60;

#[derive(Default)]
struct AppCache {
    etag: Option<String>,
    payload: Option<UsageSummaryResponse>,
    fetched_at: Option<String>,
}

struct PollControl {
    interval_secs: AtomicU64,
    notify: Notify,
}

impl PollControl {
    fn new(interval: u64) -> Self {
        Self {
            interval_secs: AtomicU64::new(interval.max(MIN_INTERVAL_SECS)),
            notify: Notify::new(),
        }
    }

    fn interval(&self) -> u64 {
        self.interval_secs.load(Ordering::Relaxed)
    }

    fn set_interval(&self, secs: u64) {
        self.interval_secs
            .store(secs.max(MIN_INTERVAL_SECS), Ordering::Relaxed);
        self.notify.notify_one();
    }

    fn kick(&self) {
        self.notify.notify_one();
    }
}

#[derive(Clone)]
struct AppState {
    client: Client,
    cache: Arc<Mutex<AppCache>>,
    poll: Arc<PollControl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageBreakdown {
    #[serde(default)]
    included: i64,
    #[serde(default)]
    bonus: i64,
    #[serde(default)]
    total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanUsage {
    enabled: bool,
    used: i64,
    limit: i64,
    remaining: i64,
    breakdown: UsageBreakdown,
    auto_percent_used: f64,
    api_percent_used: f64,
    total_percent_used: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnDemandUsage {
    enabled: bool,
    #[serde(default)]
    used: i64,
    limit: Option<i64>,
    remaining: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndividualUsage {
    plan: PlanUsage,
    on_demand: OnDemandUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageSummaryResponse {
    billing_cycle_start: String,
    billing_cycle_end: String,
    membership_type: String,
    limit_type: Option<String>,
    is_unlimited: bool,
    auto_model_selected_display_message: Option<String>,
    named_model_selected_display_message: Option<String>,
    individual_usage: IndividualUsage,
    #[serde(default)]
    team_usage: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchUsageResult {
    data: UsageSummaryResponse,
    etag: Option<String>,
    fetched_at: String,
    from_cache: bool,
    status: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageError {
    message: String,
    status: Option<u16>,
    auth: bool,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, USERNAME)
        .map_err(|e| format!("Could not access Windows Credential Manager: {e}"))
}

fn extract_cookie_value(cookie_line: &str, name: &str) -> Option<String> {
    cookie_line.split(';').find_map(|part| {
        let trimmed = part.trim();
        trimmed
            .strip_prefix(&format!("{name}="))
            .map(|value| value.trim().to_string())
    })
}

fn normalize_cookie_input(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Please paste a WorkosCursorSessionToken or full Cookie header.".into());
    }

    if trimmed.contains("WorkosCursorSessionToken=") {
        let token = extract_cookie_value(trimmed, "WorkosCursorSessionToken").ok_or_else(|| {
            "Could not find WorkosCursorSessionToken in the pasted Cookie header.".to_string()
        })?;
        let workos_id = extract_cookie_value(trimmed, "workos_id");

        return Ok(match workos_id {
            Some(id) => format!("workos_id={id}; WorkosCursorSessionToken={token}"),
            None => format!("WorkosCursorSessionToken={token}"),
        });
    }

    if trimmed.starts_with("user_") {
        return Ok(format!("WorkosCursorSessionToken={trimmed}"));
    }

    Err("The pasted value does not look like a WorkosCursorSessionToken or Cookie header.".into())
}

fn read_saved_cookie() -> Result<String, String> {
    let entry = credential_entry()?;
    entry.get_password().map_err(|_| {
        "No saved session found. Open Settings and paste a fresh WorkosCursorSessionToken."
            .to_string()
    })
}

async fn perform_fetch(state: &AppState) -> Result<FetchUsageResult, UsageError> {
    let cookie = read_saved_cookie().map_err(|message| UsageError {
        message,
        status: None,
        auth: true,
    })?;

    let cached_etag = {
        let cache = state.cache.lock().await;
        cache.etag.clone()
    };

    let mut request = state
        .client
        .get(API_URL)
        .header(ACCEPT, "*/*")
        .header(ACCEPT_ENCODING, "gzip, br")
        .header(USER_AGENT, APP_USER_AGENT)
        .header(COOKIE, cookie)
        .header(REFERER, DASHBOARD_REFERER);

    if let Some(etag) = cached_etag.clone() {
        request = request.header(IF_NONE_MATCH, etag);
    }

    let response = request.send().await.map_err(|e| UsageError {
        message: format!("Network error while fetching Cursor usage: {e}"),
        status: None,
        auth: false,
    })?;

    let status = response.status();

    if status == StatusCode::NOT_MODIFIED {
        let cache = state.cache.lock().await;
        let payload = cache.payload.clone().ok_or_else(|| UsageError {
            message: "Cursor returned 304 Not Modified, but there is no cached payload yet."
                .into(),
            status: Some(304),
            auth: false,
        })?;

        return Ok(FetchUsageResult {
            data: payload,
            etag: cache.etag.clone(),
            fetched_at: cache.fetched_at.clone().unwrap_or_else(now_iso),
            from_cache: true,
            status: 304,
        });
    }

    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(UsageError {
            message: "Authentication failed. Paste a fresh WorkosCursorSessionToken in Settings."
                .into(),
            status: Some(status.as_u16()),
            auth: true,
        });
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let excerpt = body.chars().take(180).collect::<String>();
        return Err(UsageError {
            message: format!("Cursor API returned HTTP {status}. {excerpt}"),
            status: Some(status.as_u16()),
            auth: false,
        });
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let payload = response
        .json::<UsageSummaryResponse>()
        .await
        .map_err(|e| UsageError {
            message: format!("Could not decode Cursor usage payload: {e}"),
            status: Some(status.as_u16()),
            auth: false,
        })?;

    let fetched_at = now_iso();

    {
        let mut cache = state.cache.lock().await;
        cache.etag = etag.clone();
        cache.payload = Some(payload.clone());
        cache.fetched_at = Some(fetched_at.clone());
    }

    Ok(FetchUsageResult {
        data: payload,
        etag,
        fetched_at,
        from_cache: false,
        status: status.as_u16(),
    })
}

#[tauri::command]
async fn has_session_cookie() -> Result<bool, String> {
    let entry = credential_entry()?;
    Ok(entry.get_password().is_ok())
}

#[tauri::command]
async fn save_session_cookie(
    state: tauri::State<'_, AppState>,
    raw_input: String,
) -> Result<(), String> {
    let normalized = normalize_cookie_input(&raw_input)?;
    let entry = credential_entry()?;
    entry
        .set_password(&normalized)
        .map_err(|e| format!("Could not save session to Windows Credential Manager: {e}"))?;
    state.poll.kick();
    Ok(())
}

#[tauri::command]
async fn clear_session_cookie(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let entry = credential_entry()?;
    let result = match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Could not remove the saved session: {e}")),
    };
    {
        let mut cache = state.cache.lock().await;
        cache.etag = None;
        cache.payload = None;
        cache.fetched_at = None;
    }
    result
}

#[tauri::command]
async fn fetch_usage_summary(
    state: tauri::State<'_, AppState>,
) -> Result<FetchUsageResult, String> {
    perform_fetch(&state).await.map_err(|e| e.message)
}

#[tauri::command]
async fn force_refresh(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.poll.kick();
    Ok(())
}

#[tauri::command]
async fn set_poll_interval(state: tauri::State<'_, AppState>, secs: u64) -> Result<(), String> {
    state.poll.set_interval(secs);
    Ok(())
}

#[tauri::command]
async fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.unminimize();
    }
    Ok(())
}

#[tauri::command]
async fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.unminimize();
        }
    }
    Ok(())
}

#[tauri::command]
async fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_ignore_cursor_events(enabled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Returns the most recently fetched usage payload (if any). Used by newly
/// spawned popped-out widget windows so they show data immediately, before
/// the next poll completes.
#[tauri::command]
async fn get_last_usage(
    state: tauri::State<'_, AppState>,
) -> Result<Option<FetchUsageResult>, String> {
    let cache = state.cache.lock().await;
    if let (Some(payload), Some(fetched_at)) = (&cache.payload, &cache.fetched_at) {
        Ok(Some(FetchUsageResult {
            data: payload.clone(),
            etag: cache.etag.clone(),
            fetched_at: fetched_at.clone(),
            from_cache: true,
            status: 200,
        }))
    } else {
        Ok(None)
    }
}

/// Spawns (or focuses) a small always-on-top window that hosts a single
/// widget. The window URL carries `?widget=<kind>&id=<id>` so the frontend
/// can render just that widget. Position/size persist via tauri-plugin-window-state.
#[tauri::command]
async fn pop_out_widget(
    app: AppHandle,
    kind: String,
    id: String,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let label = popout_label(&id);

    if let Some(existing) = app.get_webview_window(&label) {
        // If a position is provided (drag-to-detach re-entry), move it there.
        if let (Some(x), Some(y)) = (x, y) {
            let _ = existing.set_position(tauri::LogicalPosition::new(x, y));
        }
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    // Strict whitelist of characters in URL params (kinds + ids we generate).
    let safe_kind = sanitize_param(&kind);
    let safe_id = sanitize_param(&id);
    if safe_kind.is_empty() || safe_id.is_empty() {
        return Err("Invalid widget kind/id".into());
    }

    let url = format!("index.html?widget={safe_kind}&id={safe_id}");
    let w = width.unwrap_or(220.0).clamp(140.0, 1200.0);
    let h = height.unwrap_or(140.0).clamp(110.0, 1000.0);

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("Cursor Widget")
        .inner_size(w, h)
        .min_inner_size(120.0, 96.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(false)
        .visible(true);

    if let (Some(x), Some(y)) = (x, y) {
        builder = builder.position(x, y);
    }

    let window = builder
        .build()
        .map_err(|e| format!("Could not create widget window: {e}"))?;

    apply_window_chrome(&window);

    // Notify the main UI when the user closes a popped-out window so it can
    // drop the entry from its persisted list.
    let app_clone = app.clone();
    let id_clone = id.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = app_clone.emit("popout-closed", &id_clone);
        }
    });

    Ok(())
}

#[tauri::command]
async fn close_widget_window(app: AppHandle, id: String) -> Result<(), String> {
    let label = popout_label(&id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    Ok(())
}

fn popout_label(id: &str) -> String {
    format!("popout-{id}")
}

fn sanitize_param(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(96)
        .collect()
}

/// Applies the standard cosmetic chrome (Mica/Acrylic + DWM rounded corners)
/// to any window. Used both for the main window and every popped-out widget.
fn apply_window_chrome(window: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        if apply_mica(window, Some(true)).is_err() {
            let _ = apply_acrylic(window, Some((18, 24, 38, 180)));
        }
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0 as *mut _);
            let pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
            let _ = unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    &pref as *const _ as *const _,
                    std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
                )
            };
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
}

fn spawn_poller(app: AppHandle, state: AppState) {
    async_runtime::spawn(async move {
        let mut backoff = 0u64;
        loop {
            let interval = state.poll.interval();
            let wait_secs = if backoff > 0 { backoff } else { interval };

            tokio::select! {
                _ = sleep(Duration::from_secs(wait_secs)) => {},
                _ = state.poll.notify.notified() => {},
            }

            match perform_fetch(&state).await {
                Ok(result) => {
                    backoff = 0;
                    let _ = app.emit("usage-updated", &result);
                }
                Err(err) => {
                    if err.auth {
                        backoff = MAX_BACKOFF_SECS;
                    } else {
                        backoff = if backoff == 0 {
                            interval.saturating_mul(2)
                        } else {
                            backoff.saturating_mul(2)
                        }
                        .min(MAX_BACKOFF_SECS);
                    }
                    let _ = app.emit("usage-error", &err);
                }
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show overlay", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide overlay", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Open settings", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &hide, &refresh, &settings, &separator, &quit])?;

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("Cursor Usage Overlay")
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            "refresh" => {
                if let Some(state) = app.try_state::<AppState>() {
                    state.poll.kick();
                }
            }
            "settings" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = app.emit("open-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let visible = w.is_visible().unwrap_or(false);
                    if visible {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .use_rustls_tls()
        .gzip(true)
        .brotli(true)
        .build()
        .expect("failed to build HTTP client");

    let state = AppState {
        client,
        cache: Arc::new(Mutex::new(AppCache::default())),
        poll: Arc::new(PollControl::new(10)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.unminimize();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let toggle = Shortcut::new(
                            Some(Modifiers::CONTROL | Modifiers::ALT),
                            Code::KeyU,
                        );
                        if shortcut == &toggle {
                            if let Some(w) = app.get_webview_window("main") {
                                let visible = w.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            has_session_cookie,
            save_session_cookie,
            clear_session_cookie,
            fetch_usage_summary,
            force_refresh,
            set_poll_interval,
            quit_app,
            show_main_window,
            toggle_main_window,
            set_click_through,
            get_last_usage,
            pop_out_widget,
            close_widget_window,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            if let Some(window) = handle.get_webview_window("main") {
                apply_window_chrome(&window);

                // Closing the main window (X button, taskbar close, Alt+F4)
                // should fully quit the app, including any popouts. Without
                // this, undecorated transparent windows can leave a zombie
                // process behind.
                let app_for_close = handle.clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        app_for_close.exit(0);
                    }
                });
            }

            build_tray(&handle)?;

            let toggle = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT),
                Code::KeyU,
            );
            if let Err(err) = handle.global_shortcut().register(toggle) {
                log::warn!("failed to register global shortcut Ctrl+Alt+U: {err}");
            }

            spawn_poller(handle.clone(), state.clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
