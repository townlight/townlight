//! Fixed native Department Workpapers transport. Callers cannot select a URL,
//! path, method, or credentials.
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::domain_client::{send, DomainError};

const MAX_JSON_BODY: usize = 16 * 1024 * 1024;
const UTILITIES_BASE: &str = "/desktop/v1/utilities";
const LIBRARY_BASE: &str = "/desktop/v1/library";
const ELECTIONS_BASE: &str = "/desktop/v1/elections";
const ELECTIONS_SETTINGS: &str = "/desktop/v1/elections/settings";

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum UtilitiesRequest {
    Policies {},
    RegisterPolicy {
        payload: Value,
    },
    OpenRequest {
        request_id: Uuid,
    },
    SaveDraft {
        request_id: Uuid,
        payload: Value,
    },
    ApproveReply {
        request_id: Uuid,
        payload: Value,
    },
    RetryReply {
        request_id: Uuid,
        payload: Value,
    },
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PublicationRequest {
    List {},
    Create {
        payload: Value,
    },
    Get {
        id: Uuid,
        #[serde(default)]
        revision: Option<u32>,
    },
    Source {
        id: Uuid,
        #[serde(default)]
        revision: Option<u32>,
    },
    Edit {
        id: Uuid,
        payload: Value,
    },
    Approve {
        id: Uuid,
        payload: Value,
    },
    Receipts {
        id: Uuid,
        payload: Value,
    },
    Settings {},
    SaveSettings {
        payload: Value,
    },
}

#[derive(Copy, Clone)]
pub enum PublicationModule {
    Library,
    Elections,
}

fn invalid_utilities() -> DomainError {
    DomainError::new("invalid-utilities", "Invalid utilities input.", false)
}

fn invalid_publication() -> DomainError {
    DomainError::new("invalid-publication", "Invalid publication input.", false)
}

fn checked_body(body: Option<&Value>) -> Result<(), ()> {
    let Some(body) = body else {
        return Ok(());
    };
    let bytes = serde_json::to_vec(body).map_err(|_| ())?;
    if bytes.len() > MAX_JSON_BODY {
        return Err(());
    }
    Ok(())
}

fn revision_query(revision: Option<u32>) -> Result<String, DomainError> {
    match revision {
        None => Ok(String::new()),
        Some(0) => Err(invalid_publication()),
        Some(revision) => Ok(format!("?revision={revision}")),
    }
}

fn plan_utilities(
    request: UtilitiesRequest,
) -> Result<(Method, String, Option<Value>), DomainError> {
    let (method, path, body) = match request {
        UtilitiesRequest::Policies {} => (
            Method::GET,
            format!("{UTILITIES_BASE}/policies"),
            None,
        ),
        UtilitiesRequest::RegisterPolicy { payload } => (
            Method::POST,
            format!("{UTILITIES_BASE}/policies"),
            Some(payload),
        ),
        UtilitiesRequest::OpenRequest { request_id } => (
            Method::GET,
            format!("{UTILITIES_BASE}/requests/{request_id}"),
            None,
        ),
        UtilitiesRequest::SaveDraft {
            request_id,
            payload,
        } => (
            Method::POST,
            format!("{UTILITIES_BASE}/requests/{request_id}/draft"),
            Some(payload),
        ),
        UtilitiesRequest::ApproveReply {
            request_id,
            payload,
        } => (
            Method::POST,
            format!("{UTILITIES_BASE}/requests/{request_id}/approve"),
            Some(payload),
        ),
        UtilitiesRequest::RetryReply {
            request_id,
            payload,
        } => (
            Method::POST,
            format!("{UTILITIES_BASE}/requests/{request_id}/retry"),
            Some(payload),
        ),
    };
    Ok((method, path, body))
}

fn plan_publication(
    module: PublicationModule,
    request: PublicationRequest,
) -> Result<(Method, String, Option<Value>), DomainError> {
    let base = match module {
        PublicationModule::Library => LIBRARY_BASE,
        PublicationModule::Elections => ELECTIONS_BASE,
    };

    let (method, path, body) = match request {
        PublicationRequest::List {} => (Method::GET, format!("{base}/items"), None),
        PublicationRequest::Create { payload } => {
            (Method::POST, format!("{base}/items"), Some(payload))
        }
        PublicationRequest::Get { id, revision } => {
            let query = revision_query(revision)?;
            (Method::GET, format!("{base}/items/{id}{query}"), None)
        }
        PublicationRequest::Source { id, revision } => {
            let query = revision_query(revision)?;
            (
                Method::GET,
                format!("{base}/items/{id}/source{query}"),
                None,
            )
        }
        PublicationRequest::Edit { id, payload } => (
            Method::POST,
            format!("{base}/items/{id}/revisions"),
            Some(payload),
        ),
        PublicationRequest::Approve { id, payload } => (
            Method::POST,
            format!("{base}/items/{id}/approval"),
            Some(payload),
        ),
        PublicationRequest::Receipts { id, payload } => (
            Method::POST,
            format!("{base}/items/{id}/receipts"),
            Some(payload),
        ),
        PublicationRequest::Settings {} => {
            if let PublicationModule::Library = module {
                return Err(invalid_publication());
            }
            (Method::GET, ELECTIONS_SETTINGS.to_string(), None)
        }
        PublicationRequest::SaveSettings { payload } => {
            if let PublicationModule::Library = module {
                return Err(invalid_publication());
            }
            (Method::POST, ELECTIONS_SETTINGS.to_string(), Some(payload))
        }
    };
    Ok((method, path, body))
}

pub async fn execute_utilities(
    request: UtilitiesRequest,
    proof: String,
) -> Result<Value, DomainError> {
    let (method, path, body) = plan_utilities(request)?;
    checked_body(body.as_ref()).map_err(|_| invalid_utilities())?;
    send(method, path, body, &proof).await
}

pub async fn execute_publication(
    module: PublicationModule,
    request: PublicationRequest,
    proof: String,
) -> Result<Value, DomainError> {
    let (method, path, body) = plan_publication(module, request)?;
    checked_body(body.as_ref()).map_err(|_| invalid_publication())?;
    send(method, path, body, &proof).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn utilities_ok(request: UtilitiesRequest) -> (Method, String, Option<Value>) {
        match plan_utilities(request) {
            Ok(plan) => plan,
            Err(_) => panic!("expected utilities plan"),
        }
    }

    fn publication_ok(
        module: PublicationModule,
        request: PublicationRequest,
    ) -> (Method, String, Option<Value>) {
        match plan_publication(module, request) {
            Ok(plan) => plan,
            Err(_) => panic!("expected publication plan"),
        }
    }

    #[test]
    fn utilities_use_only_fixed_paths() {
        let (method, path, body) = utilities_ok(UtilitiesRequest::Policies {});
        assert!(method == Method::GET);
        assert_eq!(path, "/desktop/v1/utilities/policies");
        assert!(body.is_none());

        let (method, path, body) = utilities_ok(UtilitiesRequest::RegisterPolicy {
            payload: json!({ "title": "Policy" }),
        });
        assert!(method == Method::POST);
        assert_eq!(path, "/desktop/v1/utilities/policies");
        assert!(body.is_some());

        let request_id =
            Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();
        let (method, path, body) = utilities_ok(UtilitiesRequest::OpenRequest { request_id });
        assert!(method == Method::GET);
        assert_eq!(
            path,
            "/desktop/v1/utilities/requests/00112233-4455-6677-8899-aabbccddeeff"
        );
        assert!(body.is_none());

        let (method, path, body) = utilities_ok(UtilitiesRequest::SaveDraft {
            request_id,
            payload: json!({ "body": "Draft" }),
        });
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/utilities/requests/00112233-4455-6677-8899-aabbccddeeff/draft"
        );
        assert!(body.is_some());

        let (method, path, _) = utilities_ok(UtilitiesRequest::ApproveReply {
            request_id,
            payload: json!({ "body": "Approved" }),
        });
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/utilities/requests/00112233-4455-6677-8899-aabbccddeeff/approve"
        );

        let (method, path, _) = utilities_ok(UtilitiesRequest::RetryReply {
            request_id,
            payload: json!({ "body": "Retry" }),
        });
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/utilities/requests/00112233-4455-6677-8899-aabbccddeeff/retry"
        );
    }

    #[test]
    fn publication_revision_query_is_canonical_and_rejects_zero() {
        let id = Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();

        let (method, path, _) = publication_ok(
            PublicationModule::Library,
            PublicationRequest::Get { id, revision: None },
        );
        assert!(method == Method::GET);
        assert_eq!(
            path,
            "/desktop/v1/library/items/00112233-4455-6677-8899-aabbccddeeff"
        );

        let (method, path, _) = publication_ok(
            PublicationModule::Library,
            PublicationRequest::Get {
                id,
                revision: Some(7),
            },
        );
        assert!(method == Method::GET);
        assert_eq!(
            path,
            "/desktop/v1/library/items/00112233-4455-6677-8899-aabbccddeeff?revision=7"
        );

        let (method, path, _) = publication_ok(
            PublicationModule::Elections,
            PublicationRequest::Source {
                id,
                revision: Some(2),
            },
        );
        assert!(method == Method::GET);
        assert_eq!(
            path,
            "/desktop/v1/elections/items/00112233-4455-6677-8899-aabbccddeeff/source?revision=2"
        );

        assert!(plan_publication(
            PublicationModule::Library,
            PublicationRequest::Get {
                id,
                revision: Some(0),
            },
        )
        .is_err());
        assert!(plan_publication(
            PublicationModule::Elections,
            PublicationRequest::Source {
                id,
                revision: Some(0),
            },
        )
        .is_err());
    }

    #[test]
    fn publication_actions_use_module_base() {
        let id = Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();

        let (method, path, body) = publication_ok(
            PublicationModule::Library,
            PublicationRequest::List {},
        );
        assert!(method == Method::GET);
        assert_eq!(path, "/desktop/v1/library/items");
        assert!(body.is_none());

        let (method, path, body) = publication_ok(
            PublicationModule::Elections,
            PublicationRequest::Create {
                payload: json!({ "title": "Election" }),
            },
        );
        assert!(method == Method::POST);
        assert_eq!(path, "/desktop/v1/elections/items");
        assert!(body.is_some());

        let (method, path, body) = publication_ok(
            PublicationModule::Library,
            PublicationRequest::Edit {
                id,
                payload: json!({ "body": "Revision" }),
            },
        );
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/library/items/00112233-4455-6677-8899-aabbccddeeff/revisions"
        );
        assert!(body.is_some());

        let (method, path, body) = publication_ok(
            PublicationModule::Elections,
            PublicationRequest::Approve {
                id,
                payload: json!({ "decision": "approved" }),
            },
        );
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/elections/items/00112233-4455-6677-8899-aabbccddeeff/approval"
        );
        assert!(body.is_some());

        let (method, path, body) = publication_ok(
            PublicationModule::Library,
            PublicationRequest::Receipts {
                id,
                payload: json!({ "count": 3 }),
            },
        );
        assert!(method == Method::POST);
        assert_eq!(
            path,
            "/desktop/v1/library/items/00112233-4455-6677-8899-aabbccddeeff/receipts"
        );
        assert!(body.is_some());
    }

    #[test]
    fn library_settings_are_rejected() {
        assert!(plan_publication(
            PublicationModule::Library,
            PublicationRequest::Settings {},
        )
        .is_err());
        assert!(plan_publication(
            PublicationModule::Library,
            PublicationRequest::SaveSettings {
                payload: json!({ "enabled": true }),
            },
        )
        .is_err());

        let (method, path, body) = publication_ok(
            PublicationModule::Elections,
            PublicationRequest::Settings {},
        );
        assert!(method == Method::GET);
        assert_eq!(path, "/desktop/v1/elections/settings");
        assert!(body.is_none());

        let (method, path, body) = publication_ok(
            PublicationModule::Elections,
            PublicationRequest::SaveSettings {
                payload: json!({ "enabled": true }),
            },
        );
        assert!(method == Method::POST);
        assert_eq!(path, "/desktop/v1/elections/settings");
        assert!(body.is_some());
    }

    #[test]
    fn deserialization_denies_unknown_fields_and_invalid_uuids() {
        assert!(serde_json::from_value::<UtilitiesRequest>(json!({
            "operation": "policies",
            "url": "/desktop/v1/other"
        }))
        .is_err());

        assert!(serde_json::from_value::<PublicationRequest>(json!({
            "operation": "get",
            "id": "not-a-uuid"
        }))
        .is_err());

        let parsed: PublicationRequest = match serde_json::from_value(json!({
            "operation": "get",
            "id": "00112233-4455-6677-8899-aabbccddeeff"
        })) {
            Ok(parsed) => parsed,
            Err(_) => panic!("expected valid publication request"),
        };

        match parsed {
            PublicationRequest::Get { revision: None, .. } => {}
            _ => panic!("expected get with default revision"),
        }
    }
}
