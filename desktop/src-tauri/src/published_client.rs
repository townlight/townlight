//! Read-only public projections. No caller-selected URL or staff session proof.
use crate::domain_client::{send, DomainError};
use reqwest::{Method, Url};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PublishedRequest {
    MeetingsSearch {
        query: String,
    },
    MeetingsRecord {
        id: Uuid,
    },
    CodeSearch {
        query: String,
    },
    CodeLookup {
        section_number: String,
        as_of: Option<String>,
    },
    CodeCitation {
        section_number: String,
        as_of: Option<String>,
    },
    CodeExport {
        section_number: String,
        as_of: Option<String>,
    },
    CodeAnswer {
        query: String,
        section_number: Option<String>,
        as_of: Option<String>,
    },
}

impl PublishedRequest {
    pub fn module_id(&self) -> &'static str {
        match self {
            Self::MeetingsSearch { .. } | Self::MeetingsRecord { .. } => "townlight_meetings",
            _ => "townlight_code",
        }
    }
    fn route(self) -> Result<String, DomainError> {
        use PublishedRequest::*;
        let (path, params) = match self {
            MeetingsSearch { query } => (
                "/public/meetings/data/index".to_string(),
                vec![("q", query)],
            ),
            MeetingsRecord { id } => (format!("/public/meetings/data/{id}"), vec![]),
            CodeSearch { query } => (
                "/townlight_code/public-data/search".into(),
                vec![("q", query)],
            ),
            CodeLookup {
                section_number,
                as_of,
            }
            | CodeCitation {
                section_number,
                as_of,
            } => {
                let mut params = vec![("section_number", section_number)];
                if let Some(date) = as_of {
                    params.push(("as_of", date));
                }
                ("/townlight_code/public-data/section".into(), params)
            }
            CodeExport {
                section_number,
                as_of,
            } => {
                let mut params = vec![("section_number", section_number)];
                if let Some(date) = as_of {
                    params.push(("as_of", date));
                }
                ("/townlight_code/public-data/export".into(), params)
            }
            CodeAnswer {
                query,
                section_number,
                as_of,
            } => {
                let mut params = vec![("q", query)];
                if let Some(number) = section_number {
                    params.push(("section_number", number));
                }
                if let Some(date) = as_of {
                    params.push(("as_of", date));
                }
                ("/townlight_code/public-data/answer".into(), params)
            }
        };
        let mut url = Url::parse("http://127.0.0.1:15480").map_err(|_| DomainError::denied())?;
        url.set_path(&path);
        if !params.is_empty() {
            url.query_pairs_mut().extend_pairs(params);
        }
        Ok(match url.query() {
            Some(q) => format!("{}?{}", url.path(), q),
            None => url.path().to_string(),
        })
    }
}

pub async fn execute(request: PublishedRequest) -> Result<Value, DomainError> {
    send(Method::GET, request.route()?, None, "").await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_transport_is_fixed_and_encodes_queries() {
        let request = PublishedRequest::CodeLookup {
            section_number: "1&staff=true/#".into(),
            as_of: None,
        };
        assert_eq!(request.module_id(), "townlight_code");
        let path = request.route().unwrap();
        let url = Url::parse(&format!("http://127.0.0.1:15480{path}")).unwrap();
        assert_eq!(url.path(), "/townlight_code/public-data/section");
        assert_eq!(url.query_pairs().count(), 1);
        assert!(serde_json::from_value::<PublishedRequest>(
            serde_json::json!({"operation":"import","payload":{}})
        )
        .is_err());
    }
}
