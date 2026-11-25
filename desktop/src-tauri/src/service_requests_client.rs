//! Fixed service-request transport and verified local exports.
//! Callers provide typed operations only; no URL, path, or filename is trusted.
use crate::domain_client::{send, DomainError};
use reqwest::{Method, Url};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Duration;
use uuid::Uuid;

const LOCAL_ORIGIN: &str = "http://127.0.0.1:15480";
const ROUTE_ROOT: &str = "/desktop/v1/service-requests";
const MAX_TRANSFER_BYTES: u64 = 64 * 1024 * 1024;
const MAX_REQUEST_LIMIT: u32 = 200;
const MAX_REQUEST_OFFSET: u32 = 10_000_000;
const MAX_FILTER_STRING_BYTES: usize = 255;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CategoryFilters {
    include_inactive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestFilters {
    department: Option<String>,
    state: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttachmentDownload {
    attachment_id: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ServiceRequestsRequest {
    Categories {
        filters: Option<CategoryFilters>,
    },
    SaveCategory {
        payload: Value,
    },
    Requests {
        filters: Option<RequestFilters>,
    },
    CreateRequest {
        payload: Value,
    },
    Request {
        id: Uuid,
    },
    Transition {
        id: Uuid,
        payload: Value,
    },
    Comment {
        id: Uuid,
        payload: Value,
    },
    Attach {
        id: Uuid,
        payload: Value,
    },
    Assignees {},
    DownloadAttachment {
        id: Uuid,
        payload: AttachmentDownload,
    },
    Archive {
        id: Uuid,
    },
    EmailSettings {},
    SaveEmailSettings {
        payload: Value,
    },
    ImportPreview {
        payload: Value,
    },
    Import {
        payload: Value,
    },
    Export {
        payload: Value,
    },
    Records {
        id: Uuid,
        payload: Value,
    },
    RecordLookup {
        payload: Value,
    },
    LinkRecord {
        id: Uuid,
        payload: Value,
    },
    DataStatus {},
    DataPreview {},
    DataRevision {
        id: Uuid,
    },
    DataPublish {
        payload: Value,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BinaryAsset {
    Archive { request_id: Uuid },
    Attachment { attachment_id: Uuid },
}

struct Wire {
    method: Method,
    path: String,
    body: Option<Value>,
    binary: Option<BinaryAsset>,
}

impl Wire {
    fn json(method: Method, path: String, body: Option<Value>) -> Self {
        Self {
            method,
            path,
            body,
            binary: None,
        }
    }

    fn binary(method: Method, path: String, asset: BinaryAsset) -> Self {
        Self {
            method,
            path,
            body: None,
            binary: Some(asset),
        }
    }
}

fn invalid_request() -> DomainError {
    DomainError::new(
        "invalid-service-request",
        "The service request input is invalid.",
        false,
    )
}

fn transport_failed() -> DomainError {
    DomainError::new(
        "service-request-unavailable",
        "The service request operation could not be completed.",
        false,
    )
}

fn download_rejected() -> DomainError {
    DomainError::new(
        "service-request-download-rejected",
        "The service request file response was rejected.",
        false,
    )
}

fn export_failed() -> DomainError {
    DomainError::new(
        "service-request-export-failed",
        "The service request file was not finalized.",
        false,
    )
}

fn validate_filter_string(value: &str) -> Result<(), DomainError> {
    if value.len() > MAX_FILTER_STRING_BYTES {
        return Err(invalid_request());
    }
    Ok(())
}

fn query_path(path: &str, pairs: &[(&str, String)]) -> Result<String, DomainError> {
    let mut url = Url::parse(LOCAL_ORIGIN).map_err(|_| invalid_request())?;
    url.set_path(path);
    if !pairs.is_empty() {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(key, value);
        }
    }
    let mut output = url.path().to_owned();
    if let Some(query) = url.query().filter(|query| !query.is_empty()) {
        output.push('?');
        output.push_str(query);
    }
    Ok(output)
}

fn wire(request: ServiceRequestsRequest) -> Result<Wire, DomainError> {
    use ServiceRequestsRequest::*;
    match request {
        Categories { filters } => {
            let mut pairs = Vec::new();
            if let Some(filters) = filters {
                pairs.push(("include_inactive", filters.include_inactive.to_string()));
            }
            Ok(Wire::json(
                Method::GET,
                query_path(&format!("{ROUTE_ROOT}/categories"), &pairs)?,
                None,
            ))
        }
        SaveCategory { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/categories"),
            Some(payload),
        )),
        Requests { filters } => {
            let mut pairs = Vec::new();
            if let Some(filters) = filters {
                if let Some(department) = filters.department {
                    validate_filter_string(&department)?;
                    pairs.push(("department", department));
                }
                if let Some(state) = filters.state {
                    validate_filter_string(&state)?;
                    pairs.push(("state", state));
                }
                if let Some(limit) = filters.limit {
                    if limit > MAX_REQUEST_LIMIT {
                        return Err(invalid_request());
                    }
                    pairs.push(("limit", limit.to_string()));
                }
                if let Some(offset) = filters.offset {
                    if offset > MAX_REQUEST_OFFSET {
                        return Err(invalid_request());
                    }
                    pairs.push(("offset", offset.to_string()));
                }
            }
            Ok(Wire::json(
                Method::GET,
                query_path(&format!("{ROUTE_ROOT}/requests"), &pairs)?,
                None,
            ))
        }
        CreateRequest { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests"),
            Some(payload),
        )),
        Request { id } => Ok(Wire::json(
            Method::GET,
            format!("{ROUTE_ROOT}/requests/{id}"),
            None,
        )),
        Transition { id, payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests/{id}/transition"),
            Some(payload),
        )),
        Comment { id, payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests/{id}/comments"),
            Some(payload),
        )),
        Attach { id, payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests/{id}/attachments"),
            Some(payload),
        )),
        Assignees {} => Ok(Wire::json(
            Method::GET,
            format!("{ROUTE_ROOT}/assignees"),
            None,
        )),
        DownloadAttachment { id, payload } => Ok(Wire::binary(
            Method::GET,
            format!(
                "{ROUTE_ROOT}/requests/{id}/attachments/{}",
                payload.attachment_id
            ),
            BinaryAsset::Attachment {
                attachment_id: payload.attachment_id,
            },
        )),
        Archive { id } => Ok(Wire::binary(
            Method::GET,
            format!("{ROUTE_ROOT}/requests/{id}/archive"),
            BinaryAsset::Archive { request_id: id },
        )),
        EmailSettings {} => Ok(Wire::json(
            Method::GET,
            format!("{ROUTE_ROOT}/email-settings"),
            None,
        )),
        SaveEmailSettings { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/email-settings"),
            Some(payload),
        )),
        ImportPreview { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/import-preview"),
            Some(payload),
        )),
        Import { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/import"),
            Some(payload),
        )),
        Export { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/export"),
            Some(payload),
        )),
        Records { id, payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests/{id}/records"),
            Some(payload),
        )),
        RecordLookup { payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/record-lookup"),
            Some(payload),
        )),
        LinkRecord { id, payload } => Ok(Wire::json(
            Method::POST,
            format!("{ROUTE_ROOT}/requests/{id}/links"),
            Some(payload),
        )),
        DataStatus {} => Ok(Wire::json(
            Method::GET,
            "/desktop/v1/municipal-staff/data/service-requests".to_owned(),
            None,
        )),
        DataPreview {} => Ok(Wire::json(
            Method::POST,
            "/desktop/v1/municipal-staff/data/service-requests/preview".to_owned(),
            Some(serde_json::json!({})),
        )),
        DataRevision { id } => Ok(Wire::json(
            Method::GET,
            format!("/desktop/v1/municipal-staff/data/service-requests/revisions/{id}"),
            None,
        )),
        DataPublish { payload } => Ok(Wire::json(
            Method::POST,
            "/desktop/v1/municipal-staff/data/service-requests/publish".to_owned(),
            Some(payload),
        )),
    }
}

