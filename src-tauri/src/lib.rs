use std::sync::Arc;

use chrono::Utc;
use keyring::Entry;
use reqwest::header::{ACCEPT, COOKIE, ETAG, IF_NONE_MATCH, REFERER, USER_AGENT};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::Mutex;

const SERVICE_NAME: &str = "CursorUsageOverlay";
const USERNAME: &str = "session_cookie";
const API_URL: &str = "https://cursor.com/api/usage-summary";
const DASHBOARD_REFERER: &str = "https://cursor.com/dashboard/spending";
const APP_USER_AGENT: &str = "CursorUsageOverlay/0.1 (Tauri)";

#[derive(Default)]
struct AppCache {
    etag: Option<String>,
    payload: Option<UsageSummaryResponse>,
    fetched_at: Option<String>,
}

#[derive(Clone)]
struct AppState {
    client: Client,
    cache: Arc<Mutex<AppCache>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageBreakdown {
    included: i64,
    bonus: i64,
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

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, USERNAME).map_err(|e| format!("Could not access Windows Credential Manager: {e}"))
}

fn extract_cookie_value(cookie_line: &str, name: &str) -> Option<String> {
    cookie_line
        .split(';')
        .find_map(|part| {
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
        let token = extract_cookie_value(trimmed, "WorkosCursorSessionToken")
            .ok_or_else(|| "Could not find WorkosCursorSessionToken in the pasted Cookie header.".to_string())?;
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
    entry
        .get_password()
        .map_err(|_| "No saved session found. Open Settings and paste a fresh WorkosCursorSessionToken.".to_string())
}

#[tauri::command]
async fn has_session_cookie() -> Result<bool, String> {
    let entry = credential_entry()?;
    Ok(entry.get_password().is_ok())
}

#[tauri::command]
async fn save_session_cookie(raw_input: String) -> Result<(), String> {
    let normalized = normalize_cookie_input(&raw_input)?;
    let entry = credential_entry()?;
    entry
        .set_password(&normalized)
        .map_err(|e| format!("Could not save the session to Windows Credential Manager: {e}"))
}

#[tauri::command]
async fn clear_session_cookie() -> Result<(), String> {
    let entry = credential_entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Could not remove the saved session: {e}")),
    }
}

#[tauri::command]
async fn fetch_usage_summary(state: tauri::State<'_, AppState>) -> Result<FetchUsageResult, String> {
    let cookie = read_saved_cookie()?;

    let cached_etag = {
        let cache = state.cache.lock().await;
        cache.etag.clone()
    };

    let mut request = state
        .client
        .get(API_URL)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, APP_USER_AGENT)
        .header(COOKIE, cookie)
        .header(REFERER, DASHBOARD_REFERER);

    if let Some(etag) = cached_etag.clone() {
        request = request.header(IF_NONE_MATCH, etag);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Network error while fetching Cursor usage: {e}"))?;

    if response.status() == StatusCode::NOT_MODIFIED {
        let cache = state.cache.lock().await;
        let payload = cache
            .payload
            .clone()
            .ok_or_else(|| "Cursor returned 304 Not Modified, but there is no cached payload yet. Try again.".to_string())?;

        return Ok(FetchUsageResult {
            data: payload,
            etag: cache.etag.clone(),
            fetched_at: cache.fetched_at.clone().unwrap_or_else(now_iso),
            from_cache: true,
            status: 304,
        });
    }

    if response.status() == StatusCode::UNAUTHORIZED || response.status() == StatusCode::FORBIDDEN {
        return Err("Authentication failed. Paste a fresh WorkosCursorSessionToken in Settings.".into());
    }

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let excerpt = body.chars().take(180).collect::<String>();
        return Err(format!("Cursor API returned HTTP {status}. {excerpt}"));
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let payload = response
        .json::<UsageSummaryResponse>()
        .await
        .map_err(|e| format!("Could not decode Cursor usage payload: {e}"))?;

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
        status: 200,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .use_rustls_tls()
        .build()
        .expect("failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState {
            client,
            cache: Arc::new(Mutex::new(AppCache::default())),
        })
        .invoke_handler(tauri::generate_handler![
            has_session_cookie,
            save_session_cookie,
            clear_session_cookie,
            fetch_usage_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
