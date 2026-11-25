//! Fixed native Parks transport for catalog and household routes. Callers
//! cannot select an arbitrary URL or path.
use reqwest::Method;
use reqwest::Url;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::domain_client::{send, DomainError};

const MAX_JSON_BODY: usize = 16 * 1024 * 1024;
const BASE: &str = "/desktop/v1/parks";
const DATA_BASE: &str = "/desktop/v1/municipal-staff/data/parks";

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CatalogKind {
    Resource,
    Program,
}

impl CatalogKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Resource => "resource",
            Self::Program => "program",
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArchiveKind {
    Resource,
    Program,
    Booking,
    Registration,
}

impl ArchiveKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Resource => "resource",
            Self::Program => "program",
            Self::Booking => "booking",
            Self::Registration => "registration",
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Booking,
    Registration,
}

impl NotificationKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Booking => "booking",
            Self::Registration => "registration",
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ParksRequest {
    CatalogList {
        kind: CatalogKind,
        #[serde(default)]
        public_only: bool,
        limit: Option<u32>,
        offset: Option<u32>,
    },
    CatalogCreate {
        kind: CatalogKind,
        payload: Value,
    },
    CatalogGet {
        kind: CatalogKind,
        id: Uuid,
        #[serde(default)]
        public_only: bool,
    },
    CatalogUpdate {
        kind: CatalogKind,
        id: Uuid,
        payload: Value,
    },
    ClosuresList {
        resource_id: Uuid,
    },
    ClosuresCreate {
        resource_id: Uuid,
        payload: Value,
    },
    ClosuresDelete {
        resource_id: Uuid,
        closure_id: Uuid,
        payload: Value,
    },
    HouseholdsSearch {
        search: String,
        limit: Option<u32>,
        offset: Option<u32>,
    },
    HouseholdsCreate {
        payload: Value,
    },
    HouseholdsGet {
        id: Uuid,
    },
    ListParticipants {
        household_id: Uuid,
    },
    CreateParticipant {
        payload: Value,
    },
    EditParticipant {
        id: Uuid,
        payload: Value,
    },
    BookingsList {
        resource_id: Option<Uuid>,
        household_id: Option<Uuid>,
        limit: Option<u32>,
        offset: Option<u32>,
    },
    BookingsCreate {
        payload: Value,
    },
    BookingsGet {
        booking_id: Uuid,
    },
    BookingsTransition {
        booking_id: Uuid,
        payload: Value,
    },
    BookingsReschedule {
        booking_id: Uuid,
        payload: Value,
    },
    AvailabilityQuery {
        resource_id: Uuid,
        start: String,
        end: String,
    },
    SessionsList {
        program_id: Option<Uuid>,
        #[serde(default)]
        public_only: bool,
        limit: Option<u32>,
        offset: Option<u32>,
    },
    SessionsCreate {
        payload: Value,
    },
    SessionsGet {
        session_id: Uuid,
    },
    SessionsUpdate {
        session_id: Uuid,
        payload: Value,
    },
    SessionsRoster {
        session_id: Uuid,
    },
    RegistrationsCreate {
        payload: Value,
    },
    RegistrationsGet {
        registration_id: Uuid,
    },
    RegistrationsCancel {
        registration_id: Uuid,
        payload: Value,
    },
    RegistrationsCheckIn {
        registration_id: Uuid,
        payload: Value,
    },
    HouseholdRegistrations {
        household_id: Uuid,
    },
    ObligationGet {
        id: Uuid,
    },
    ObligationReceipt {
        id: Uuid,
    },
    OfflinePayment {
        id: Uuid,
        payload: Value,
    },
    OfflineRefund {
        id: Uuid,
        payload: Value,
    },
    Reconciliation {
        limit: Option<u32>,
        offset: Option<u32>,
    },
    RefundPrepare {
        payload: Value,
    },
    RefundGet {
        id: Uuid,
    },
    CheckoutGet {
        id: Uuid,
    },
    NotificationSummary {
        kind: NotificationKind,
        id: Uuid,
    },
    PaymentSettingsGet,
    PaymentSettingsPut {
        payload: Value,
    },
    ArchivePreview {
        kind: ArchiveKind,
        entity_id: Uuid,
    },
    ArchiveRecords {
        kind: ArchiveKind,
        entity_id: Uuid,
        payload: Value,
    },
    AttachmentList {
        kind: ArchiveKind,
        entity_id: Uuid,
    },
    AttachmentCreate {
        kind: ArchiveKind,
        entity_id: Uuid,
        payload: Value,
    },
    DownloadAttachment {
        attachment_id: Uuid,
    },
    AggregateReport,
    DataStatus,
    DataPreview,
    DataRevision {
        revision_id: Uuid,
    },
    DataPublish {
        payload: Value,
    },
    MaintenanceCreate {
        resource_id: Uuid,
        payload: Value,
    },
    MaintenanceList {
        resource_id: Uuid,
        limit: Option<u32>,
        offset: Option<u32>,
    },
    MaintenanceGet {
        link_id: Uuid,
    },
}

