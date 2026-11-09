use crate::domain_client::{self, DomainError};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum StaffRequest {
    Boards {},
    CreateBoard { payload: Value },
    SaveSeat { payload: Value },
    SaveAttendance { payload: Value },
    Contracts {},
    RegisterContract { payload: Value },
    SignContract { id: Uuid, payload: Value },
    ContractDocument { id: Uuid },
    Procurement {},
    SaveRfp { payload: Value },
    SaveProposal { id: Uuid, payload: Value },
    RecordAward { id: Uuid, payload: Value },
    CreateDraftContract { id: Uuid },
}

impl StaffRequest {
    pub fn requirements(&self) -> (&'static [&'static str], &'static str, bool) {
        match self {
            Self::Boards {}
            | Self::CreateBoard { .. }
            | Self::SaveSeat { .. }
            | Self::SaveAttendance { .. } => (
                &["townlight_boards", "townlight_meetings"],
                "townlight_meetings",
                false,
            ),
            Self::Contracts {}
            | Self::RegisterContract { .. }
            | Self::SignContract { .. }
            | Self::ContractDocument { .. } => {
                (&["townlight_contracts"], "townlight_contracts", false)
            }
            Self::CreateDraftContract { .. } => (
                &["townlight_procurement", "townlight_contracts"],
                "townlight_procurement",
                true,
            ),
            Self::RecordAward { .. } => (&["townlight_procurement"], "townlight_procurement", true),
            _ => (&["townlight_procurement"], "townlight_procurement", false),
        }
    }

    pub async fn execute(self, proof: &str) -> Result<Value, DomainError> {
        let (method, path, body) = match self {
            Self::Boards {} => (Method::GET, "boards".into(), None),
            Self::CreateBoard { payload } => (Method::POST, "boards".into(), Some(payload)),
            Self::SaveSeat { payload } => (Method::POST, "boards/seat".into(), Some(payload)),
            Self::SaveAttendance { payload } => {
                (Method::POST, "boards/attendance".into(), Some(payload))
            }
            Self::Contracts {} => (Method::GET, "contracts".into(), None),
            Self::RegisterContract { payload } => (Method::POST, "contracts".into(), Some(payload)),
            Self::SignContract { id, payload } => (
                Method::POST,
                format!("contracts/{id}/signed"),
                Some(payload),
            ),
            Self::ContractDocument { id } => {
                (Method::GET, format!("contracts/{id}/document"), None)
            }
            Self::Procurement {} => (Method::GET, "procurement".into(), None),
            Self::SaveRfp { payload } => (Method::POST, "procurement".into(), Some(payload)),
            Self::SaveProposal { id, payload } => (
                Method::POST,
                format!("procurement/{id}/proposal"),
                Some(payload),
            ),
            Self::RecordAward { id, payload } => (
                Method::POST,
                format!("procurement/{id}/award"),
                Some(payload),
            ),
            Self::CreateDraftContract { id } => {
                (Method::POST, format!("procurement/{id}/contract"), None)
            }
        };
        domain_client::send(
            method,
            format!("/desktop/v1/municipal-staff/{path}"),
            body,
            proof,
        )
        .await
    }
}