pub async fn execute(request: ServiceRequestsRequest, proof: String) -> Result<Value, DomainError> {
    let Wire {
        method,
        path,
        body,
        binary,
    } = wire(request)?;
    if let Some(asset) = binary {
        return download_file(method, path, asset, proof).await;
    }
    send(method, path, body, &proof).await
}

fn binary_url(path: &str) -> Result<Url, String> {
    if !path.starts_with("/desktop/v1/service-requests/requests/") {
        return Err("Invalid service request binary route.".into());
    }
    if crate::shared_staff::configured() {
        crate::shared_staff::url(&format!("/staff/v1/api{path}"))
    } else {
        let mut url =
            Url::parse(LOCAL_ORIGIN).map_err(|_| "Invalid local service request origin.")?;
        url.set_path(path);
        Ok(url)
    }
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn content_type_extension(value: &str) -> Option<&'static str> {
    let essence = value
        .split_once(';')
        .map_or(value, |(essence, _)| essence)
        .trim()
        .to_ascii_lowercase();
    match essence.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "application/pdf" => Some("pdf"),
        "text/plain" => Some("txt"),
        _ => None,
    }
}

fn export_filename(asset: BinaryAsset, content_type: Option<&str>) -> Result<String, DomainError> {
    match asset {
        BinaryAsset::Archive { request_id } => Ok(format!("service-request-{request_id}.zip")),
        BinaryAsset::Attachment { attachment_id } => {
            let extension = content_type
                .and_then(content_type_extension)
                .ok_or_else(download_rejected)?;
            Ok(format!("attachment-{attachment_id}.{extension}"))
        }
    }
}

