//! Fixed authenticated Notice transport; product rules and evidence stay in Python.
use crate::domain_client::{send, DomainError};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum NoticeRequest {
    Inventory {}, Read { id: Uuid }, Create { payload: Value },
    Edit { id: Uuid, payload: Value }, Review { id: Uuid, payload: Value },
    Approve { id: Uuid, payload: Value }, Proof { id: Uuid, payload: Value },
    Archive { id: Uuid, payload: Value }, Export { id: Uuid }, Records { id: Uuid, payload: Value },
}

pub async fn execute(request: NoticeRequest, proof: String) -> Result<Value, DomainError> {
    use NoticeRequest::*;
    let export_id = if let Export { id } = &request { Some(*id) } else { None };
    let (method, suffix, body) = match request {
        Inventory {} => (Method::GET, "/notices".into(), None),
        Read { id } => (Method::GET, format!("/notices/{id}"), None),
        Create { payload } => (Method::POST, "/notices".into(), Some(payload)),
        Edit { id, payload } => (Method::POST, format!("/notices/{id}/revisions"), Some(payload)),
        Review { id, payload } => (Method::POST, format!("/notices/{id}/review"), Some(payload)),
        Approve { id, payload } => (Method::POST, format!("/notices/{id}/approval"), Some(payload)),
        Proof { id, payload } => (Method::POST, format!("/notices/{id}/proof"), Some(payload)),
        Archive { id, payload } => (Method::POST, format!("/notices/{id}/archive"), Some(payload)),
        Export { id } => (Method::GET, format!("/archives/{id}"), None),
        Records { id, payload } => (Method::POST, format!("/archives/{id}/records"), Some(payload)),
    };
    let result = send(method, format!("/desktop/v1/notice{suffix}"), body, &proof).await?;
    if let Some(id) = export_id {
        let encoded = result.get("content_base64").and_then(Value::as_str).ok_or_else(DomainError::denied)?;
        let digest = result.get("sha256").and_then(Value::as_str).ok_or_else(DomainError::denied)?;
        let bytes = STANDARD.decode(encoded).map_err(|_| DomainError::denied())?;
        let path = crate::domain_files::write_notice_file(&format!("notice-{id}-{}.zip", Uuid::new_v4()), &bytes, digest)
            .map_err(|_| DomainError::denied())?;
        return Ok(serde_json::json!({"path": path, "sha256": digest, "message": "Notice archive written and verified."}));
    }
    Ok(result)
}
