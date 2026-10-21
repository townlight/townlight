use crate::domain_client::{send, DomainError};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ZoningRequest {
    Lookup { payload: Value },
    Question { payload: Value },
    RegisterRule { payload: Value },
    ImportBundle { payload: Value },
    Workspace {},
    Review { id: uuid::Uuid, payload: Value },
    Outline { payload: Value },
    CodeContext { payload: Value },
    SearchMeetings { payload: Value },
    LinkMeeting { id: uuid::Uuid, payload: Value },
    History { id: uuid::Uuid },
    Snapshot { id: uuid::Uuid, payload: Value },
}

pub async fn execute(
    request: ZoningRequest,
    proof: String,
    public: bool,
) -> Result<Value, DomainError> {
    let (method, path, body): (Method, String, Option<Value>) = match request {
        ZoningRequest::Lookup { payload } => {
            (Method::POST, "/parcels/lookup".into(), Some(payload))
        }
        ZoningRequest::Question { payload } => (Method::POST, "/questions".into(), Some(payload)),
        ZoningRequest::RegisterRule { payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::POST, "/rules".into(), Some(payload))
        }
        ZoningRequest::ImportBundle { payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::POST, "/imports".into(), Some(payload))
        }
        ZoningRequest::Workspace {} => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::GET, "/workspace".into(), None)
        }
        ZoningRequest::Review { id, payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (
                Method::POST,
                format!("/questions/{id}/reviews"),
                Some(payload),
            )
        }
        ZoningRequest::Outline { payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::POST, "/outlines".into(), Some(payload))
        }
        ZoningRequest::CodeContext { payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::POST, "/code-context".into(), Some(payload))
        }
        ZoningRequest::SearchMeetings { payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::POST, "/meetings/search".into(), Some(payload))
        }
        ZoningRequest::LinkMeeting { id, payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (
                Method::POST,
                format!("/questions/{id}/meetings"),
                Some(payload),
            )
        }
        ZoningRequest::History { id } => {
            if public {
                return Err(DomainError::denied());
            }
            (Method::GET, format!("/questions/{id}/history"), None)
        }
        ZoningRequest::Snapshot { id, payload } => {
            if public {
                return Err(DomainError::denied());
            }
            (
                Method::POST,
                format!("/questions/{id}/snapshots"),
                Some(payload),
            )
        }
    };
    let prefix = if public {
        "/civiczone"
    } else {
        "/desktop/v1/zoning"
    };
    let full_path = format!("{prefix}{path}");
    send(method, full_path, body, &proof).await
}
