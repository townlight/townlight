//! Fixed native Communications transport. Callers cannot select a URL, path,
//! method, or credentials.
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::domain_client::{send, DomainError};

const MAX_JSON_BODY: usize = 16 * 1024 * 1024;
const BASE: &str = "/desktop/v1/communications";

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum CommunicationsRequest {
    Articles {},
    Article {
        id: Uuid,
    },
    Source {
        payload: Value,
    },
    AccessReview {
        payload: Value,
    },
    Create {
        payload: Value,
    },
    Edit {
        id: Uuid,
        payload: Value,
    },
    Review {
        id: Uuid,
        payload: Value,
    },
    Approve {
        id: Uuid,
        payload: Value,
    },
    Schedule {
        id: Uuid,
        payload: Value,
    },
    Attach {
        id: Uuid,
        payload: Value,
    },
    Attachment {
        id: Uuid,
        attachment_id: Uuid,
    },
    RemoveAttachment {
        id: Uuid,
        attachment_id: Uuid,
        payload: Value,
    },
    ArchiveRecords {
        id: Uuid,
        payload: Value,
    },
}

fn invalid_input() -> DomainError {
    DomainError::new(
        "invalid-communications",
        "Invalid communications input.",
        false,
    )
}

fn checked_body(body: Option<&Value>) -> Result<(), DomainError> {
    let Some(body) = body else { return Ok(()) };
    let bytes = serde_json::to_vec(body).map_err(|_| invalid_input())?;
    if bytes.len() > MAX_JSON_BODY {
        return Err(invalid_input());
    }
    Ok(())
}

pub async fn execute(request: CommunicationsRequest, proof: String) -> Result<Value, DomainError> {
    let (method, path, body) = match request {
        CommunicationsRequest::Articles {} => (Method::GET, format!("{BASE}/articles"), None),
        CommunicationsRequest::Article { id } => {
            (Method::GET, format!("{BASE}/articles/{id}"), None)
        }
        CommunicationsRequest::Source { payload } => (
            Method::POST,
            format!("{BASE}/sources/lookup"),
            Some(payload),
        ),
        CommunicationsRequest::AccessReview { payload } => {
            (Method::POST, format!("{BASE}/access-review"), Some(payload))
        }
        CommunicationsRequest::Create { payload } => {
            (Method::POST, format!("{BASE}/articles"), Some(payload))
        }
        CommunicationsRequest::Edit { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/revisions"),
            Some(payload),
        ),
        CommunicationsRequest::Review { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/review"),
            Some(payload),
        ),
        CommunicationsRequest::Approve { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/approval"),
            Some(payload),
        ),
        CommunicationsRequest::Schedule { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/schedule"),
            Some(payload),
        ),
        CommunicationsRequest::Attach { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/attachments"),
            Some(payload),
        ),
        CommunicationsRequest::Attachment { id, attachment_id } => (
            Method::GET,
            format!("{BASE}/articles/{id}/attachments/{attachment_id}"),
            None,
        ),
        CommunicationsRequest::RemoveAttachment {
            id,
            attachment_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/articles/{id}/attachments/{attachment_id}/remove"),
            Some(payload),
        ),
        CommunicationsRequest::ArchiveRecords { id, payload } => (
            Method::POST,
            format!("{BASE}/articles/{id}/records"),
            Some(payload),
        ),
    };
    checked_body(body.as_ref())?;
    send(method, path, body, &proof).await
}