pub async fn download_parks_attachment(
    attachment_id: Uuid,
    proof: String,
) -> Result<Value, DomainError> {
    download_file(
        Method::GET,
        format!("/desktop/v1/parks/attachments/{attachment_id}/content"),
        BinaryAsset::Attachment { attachment_id },
        proof,
    )
    .await
}

async fn download_file(
    method: Method,
    path: String,
    asset: BinaryAsset,
    proof: String,
) -> Result<Value, DomainError> {
    let url = binary_url(&path).map_err(|_| transport_failed())?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| transport_failed())?;
    let mut response = client
        .request(method, url)
        .header("X-Townlight-Session", proof)
        .send()
        .await
        .map_err(|_| transport_failed())?;
    if !response.status().is_success() {
        return Err(download_rejected());
    }
    let content_length = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|length| *length > 0 && *length <= MAX_TRANSFER_BYTES)
        .ok_or_else(download_rejected)?;
    let expected_digest = response
        .headers()
        .get("X-Content-SHA256")
        .and_then(|value| value.to_str().ok())
        .filter(|value| is_sha256_hex(value))
        .map(str::to_owned)
        .ok_or_else(download_rejected)?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let filename = export_filename(asset, content_type.as_deref())?;

    let mut bytes = Vec::with_capacity(content_length as usize);
    let mut hash = Sha256::new();
    loop {
        let Some(chunk) = response.chunk().await.map_err(|_| transport_failed())? else {
            break;
        };
        let next_length = bytes
            .len()
            .checked_add(chunk.len())
            .ok_or_else(download_rejected)?;
        if next_length as u64 > content_length || next_length as u64 > MAX_TRANSFER_BYTES {
            return Err(download_rejected());
        }
        hash.update(&chunk[..]);
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != content_length {
        return Err(download_rejected());
    }
    let digest = format!("{:x}", hash.finalize());
    if digest != expected_digest {
        return Err(download_rejected());
    }

    let receipt = tauri::async_runtime::spawn_blocking(move || {
        crate::domain_files::write_service_request_file(&filename, &bytes, &digest)
    })
    .await
    .map_err(|_| export_failed())?
    .map_err(|_| export_failed())?;
    Ok(serde_json::json!({
        "path": receipt.path,
        "sha256": receipt.sha256,
        "size_bytes": receipt.size_bytes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    fn accepted(value: Value) -> Wire {
        wire(serde_json::from_value::<ServiceRequestsRequest>(value).unwrap()).unwrap()
    }

    #[test]
    fn serde_rejects_unknown_fields_bad_ids_and_extra_payload_fields() {
        for value in [
            json!({"operation":"requests","filters":{"limit":10,"actor":"forged"}}),
            json!({"operation":"request","id":"../../private"}),
            json!({"operation":"archive","id":{"path":"C:\\outside"}}),
            json!({"operation":"assignees","payload":{}}),
            json!({"operation":"download-attachment","id":"f7b4fb04-9e02-4d7e-b3f2-3b0e7bd8f7fa","payload":{"attachment_id":"3a2f8e8c-7f0d-4a9c-a47f-8dfb1d0d1b57","target_path":"x"}}),
        ] {
            assert!(serde_json::from_value::<ServiceRequestsRequest>(value).is_err());
        }
    }

    #[test]
    fn wire_routes_are_fixed_and_exact() {
        let id = "3a2f8e8c-7f0d-4a9c-a47f-8dfb1d0d1b57";
        let attachment_id = "f7b4fb04-9e02-4d7e-b3f2-3b0e7bd8f7fa";

        let categories = accepted(json!({"operation":"categories"}));
        assert_eq!(categories.method, Method::GET);
        assert_eq!(categories.path, "/desktop/v1/service-requests/categories");
        assert!(categories.body.is_none());

        let category_filters =
            accepted(json!({"operation":"categories","filters":{"include_inactive":true}}));
        assert_eq!(
            category_filters.path,
            "/desktop/v1/service-requests/categories?include_inactive=true"
        );

        let save = accepted(json!({"operation":"save-category","payload":{"name":"Utilities"}}));
        assert_eq!(save.method, Method::POST);
        assert_eq!(save.path, "/desktop/v1/service-requests/categories");
        assert_eq!(save.body.unwrap()["name"], "Utilities");

        let requests = accepted(json!({"operation":"requests"}));
        assert_eq!(requests.method, Method::GET);
        assert_eq!(requests.path, "/desktop/v1/service-requests/requests");

        let create =
            accepted(json!({"operation":"create-request","payload":{"summary":"Fixture"}}));
        assert_eq!(create.method, Method::POST);
        assert_eq!(create.path, "/desktop/v1/service-requests/requests");

        let request = accepted(json!({"operation":"request","id":id}));
        assert_eq!(request.method, Method::GET);
        assert_eq!(
            request.path,
            format!("/desktop/v1/service-requests/requests/{id}")
        );

        for (operation, suffix) in [
            ("transition", "transition"),
            ("comment", "comments"),
            ("attach", "attachments"),
        ] {
            let wired =
                accepted(json!({"operation":operation,"id":id,"payload":{"note":"fixture"}}));
            assert_eq!(wired.method, Method::POST);
            assert_eq!(
                wired.path,
                format!("/desktop/v1/service-requests/requests/{id}/{suffix}")
            );
        }

        let assignees = accepted(json!({"operation":"assignees"}));
        assert_eq!(assignees.method, Method::GET);
        assert_eq!(assignees.path, "/desktop/v1/service-requests/assignees");

        let download = accepted(json!({
            "operation":"download-attachment",
            "id":id,
            "payload":{"attachment_id":attachment_id}
        }));
        assert_eq!(download.method, Method::GET);
        assert_eq!(
            download.path,
            format!("/desktop/v1/service-requests/requests/{id}/attachments/{attachment_id}")
        );
        assert_eq!(
            download.binary,
            Some(BinaryAsset::Attachment {
                attachment_id: attachment_id.parse().unwrap()
            })
        );

        let archive = accepted(json!({"operation":"archive","id":id}));
        assert_eq!(archive.method, Method::GET);
        assert_eq!(
            archive.path,
            format!("/desktop/v1/service-requests/requests/{id}/archive")
        );
        assert_eq!(
            archive.binary,
            Some(BinaryAsset::Archive {
                request_id: id.parse().unwrap()
            })
        );
    }

    #[test]
    fn request_query_is_encoded_with_explicit_bounds() {
        let wired = accepted(json!({
            "operation":"requests",
            "filters":{
                "department":"Public Works & Roads",
                "state":"open",
                "limit":200,
                "offset":10000000
            }
        }));
        let parsed = Url::parse(&format!("{LOCAL_ORIGIN}{}", wired.path)).unwrap();
        let pairs: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
        assert_eq!(
            pairs.get("department").map(String::as_str),
            Some("Public Works & Roads")
        );
        assert_eq!(pairs.get("state").map(String::as_str), Some("open"));
        assert_eq!(pairs.get("limit").map(String::as_str), Some("200"));
        assert_eq!(pairs.get("offset").map(String::as_str), Some("10000000"));

        for value in [
            json!({"operation":"requests","filters":{"limit":201}}),
            json!({"operation":"requests","filters":{"offset":10000001}}),
            json!({"operation":"requests","filters":{"department":"x".repeat(256)}}),
            json!({"operation":"requests","filters":{"state":"x".repeat(256)}}),
        ] {
            let parsed = serde_json::from_value::<ServiceRequestsRequest>(value).unwrap();
            assert!(wire(parsed).is_err());
        }
    }

    #[test]
    fn filenames_and_hashes_are_derived_not_caller_supplied() {
        let request_id: Uuid = "3a2f8e8c-7f0d-4a9c-a47f-8dfb1d0d1b57".parse().unwrap();
        let attachment_id: Uuid = "f7b4fb04-9e02-4d7e-b3f2-3b0e7bd8f7fa".parse().unwrap();
        assert_eq!(
            export_filename(BinaryAsset::Archive { request_id }, None).unwrap(),
            format!("service-request-{request_id}.zip")
        );
        assert_eq!(
            export_filename(
                BinaryAsset::Attachment { attachment_id },
                Some("image/png; charset=binary")
            )
            .unwrap(),
            format!("attachment-{attachment_id}.png")
        );
        assert_eq!(content_type_extension("application/pdf"), Some("pdf"));
        assert_eq!(content_type_extension("text/plain"), Some("txt"));
        assert_eq!(content_type_extension("application/zip"), None);
        assert!(export_filename(
            BinaryAsset::Attachment { attachment_id },
            Some("application/octet-stream")
        )
        .is_err());
        assert!(is_sha256_hex(&"a".repeat(64)));
        assert!(!is_sha256_hex(&"A".repeat(64)));
        assert!(!is_sha256_hex("abc"));
    }
}
