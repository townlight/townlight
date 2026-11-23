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
    Data {},
    PreviewData { payload: Value },
    ReviewData { id: Uuid },
    PublishData { payload: Value },
    WithdrawData { payload: Value },
    Budget {},
    GetBudget { id: Uuid },
    ImportBudget { payload: Value },
    ReviewBudget { id: Uuid, payload: Value },
    BudgetAttachment { id: Uuid },
    AdoptBudget { id: Uuid, payload: Value },
    PublishBudget { id: Uuid, payload: Value },
    GrantAssignees {},
    Grants {},
    GetGrant { id: Uuid },
    ArchiveGrant { id: Uuid },
    CreateGrant { payload: Value },
    AssignGrant { id: Uuid, payload: Value },
    ReviewGrant { id: Uuid, payload: Value },
    AwardGrant { id: Uuid, payload: Value },
    ReportGrant { id: Uuid, payload: Value },
    CloseoutGrant { id: Uuid, payload: Value },
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
            Self::Data {} | Self::PreviewData { .. } | Self::ReviewData { .. } => (
                &["townlight_data", "townlight_contracts"],
                "townlight_contracts",
                false,
            ),
            Self::PublishData { .. } | Self::WithdrawData { .. } => (
                &["townlight_data", "townlight_contracts"],
                "townlight_contracts",
                true,
            ),
            Self::RecordAward { .. } => (&["townlight_procurement"], "townlight_procurement", true),
            Self::Budget {}
            | Self::GetBudget { .. }
            | Self::BudgetAttachment { .. }
            | Self::AdoptBudget { .. } => (
                &["townlight_budget", "townlight_meetings"],
                "townlight_meetings",
                false,
            ),
            Self::ImportBudget { .. } | Self::ReviewBudget { .. } => {
                (&["townlight_budget"], "townlight_budget", false)
            }
            Self::PublishBudget { .. } => (
                &["townlight_budget", "townlight_data"],
                "townlight_budget",
                true,
            ),
            Self::GrantAssignees {}
            | Self::Grants {}
            | Self::GetGrant { .. }
            | Self::ArchiveGrant { .. }
            | Self::CreateGrant { .. }
            | Self::AssignGrant { .. }
            | Self::ReviewGrant { .. }
            | Self::AwardGrant { .. }
            | Self::ReportGrant { .. }
            | Self::CloseoutGrant { .. } => (&["townlight_grants"], "townlight_grants", false),
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
            Self::Data {} => (Method::GET, "data".into(), None),
            Self::ReviewData { id } => (Method::GET, format!("data/revisions/{id}"), None),
            Self::PreviewData { payload } => (Method::POST, "data/preview".into(), Some(payload)),
            Self::PublishData { payload } => (Method::POST, "data/publish".into(), Some(payload)),
            Self::WithdrawData { payload } => (Method::POST, "data/withdraw".into(), Some(payload)),
            Self::Budget {} => (Method::GET, "budget".into(), None),
            Self::GetBudget { id } => (Method::GET, format!("budget/{id}"), None),
            Self::ImportBudget { payload } => (Method::POST, "budget/import".into(), Some(payload)),
            Self::ReviewBudget { id, payload } => {
                (Method::POST, format!("budget/{id}/review"), Some(payload))
            }
            Self::BudgetAttachment { id } => (Method::GET, format!("budget/{id}/attachment"), None),
            Self::AdoptBudget { id, payload } => {
                (Method::POST, format!("budget/{id}/adopt"), Some(payload))
            }
            Self::PublishBudget { id, payload } => {
                (Method::POST, format!("budget/{id}/publish"), Some(payload))
            }
            Self::GrantAssignees {} => (Method::GET, "grants/assignees".into(), None),
            Self::Grants {} => (Method::GET, "grants".into(), None),
            Self::GetGrant { id } => (Method::GET, format!("grants/{id}"), None),
            Self::ArchiveGrant { id } => (Method::GET, format!("grants/{id}/archive"), None),
            Self::CreateGrant { payload } => (Method::POST, "grants".into(), Some(payload)),
            Self::AssignGrant { id, payload } => {
                (Method::POST, format!("grants/{id}/assign"), Some(payload))
            }
            Self::ReviewGrant { id, payload } => {
                (Method::POST, format!("grants/{id}/review"), Some(payload))
            }
            Self::AwardGrant { id, payload } => {
                (Method::POST, format!("grants/{id}/award"), Some(payload))
            }
            Self::ReportGrant { id, payload } => {
                (Method::POST, format!("grants/{id}/report"), Some(payload))
            }
            Self::CloseoutGrant { id, payload } => {
                (Method::POST, format!("grants/{id}/closeout"), Some(payload))
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
