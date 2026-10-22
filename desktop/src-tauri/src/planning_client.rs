//! Fixed native transport and confined exact-byte exports. No business rules.
use crate::domain_client::{send, DomainError};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PlanningRequest {
    SearchPolicies {
        payload: Value,
    },
    Sources {
        offset: u32,
    },
    SourceHistory {
        plan_id: String,
        #[serde(default)]
        offset: u32,
    },
    Revision {
        id: Uuid,
    },
    Original {
        id: Uuid,
        document_id: String,
    },
    PreviewImport {
        payload: Value,
    },
    ImportBundle {
        payload: Value,
    },
    Analyses {
        offset: u32,
    },
    Analysis {
        id: Uuid,
    },
    AnalysisHistory {
        id: Uuid,
        #[serde(default)]
        offset: u32,
    },
    CreateAnalysis {
        payload: Value,
    },
    ReviseAnalysis {
        id: Uuid,
        payload: Value,
    },
    PreviewSnapshot {
        id: Uuid,
        payload: Value,
    },
    CreateSnapshot {
        id: Uuid,
        payload: Value,
    },
    Snapshots {
        offset: u32,
    },
    Snapshot {
        id: Uuid,
    },
    ExportSnapshot {
        id: Uuid,
        expected_sha256: String,
    },
    AccessAdvice {
        id: Uuid,
    },
    SearchConnections {
        payload: Value,
    },
}

pub fn route(
    request: PlanningRequest,
    public: bool,
) -> Result<(Method, String, Option<Value>), DomainError> {
    use PlanningRequest::*;
    if public
        && !matches!(
            &request,
            SearchPolicies { .. }
                | Snapshots { .. }
                | Snapshot { .. }
                | Original { .. }
                | ExportSnapshot { .. }
        )
    {
        return Err(DomainError::denied());
    }
    let result = match request {
        SearchPolicies { payload } => (Method::POST, "/policies/search".into(), Some(payload)),
        Sources { offset } => (Method::GET, format!("/sources?offset={offset}"), None),
        SourceHistory { plan_id, offset } => (
            Method::GET,
            format!(
                "/sources/{}/history?offset={offset}",
                crate::code_client::encode_segment(&plan_id)?
            ),
            None,
        ),
        Revision { id } => (Method::GET, format!("/revisions/{id}"), None),
        Original { id, document_id } => (
            Method::GET,
            format!(
                "/revisions/{id}/documents/{}",
                crate::code_client::encode_segment(&document_id)?
            ),
            None,
        ),
        PreviewImport { payload } => (Method::POST, "/imports/preview".into(), Some(payload)),
        ImportBundle { payload } => (Method::POST, "/imports".into(), Some(payload)),
        Analyses { offset } => (Method::GET, format!("/analyses?offset={offset}"), None),
        Analysis { id } => (Method::GET, format!("/analyses/{id}"), None),
        AnalysisHistory { id, offset } => (
            Method::GET,
            format!("/analyses/{id}/history?offset={offset}"),
            None,
        ),
        CreateAnalysis { payload } => (Method::POST, "/analyses".into(), Some(payload)),
        ReviseAnalysis { id, payload } => (
            Method::POST,
            format!("/analyses/{id}/revisions"),
            Some(payload),
        ),
        PreviewSnapshot { id, payload } => (
            Method::POST,
            format!("/analyses/{id}/snapshot-preview"),
            Some(payload),
        ),
        CreateSnapshot { id, payload } => (
            Method::POST,
            format!("/analyses/{id}/snapshots"),
            Some(payload),
        ),
        Snapshots { offset } => (Method::GET, format!("/snapshots?offset={offset}"), None),
        Snapshot { id } | ExportSnapshot { id, .. } => {
            (Method::GET, format!("/snapshots/{id}"), None)
        }
        AccessAdvice { id } => (
            Method::POST,
            format!("/snapshots/{id}/access-advice"),
            Some(serde_json::json!({})),
        ),
        SearchConnections { payload } => {
            (Method::POST, "/connections/search".into(), Some(payload))
        }
    };
    let prefix = if public {
        "/civicplan"
    } else {
        "/desktop/v1/planning"
    };
    Ok((result.0, format!("{prefix}{}", result.1), result.2))
}

pub async fn execute(
    request: PlanningRequest,
    proof: String,
    public: bool,
) -> Result<Value, DomainError> {
    let export = match &request {
        PlanningRequest::ExportSnapshot {
            id,
            expected_sha256,
        } => Some((*id, expected_sha256.clone())),
        _ => None,
    };
    let original = matches!(&request, PlanningRequest::Original { .. });
    let (method, path, body) = route(request, public)?;
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
        let path = crate::domain_files::write_planning_file(
            &format!("planning-{id}-{}.json", Uuid::new_v4()),
            content.as_bytes(),
            digest,
        )
        .map_err(|_| DomainError::denied())?;
        return Ok(serde_json::json!({"path": path, "sha256": digest}));
    }
    if original {
        use base64::Engine;
        let encoded = result
            .get("content_base64")
            .and_then(Value::as_str)
            .ok_or_else(DomainError::denied)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| DomainError::denied())?;
        let filename = result
            .get("filename")
            .and_then(Value::as_str)
            .ok_or_else(DomainError::denied)?;
        let digest = result
            .get("sha256")
            .and_then(Value::as_str)
            .ok_or_else(DomainError::denied)?;
        let path = crate::domain_files::write_planning_file(
            &format!("{}-{filename}", Uuid::new_v4()),
            &bytes,
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
    fn public_transport_rejects_staff_reads_and_writes() {
        for operation in ["sources", "analyses"] {
            let request =
                serde_json::from_value(serde_json::json!({"operation":operation,"offset":0}))
                    .unwrap();
            assert!(route(request, true).is_err());
        }
        assert!(route(
            PlanningRequest::CreateAnalysis {
                payload: serde_json::json!({})
            },
            true
        )
        .is_err());
        let (_, path, _) = route(PlanningRequest::Snapshots { offset: 50 }, true).unwrap();
        assert_eq!(path, "/civicplan/snapshots?offset=50");
        assert!(serde_json::from_value::<PlanningRequest>(
            serde_json::json!({"operation":"snapshot","id":"../../private"})
        )
        .is_err());
        assert!(serde_json::from_value::<PlanningRequest>(
            serde_json::json!({"operation":"snapshots","offset":0,"actor":"forged"})
        )
        .is_err());
    }
}