fn invalid_input() -> DomainError {
    DomainError::new("invalid-parks", "Invalid parks input.", false)
}

fn checked_body(body: Option<&Value>) -> Result<(), DomainError> {
    let Some(body) = body else { return Ok(()) };
    let bytes = serde_json::to_vec(body).map_err(|_| invalid_input())?;
    if bytes.len() > MAX_JSON_BODY {
        return Err(invalid_input());
    }
    Ok(())
}

fn checked_limit(limit: Option<u32>, max: u32) -> Result<(), DomainError> {
    if let Some(limit) = limit {
        if limit == 0 || limit > max {
            return Err(invalid_input());
        }
    }
    Ok(())
}

fn checked_search(search: &str) -> Result<(), DomainError> {
    if search.is_empty() || search.chars().count() > 200 {
        return Err(invalid_input());
    }
    Ok(())
}

fn checked_timestamp(value: &str) -> Result<(), DomainError> {
    if value.is_empty() || value.chars().count() > 64 {
        return Err(invalid_input());
    }
    Ok(())
}

fn encoded_path(path: String, pairs: &[(&str, String)]) -> Result<String, DomainError> {
    let mut url = Url::parse("http://localhost").map_err(|_| invalid_input())?;
    url.set_path(&path);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(key, value);
        }
    }
    let mut out = url.path().to_string();
    if let Some(query) = url.query() {
        out.push('?');
        out.push_str(query);
    }
    Ok(out)
}

