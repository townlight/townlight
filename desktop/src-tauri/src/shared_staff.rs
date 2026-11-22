//! The staff client's host is set by Windows IT, never by an IPC argument.
//! Session grants stay in the native process, with no fallback to local writes.
use crate::auth::{AccessState, AuthActionResult};
use reqwest::{Client, Method, Url};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Mutex;
use std::time::Duration;

const ORIGIN_ENV: &str = "TOWNLIGHT_SHARED_ORIGIN";
const SESSION: &str = "/staff/v1/session";
static PROOF: Mutex<Option<String>> = Mutex::new(None);

#[derive(Deserialize)]
struct Identity {
    email: String,
    display_name: String,
    role: String,
}

#[derive(Deserialize)]
struct SignIn {
    proof: String,
    #[serde(flatten)]
    identity: Identity,
}

pub(crate) fn configured() -> bool {
    std::env::var_os(ORIGIN_ENV).is_some()
}

pub(crate) fn hosting() -> bool {
    std::env::var("TOWNLIGHT_SHARED_STAFF_HOST").as_deref() == Ok("1")
}

#[cfg(windows)]
pub(crate) fn run_host_cli() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()?.to_str()? != "--townlight-staff-host" {
        return None;
    }
    let outcome = (|| -> Result<crate::supervisor::SupervisorActionResult, String> {
        if !hosting() || configured() {
            return Err(
                "Run this action only under the configured Windows city-host account.".into(),
            );
        }
        let action = args
            .next()
            .and_then(|value| value.into_string().ok())
            .ok_or("Select start, stop or health.")?;
        if args.next().is_some() || !matches!(action.as_str(), "start" | "stop" | "health") {
            return Err("Select start, stop or health.".into());
        }
        if crate::first_run::saved_admin_record()?.is_none() {
            return Err("Complete Townlight first run in this Windows profile before starting the shared host.".into());
        }
        crate::profile_identity::prepare()?;
        if action == "start" {
            crate::supervisor::refresh_upgraded_python_runtime()?;
        }
        crate::supervisor::supervisor_action(&action, None)
    })();
    Some(match outcome {
        Ok(result) => {
            println!("{}", serde_json::to_string(&result).unwrap_or_default());
            if result.accepted {
                0
            } else {
                1
            }
        }
        Err(error) => {
            eprintln!("{error}");
            1
        }
    })
}

#[cfg(windows)]
pub(crate) fn run_client_cli() -> Option<i32> {
    use std::io::{BufRead, Read, Write};

    let mut args = std::env::args_os().skip(1);
    let option = args.next()?;
    let host_fixture = match option.to_str()? {
        "--townlight-staff-client" => false,
        "--townlight-staff-host-fixture" => true,
        _ => return None,
    };
    if args.next().is_some() {
        eprintln!("The staff command does not accept extra arguments.");
        return Some(1);
    }
    if host_fixture {
        if let Err(error) = prepare_host_fixture() {
            eprintln!("{error}");
            return Some(1);
        }
    } else if !configured() || hosting() {
        eprintln!(
            "Set the city-host HTTPS origin on the staff workstation before running this command."
        );
        return Some(1);
    }

    #[derive(Deserialize)]
    #[serde(tag = "command", rename_all = "snake_case", deny_unknown_fields)]
    enum Request {
        GetAppState,
        AuthAction {
            action: String,
            payload: Option<Value>,
        },
        MeetingsDomainRequest {
            request: crate::domain_client::MeetingsRequest,
        },
        RecordsDomainRequest {
            request: crate::domain_client::RecordsRequest,
        },
        FirstRunAction {
            action: String,
            step_id: Option<String>,
            payload: Option<Value>,
        },
        SupervisorAction {
            action: String,
            service_id: Option<String>,
        },
        StationAction {
            action: String,
            selected_directory: Option<String>,
            meeting_id: Option<uuid::Uuid>,
        },
    }

    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    loop {
        let mut line = String::new();
        let length = match (&mut input).take(128 * 1024 + 1).read_line(&mut line) {
            Ok(0) => return Some(0),
            Ok(length) => length,
            Err(_) => return Some(1),
        };
        if length > 128 * 1024 {
            return Some(1);
        }
        let result: Result<Value, Value> = match serde_json::from_str::<Request>(&line) {
            Ok(request) => tauri::async_runtime::block_on(async {
                match request {
                    Request::GetAppState => crate::get_app_state()
                        .await
                        .map(|value| serde_json::json!(value))
                        .map_err(Value::String),
                    Request::AuthAction { action, payload } => crate::auth_action(action, payload)
                        .await
                        .map(|value| serde_json::json!(value))
                        .map_err(Value::String),
                    Request::MeetingsDomainRequest { request } => {
                        crate::meetings_domain_request(request)
                            .await
                            .map_err(|value| serde_json::json!(value))
                    }
                    Request::RecordsDomainRequest { request } => {
                        crate::records_domain_request(request)
                            .await
                            .map_err(|value| serde_json::json!(value))
                    }
                    Request::FirstRunAction {
                        action,
                        step_id,
                        payload,
                    } if host_fixture && fixture_setup_action(&action, payload.as_ref()) => {
                        crate::first_run_action(action, step_id, payload)
                            .await
                            .map(|value| serde_json::json!(value))
                            .map_err(Value::String)
                    }
                    Request::SupervisorAction { action, service_id }
                        if host_fixture
                            && service_id.is_none()
                            && matches!(
                                action.as_str(),
                                "start" | "stop" | "health" | "activate-records"
                            ) =>
                    {
                        crate::supervisor_action(action, service_id)
                            .await
                            .map(|value| serde_json::json!(value))
                            .map_err(Value::String)
                    }
                    Request::StationAction {
                        action,
                        selected_directory,
                        meeting_id,
                    } if host_fixture
                        && selected_directory.is_none()
                        && matches!(action.as_str(), "setup" | "status" | "open" | "stop") =>
                    {
                        crate::station_action(action, selected_directory, meeting_id)
                            .await
                            .map_err(Value::String)
                    }
                    _ => Err(Value::String(
                        "This action is unavailable to the installed staff command.".into(),
                    )),
                }
            }),
            Err(_) => Err(Value::String("Invalid shared staff command.".into())),
        };
        let envelope = match result {
            Ok(result) => serde_json::json!({"ok":true,"result":result}),
            Err(error) => serde_json::json!({"ok":false,"error":error}),
        };
        if writeln!(output, "{envelope}")
            .and_then(|()| output.flush())
            .is_err()
        {
            return Some(1);
        }
    }
}

