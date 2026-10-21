use crate::domain_client::{send, DomainError};
use reqwest::{Method, Url};
use serde::Deserialize;
use serde_json::Value;

const BASE: &str = "http://127.0.0.1:15480";

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum CodeRequest {
    Connections {},
    Connection {
        id: String,
    },
    SendProposal {
        payload: Value,
    },
    CloseConnection {
        id: String,
        payload: Value,
    },
    Workspace {},
    Sources {},
    Import {
        payload: Value,
    },
    Lookup {
        section_number: String,
        as_of: Option<String>,
    },
    Citation {
        section_number: String,
        as_of: Option<String>,
    },
    Search {
        query: String,
    },
    History {
        id: String,
    },
    Export {
        section_ref: String,
        as_of: Option<String>,
    },
    Question {
        question: String,
        section_number: Option<String>,
        as_of: Option<String>,
    },
    ImportTree {
        id: String,
    },
    ImportProvenance {
        id: String,
    },
}

/// Encode an identifier as a single URL path segment, rejecting values that
/// could escape the intended path.
pub(crate) fn encode_segment(id: &str) -> Result<String, DomainError> {
    if id.is_empty()
        || id == "."
        || id == ".."
        || id.contains('/')
        || id.contains('\\')
        || id.chars().any(|c| c.is_control())
    {
        return Err(DomainError::denied());
    }

    let mut out = String::with_capacity(id.len());
    for b in id.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    Ok(out)
}

pub async fn execute(request: CodeRequest, proof: String) -> Result<Value, DomainError> {
    let base = Url::parse(BASE).map_err(|_| DomainError::denied())?;

    let (method, segment, body, params): (Method, String, Option<Value>, Vec<(&str, String)>) =
        match request {
            CodeRequest::Connections {} => {
                (Method::GET, "connections".to_string(), None, Vec::new())
            }
            CodeRequest::Connection { id } => (
                Method::GET,
                format!("connections/{}", encode_segment(&id)?),
                None,
                Vec::new(),
            ),
            CodeRequest::SendProposal { payload } => (
                Method::POST,
                "connections".to_string(),
                Some(serde_json::json!(payload)),
                Vec::new(),
            ),
            CodeRequest::CloseConnection { id, payload } => (
                Method::POST,
                format!("connections/{}/closeout", encode_segment(&id)?),
                Some(serde_json::json!(payload)),
                Vec::new(),
            ),
            CodeRequest::Workspace {} => (Method::GET, "workspace".to_string(), None, Vec::new()),
            CodeRequest::Sources {} => (Method::GET, "sources".to_string(), None, Vec::new()),
            CodeRequest::Import { payload } => (
                Method::POST,
                "imports".to_string(),
                Some(payload),
                Vec::new(),
            ),
            CodeRequest::Lookup {
                section_number,
                as_of,
            } => {
                let mut q = vec![("section_number", section_number)];
                if let Some(a) = as_of {
                    q.push(("as_of", a));
                }
                (Method::GET, "lookup".to_string(), None, q)
            }
            CodeRequest::Citation {
                section_number,
                as_of,
            } => {
                let mut q = vec![("section_number", section_number)];
                if let Some(a) = as_of {
                    q.push(("as_of", a));
                }
                (Method::GET, "citation".to_string(), None, q)
            }
            CodeRequest::Search { query } => {
                (Method::GET, "search".to_string(), None, vec![("q", query)])
            }
            CodeRequest::Export { section_ref, as_of } => {
                let mut params: Vec<(&str, String)> = vec![("section_ref", section_ref.clone())];
                if let Some(v) = as_of.clone() {
                    params.push(("as_of", v));
                }
                (reqwest::Method::GET, "export".to_string(), None, params)
            }
            CodeRequest::Question {
                question,
                section_number,
                as_of,
            } => {
                let body = serde_json::json!({
                    "question": question,
                    "section_number": section_number,
                    "as_of": as_of,
                });
                (
                    reqwest::Method::POST,
                    "questions".to_string(),
                    Some(body),
                    Vec::new(),
                )
            }
            CodeRequest::ImportTree { id } => (
                reqwest::Method::GET,
                format!("imports/{}/tree", encode_segment(&id)?),
                None,
                Vec::new(),
            ),
            CodeRequest::ImportProvenance { id } => (
                reqwest::Method::GET,
                format!("imports/{}/provenance", encode_segment(&id)?),
                None,
                Vec::new(),
            ),
            CodeRequest::History { id } => (
                Method::GET,
                format!("sections/{}/history", encode_segment(&id)?),
                None,
                Vec::new(),
            ),
        };

    let mut url = base
        .join(&format!("/desktop/v1/code/{}", segment))
        .map_err(|_| DomainError::denied())?;

    if !params.is_empty() {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in &params {
            pairs.append_pair(k, v);
        }
    }

    let path_and_query = match url.query() {
        Some(q) => format!("{}?{}", url.path(), q),
        None => url.path().to_string(),
    };

    send(method, path_and_query, body, &proof).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires paired disposable runtime at 127.0.0.1:15480"]
    fn native_code_roundtrip_with_real_runtime() {
        let proof = std::env::var("TOWNLIGHT_TEST_SESSION_PROOF")
            .expect("TOWNLIGHT_TEST_SESSION_PROOF must be set");
        let bundle_path = std::env::var("TOWNLIGHT_TEST_CODE_BUNDLE")
            .expect("TOWNLIGHT_TEST_CODE_BUNDLE must be set");
        let raw =
            std::fs::read_to_string(&bundle_path).expect("failed to read synthetic Code bundle");
        let payload: serde_json::Value =
            serde_json::from_str(&raw).expect("valid synthetic bundle JSON");
        tauri::async_runtime::block_on(async move {
            let workspace_err = execute(CodeRequest::Workspace {}, "0".repeat(64)).await;
            assert!(
                workspace_err.is_err(),
                "Workspace with bogus proof must fail"
            );
            let imported = execute(CodeRequest::Import { payload }, proof.clone())
                .await
                .expect("Import should succeed against real runtime");
            assert_eq!(
                imported["status"], "completed",
                "Import did not complete: {}",
                imported
            );
            let lookup = execute(
                CodeRequest::Lookup {
                    section_number: "6.12.040".to_string(),
                    as_of: Some("2025-06-01".to_string()),
                },
                proof.clone(),
            )
            .await
            .expect("Lookup should succeed");
            let body = lookup["version"]["body"]
                .as_str()
                .expect("Lookup version body");
            assert!(body.contains("four"), "Historical body: {}", body);
            let history = execute(
                CodeRequest::History {
                    id: "sec_6_12_040".to_string(),
                },
                proof.clone(),
            )
            .await
            .expect("History should succeed");
            assert_eq!(
                history["versions"]
                    .as_array()
                    .expect("versions array")
                    .len(),
                2
            );
            let citation = execute(
                CodeRequest::Citation {
                    section_number: "6.12.040".to_string(),
                    as_of: None,
                },
                proof,
            )
            .await
            .expect("Citation should succeed");
            assert_eq!(citation["status"], "ok");
            assert_eq!(citation["citation"]["source_id"], "csv_active");
        });
    }
}