pub async fn execute(request: ParksRequest, proof: String) -> Result<Value, DomainError> {
    let (method, path, body) = match request {
        ParksRequest::DownloadAttachment { attachment_id } => {
            return crate::service_requests_client::download_parks_attachment(attachment_id, proof)
                .await;
        }
        ParksRequest::CatalogList {
            kind,
            public_only,
            limit,
            offset,
        } => {
            checked_limit(limit, 200)?;
            let mut pairs = vec![("public_only", public_only.to_string())];
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(format!("{BASE}/catalog/{}", kind.as_str()), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::CatalogCreate { kind, payload } => (
            Method::POST,
            format!("{BASE}/catalog/{}", kind.as_str()),
            Some(payload),
        ),
        ParksRequest::CatalogGet {
            kind,
            id,
            public_only,
        } => {
            let pairs = vec![("public_only", public_only.to_string())];
            let path = encoded_path(format!("{BASE}/catalog/{}/{id}", kind.as_str()), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::CatalogUpdate { kind, id, payload } => (
            Method::PUT,
            format!("{BASE}/catalog/{}/{id}", kind.as_str()),
            Some(payload),
        ),
        ParksRequest::ClosuresList { resource_id } => (
            Method::GET,
            format!("{BASE}/resources/{resource_id}/closures"),
            None,
        ),
        ParksRequest::ClosuresCreate {
            resource_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/resources/{resource_id}/closures"),
            Some(payload),
        ),
        ParksRequest::ClosuresDelete {
            resource_id,
            closure_id,
            payload,
        } => (
            Method::DELETE,
            format!("{BASE}/resources/{resource_id}/closures/{closure_id}"),
            Some(payload),
        ),
        ParksRequest::HouseholdsSearch {
            search,
            limit,
            offset,
        } => {
            checked_search(&search)?;
            checked_limit(limit, 100)?;
            let mut pairs = vec![("search", search)];
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(format!("{BASE}/households"), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::HouseholdsCreate { payload } => {
            (Method::POST, format!("{BASE}/households"), Some(payload))
        }
        ParksRequest::HouseholdsGet { id } => {
            (Method::GET, format!("{BASE}/households/{id}"), None)
        }
        ParksRequest::ListParticipants { household_id } => (
            Method::GET,
            format!("{BASE}/households/{household_id}/participants"),
            None,
        ),
        ParksRequest::CreateParticipant { payload } => {
            (Method::POST, format!("{BASE}/participants"), Some(payload))
        }
        ParksRequest::EditParticipant { id, payload } => (
            Method::PUT,
            format!("{BASE}/participants/{id}"),
            Some(payload),
        ),
        ParksRequest::BookingsList {
            resource_id,
            household_id,
            limit,
            offset,
        } => {
            checked_limit(limit, 200)?;
            let mut pairs: Vec<(&str, String)> = Vec::new();
            if let Some(resource_id) = resource_id {
                pairs.push(("resource_id", resource_id.to_string()));
            }
            if let Some(household_id) = household_id {
                pairs.push(("household_id", household_id.to_string()));
            }
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(format!("{BASE}/bookings"), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::BookingsCreate { payload } => {
            (Method::POST, format!("{BASE}/bookings"), Some(payload))
        }
        ParksRequest::BookingsGet { booking_id } => {
            (Method::GET, format!("{BASE}/bookings/{booking_id}"), None)
        }
        ParksRequest::BookingsTransition {
            booking_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/bookings/{booking_id}/transition"),
            Some(payload),
        ),
        ParksRequest::BookingsReschedule {
            booking_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/bookings/{booking_id}/reschedule"),
            Some(payload),
        ),
        ParksRequest::AvailabilityQuery {
            resource_id,
            start,
            end,
        } => {
            checked_timestamp(&start)?;
            checked_timestamp(&end)?;
            let pairs = vec![("start", start), ("end", end)];
            let path = encoded_path(
                format!("{BASE}/resources/{resource_id}/availability"),
                &pairs,
            )?;
            (Method::GET, path, None)
        }
        ParksRequest::SessionsList {
            program_id,
            public_only,
            limit,
            offset,
        } => {
            checked_limit(limit, 200)?;
            let mut pairs = vec![("public_only", public_only.to_string())];
            if let Some(program_id) = program_id {
                pairs.push(("program_id", program_id.to_string()));
            }
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(format!("{BASE}/sessions"), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::SessionsCreate { payload } => {
            (Method::POST, format!("{BASE}/sessions"), Some(payload))
        }
        ParksRequest::SessionsGet { session_id } => {
            (Method::GET, format!("{BASE}/sessions/{session_id}"), None)
        }
        ParksRequest::SessionsUpdate {
            session_id,
            payload,
        } => (
            Method::PUT,
            format!("{BASE}/sessions/{session_id}"),
            Some(payload),
        ),
        ParksRequest::SessionsRoster { session_id } => (
            Method::GET,
            format!("{BASE}/sessions/{session_id}/roster"),
            None,
        ),
        ParksRequest::RegistrationsCreate { payload } => {
            (Method::POST, format!("{BASE}/registrations"), Some(payload))
        }
        ParksRequest::RegistrationsGet { registration_id } => (
            Method::GET,
            format!("{BASE}/registrations/{registration_id}"),
            None,
        ),
        ParksRequest::RegistrationsCancel {
            registration_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/registrations/{registration_id}/cancel"),
            Some(payload),
        ),
        ParksRequest::RegistrationsCheckIn {
            registration_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/registrations/{registration_id}/check-in"),
            Some(payload),
        ),
        ParksRequest::HouseholdRegistrations { household_id } => (
            Method::GET,
            format!("{BASE}/households/{household_id}/registrations"),
            None,
        ),
        ParksRequest::ObligationGet { id } => {
            (Method::GET, format!("{BASE}/obligations/{id}"), None)
        }
        ParksRequest::ObligationReceipt { id } => (
            Method::GET,
            format!("{BASE}/obligations/{id}/receipt"),
            None,
        ),
        ParksRequest::OfflinePayment { id, payload } => (
            Method::POST,
            format!("{BASE}/obligations/{id}/offline-payment"),
            Some(payload),
        ),
        ParksRequest::OfflineRefund { id, payload } => (
            Method::POST,
            format!("{BASE}/obligations/{id}/offline-refund"),
            Some(payload),
        ),
        ParksRequest::Reconciliation { limit, offset } => {
            checked_limit(limit, 100)?;
            let mut pairs: Vec<(&str, String)> = Vec::new();
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(format!("{BASE}/reconciliation"), &pairs)?;
            (Method::GET, path, None)
        }
        ParksRequest::RefundPrepare { payload } => {
            (Method::POST, format!("{BASE}/refunds"), Some(payload))
        }
        ParksRequest::RefundGet { id } => (Method::GET, format!("{BASE}/refunds/{id}"), None),
        ParksRequest::CheckoutGet { id } => (Method::GET, format!("{BASE}/checkouts/{id}"), None),
        ParksRequest::NotificationSummary { kind, id } => (
            Method::GET,
            format!("{BASE}/notifications/{}/{id}", kind.as_str()),
            None,
        ),
        ParksRequest::PaymentSettingsGet => {
            (Method::GET, format!("{BASE}/settings/payments"), None)
        }
        ParksRequest::PaymentSettingsPut { payload } => (
            Method::PUT,
            format!("{BASE}/settings/payments"),
            Some(payload),
        ),
        ParksRequest::ArchivePreview { kind, entity_id } => (
            Method::POST,
            format!("{BASE}/archives/{}/{entity_id}/preview", kind.as_str()),
            None,
        ),
        ParksRequest::ArchiveRecords {
            kind,
            entity_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/archives/{}/{entity_id}/records", kind.as_str()),
            Some(payload),
        ),
        ParksRequest::AttachmentList { kind, entity_id } => (
            Method::GET,
            format!("{BASE}/attachments/{}/{entity_id}", kind.as_str()),
            None,
        ),
        ParksRequest::AttachmentCreate {
            kind,
            entity_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/attachments/{}/{entity_id}", kind.as_str()),
            Some(payload),
        ),
        ParksRequest::AggregateReport => (Method::GET, format!("{BASE}/reports/aggregate"), None),
        ParksRequest::DataStatus => (Method::GET, DATA_BASE.to_string(), None),
        ParksRequest::DataPreview => (Method::POST, format!("{DATA_BASE}/preview"), None),
        ParksRequest::DataRevision { revision_id } => (
            Method::GET,
            format!("{DATA_BASE}/revisions/{revision_id}"),
            None,
        ),
        ParksRequest::DataPublish { payload } => {
            (Method::POST, format!("{DATA_BASE}/publish"), Some(payload))
        }
        ParksRequest::MaintenanceCreate {
            resource_id,
            payload,
        } => (
            Method::POST,
            format!("{BASE}/resources/{resource_id}/maintenance"),
            Some(payload),
        ),
        ParksRequest::MaintenanceList {
            resource_id,
            limit,
            offset,
        } => {
            checked_limit(limit, 100)?;
            let mut pairs: Vec<(&str, String)> = Vec::new();
            if let Some(limit) = limit {
                pairs.push(("limit", limit.to_string()));
            }
            if let Some(offset) = offset {
                pairs.push(("offset", offset.to_string()));
            }
            let path = encoded_path(
                format!("{BASE}/resources/{resource_id}/maintenance"),
                &pairs,
            )?;
            (Method::GET, path, None)
        }
        ParksRequest::MaintenanceGet { link_id } => {
            (Method::GET, format!("{BASE}/maintenance/{link_id}"), None)
        }
    };
    checked_body(body.as_ref())?;
    send(method, path, body, &proof).await
}