#[cfg(windows)]
fn prepare_host_fixture() -> Result<(), String> {
    use std::path::PathBuf;
    if !hosting()
        || configured()
        || std::env::var("TOWNLIGHT_DISPOSABLE_INSTALLED_TEST").as_deref() != Ok("1")
        || std::env::var("TOWNLIGHT_SUPPRESS_OPEN_BROWSER").as_deref() != Ok("1")
    {
        return Err(
            "Fixture host actions require explicit disposable headless Windows settings.".into(),
        );
    }
    let selected = std::env::var_os("TOWNLIGHT_DESKTOP_STATE_DIR")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or("Provide an existing isolated profile directory.")?;
    let isolated = selected
        .canonicalize()
        .map_err(|_| "Provide an existing isolated profile directory.")?;
    let normal = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("CivicSuite"));
    if normal
        .as_ref()
        .and_then(|path| path.canonicalize().ok())
        .is_some_and(|path| isolated.starts_with(path))
        || std::fs::read_to_string(isolated.join(".townlight-disposable-acceptance"))
            .as_deref()
            .map(str::trim)
            .ok()
            != Some("townlight-windows-shared-acceptance-v1")
    {
        return Err(
            "Use a marked fixture profile outside the normal Townlight installation.".into(),
        );
    }
    let locations = crate::local_paths::effective_locations()?;
    for (actual, expected) in [
        (locations.install_root, selected.clone()),
        (locations.data_root, selected.join("Data")),
        (locations.backup_root, selected.join("Backups")),
    ] {
        let actual = PathBuf::from(actual);
        if actual != expected
            || (actual.exists()
                && !actual
                    .canonicalize()
                    .is_ok_and(|path| path.starts_with(&isolated)))
        {
            return Err("The fixture's files must remain inside its disposable profile.".into());
        }
    }
    if crate::first_run::saved_admin_record()?
        .is_some_and(|admin| !admin.email.ends_with("@example.invalid"))
    {
        return Err("The fixture uses synthetic example.invalid accounts only.".into());
    }
    crate::profile_identity::prepare()?;
    Ok(())
}

#[cfg(windows)]
fn fixture_setup_action(action: &str, payload: Option<&Value>) -> bool {
    match action {
        "choose-location" | "choose-backup" => payload.is_none(),
        "select-modules" | "create-city-profile" | "defer-model" | "verify-health" | "open-app" => {
            true
        }
        "create-admin" => payload
            .and_then(|body| body.get("adminEmail"))
            .and_then(Value::as_str)
            .is_some_and(|email| email.ends_with("@example.invalid")),
        _ => false,
    }
}

