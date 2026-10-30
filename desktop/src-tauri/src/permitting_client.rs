//! Fixed native transport. No permit rules or caller-supplied URLs/paths.
use crate::domain_client::{send, DomainError};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PermittingRequest {
    Requirements { offset: u32 },
    Requirement { id: Uuid },
    ImportRequirements { payload: Value },
    Cases { offset: u32 },
    Case { id: Uuid },
    CreateCase { payload: Value },
    ReviseCase { id: Uuid, payload: Value },
    History { id: Uuid },
    CreatePacket { id: Uuid, payload: Value },
    ExportPacket { id: Uuid, expected_sha256: String },
    SearchConnections { payload: Value },
    Pathway { payload: Value },
    AttachRecords { request_id: Uuid, payload: Value },
}

pub fn route(request: PermittingRequest) -> (Method, String, Option<Value>) {
    use PermittingRequest::*;
    let (method, path, body) = match request {
        Requirements { offset } => (Method::GET, format!("/requirements?offset={offset}"), None),
        Requirement { id } => (Method::GET, format!("/requirements/{id}"), None),
        ImportRequirements { payload } => (Method::POST, "/requirements".into(), Some(payload)),
        Cases { offset } => (Method::GET, format!("/cases?offset={offset}"), None),
        Case { id } => (Method::GET, format!("/cases/{id}"), None),
        CreateCase { payload } => (Method::POST, "/cases".into(), Some(payload)),
        ReviseCase { id, payload } => (
            Method::POST,
            format!("/cases/{id}/revisions"),
            Some(payload),
        ),
        History { id } => (Method::GET, format!("/cases/{id}/history"), None),
        CreatePacket { id, payload } => {
            (Method::POST, format!("/cases/{id}/packets"), Some(payload))
        }
        ExportPacket { id, .. } => (Method::GET, format!("/packets/{id}"), None),
        SearchConnections { payload } => {
            (Method::POST, "/connections/search".into(), Some(payload))
        }
        Pathway { payload } => (Method::POST, "/pathway".into(), Some(payload)),
        AttachRecords {
            request_id,
            payload,
        } => {
            return (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/permitting-sources"),
                Some(payload),
            )
        }
    };
    (method, format!("/desktop/v1/permitting{path}"), body)
}

pub async fn execute(request: PermittingRequest, proof: String) -> Result<Value, DomainError> {
    let export = match &request {
        PermittingRequest::ExportPacket {
            id,
            expected_sha256,
        } => Some((*id, expected_sha256.clone())),
        _ => None,
    };
    let (method, path, body) = route(request);
    let result = send(method, path, body, &proof).await?;
    if let Some((id, expected)) = export {
        let content = result
            .get("text")
            .and_then(Value::as_str)
            .ok_or_else(DomainError::denied)?;
        let digest = result
            .get("sha256")
            .and_then(Value::as_str)
            .ok_or_else(DomainError::denied)?;
        if digest != expected {
            return Err(DomainError::denied());
        }
        let path = crate::domain_files::write_permitting_file(
            &format!("permitting-{id}-{}.json", Uuid::new_v4()),
            content.as_bytes(),
            digest,
        )
        .map_err(|_| DomainError::denied())?;
        return Ok(serde_json::json!({"path": path, "sha256": digest}));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn permitting_transport_is_fixed_and_does_not_accept_a_url_or_unknown_operation() {
        assert!(serde_json::from_value::<PermittingRequest>(
            serde_json::json!({"operation":"approve-permit"})
        )
        .is_err());
        assert!(serde_json::from_value::<PermittingRequest>(
            serde_json::json!({"operation":"cases","offset":0,"url":"https://example.com"})
        )
        .is_err());
        let (_, path, _) = route(PermittingRequest::Cases { offset: 10 });
        assert_eq!(path, "/desktop/v1/permitting/cases?offset=10");
    }
}