pub(crate) fn url(path: &str) -> Result<Url, String> {
    let value = std::env::var(ORIGIN_ENV).map_err(|_| "City host is not configured.")?;
    let mut origin = Url::parse(&value).map_err(|_| "The city host must be an HTTPS origin.")?;
    if origin.scheme() != "https"
        || origin.host().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
        || !path.starts_with("/staff/v1/")
    {
        return Err("The city host must be an HTTPS origin without a path or credentials.".into());
    }
    let (pathname, query) = path
        .split_once('?')
        .map_or((path, None), |(p, q)| (p, Some(q)));
    origin.set_path(pathname);
    origin.set_query(query);
    Ok(origin)
}

fn request(method: Method) -> Result<reqwest::RequestBuilder, String> {
    let origin = url(SESSION)?;
    Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map(|client| client.request(method, origin))
        .map_err(|_| "Could not prepare the secure city-host connection.".into())
}

pub(crate) fn proof() -> Result<String, String> {
    PROOF
        .lock()
        .map_err(|_| "Shared staff sign-in is unavailable.")?
        .clone()
        .ok_or_else(|| "Sign in to the city host first.".into())
}

fn access(identity: Option<Identity>, status: &'static str) -> AccessState {
    let signed_in = identity.is_some();
    let (operator_email, operator_name, role) = match identity {
        Some(identity) => (
            Some(identity.email),
            Some(identity.display_name),
            Some(identity.role),
        ),
        None => (None, None, None),
    };
    AccessState {
        configured: true,
        signed_in,
        operator_email,
        operator_name,
        role,
        status,
        next_action: if signed_in {
            "Continue shared city work."
        } else {
            "Sign in with your Townlight account on the city host."
        }
        .into(),
    }
}

pub(crate) async fn access_state() -> AccessState {
    let Ok(current) = proof() else {
        return access(None, "Sign in required");
    };
    let Ok(request) = request(Method::GET) else {
        return access(None, "City host unavailable");
    };
    let Ok(response) = request.header("X-Townlight-Session", &current).send().await else {
        return access(None, "City host unavailable");
    };
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(mut saved) = PROOF.lock() {
            if saved.as_ref() == Some(&current) {
                *saved = None;
            }
        }
    }
    match response.error_for_status() {
        Ok(response) => match response.json().await {
            Ok(identity) => access(Some(identity), "Signed in"),
            Err(_) => access(None, "City host unavailable"),
        },
        Err(_) => access(None, "Sign in required"),
    }
}

async fn revoke(current: &str) -> bool {
    let Ok(request) = request(Method::DELETE) else {
        return false;
    };
    request
        .header("X-Townlight-Session", current)
        .send()
        .await
        .is_ok_and(|r| r.status().is_success())
}

pub(crate) async fn auth_action(
    action: String,
    payload: Option<Value>,
) -> Result<AuthActionResult, String> {
    let (status, message, access) = match action.as_str() {
        "sign-in" => {
            let payload = payload.ok_or("Supply your Townlight email and passcode.")?;
            let email = payload
                .get("email")
                .and_then(Value::as_str)
                .ok_or("Supply your Townlight email.")?;
            let passcode = payload
                .get("passcode")
                .and_then(Value::as_str)
                .ok_or("Supply your Townlight passcode.")?;
            let response = request(Method::POST)?
                .json(&serde_json::json!({"email":email,"passcode":passcode}))
                .send()
                .await
                .map_err(|_| "Could not connect to the city host over HTTPS.")?;
            if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err("Wait before trying to sign in again.".into());
            }
            let sign_in: SignIn = response
                .error_for_status()
                .map_err(|_| "City host did not accept the sign-in.")?
                .json()
                .await
                .map_err(|_| "City host returned an invalid sign-in reply.")?;
            let previous = PROOF
                .lock()
                .map_err(|_| "Shared staff sign-in is unavailable.")?
                .replace(sign_in.proof);
            if let Some(previous) = previous {
                revoke(&previous).await;
            }
            (
                "Signed in",
                "Connected to the city host.",
                access(Some(sign_in.identity), "Signed in"),
            )
        }
        "sign-out" => {
            let previous = PROOF
                .lock()
                .map_err(|_| "Shared staff sign-in is unavailable.")?
                .take();
            let confirmed = match previous {
                Some(previous) => revoke(&previous).await,
                None => true,
            };
            let message = if confirmed {
                "Signed out of the city host."
            } else {
                "Signed out of this workstation. The host could not confirm revocation of the discarded session."
            };
            ("Signed out", message, access(None, "Sign in required"))
        }
        _ => return Err("Manage staff accounts from the city host.".into()),
    };
    Ok(AuthActionResult {
        accepted: true,
        action,
        status,
        message: message.into(),
        next_action: access.next_action.clone(),
        access,
    })
}
