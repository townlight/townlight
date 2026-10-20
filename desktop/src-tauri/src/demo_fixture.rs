// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) The CivicSuite Authors

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const EMBEDDED_FIXTURE: &str =
    include_str!("../resources/fixtures/redstone-valley-records-demo-v1.json");
pub const FIXTURE_ID: &str = "redstone-valley-records-demo";
pub const FIXTURE_VERSION: &str = "1.0.0";
pub const FIXTURE_SHA256: &str = "a9c242a3f2618a69d7effb1d0d17d2df06f6744c8c351bba4065d315c94575b4";
pub const FIXTURE_NAME: &str = "Town of Redstone Valley (Fictional)";
pub const FIXTURE_REQUEST_ID: &str = "rv-request-2026-0001";
pub const WATERMARK: &str = "SYNTHETIC DEMONSTRATION DATA - NOT A REAL MUNICIPAL RECORD";

#[derive(Clone, Deserialize)]
pub struct DemoFixture {
    pub manifest: DemoManifest,
    pub records: Vec<DemoRecord>,
    pub requests: Vec<DemoRequest>,
    pub expected: DemoExpected,
    pub fixture_sha256: String,
}

#[derive(Clone, Deserialize)]
pub struct DemoExpected {
    pub counts: DemoExpectedCounts,
    pub pii: DemoExpectedPii,
    pub search: Vec<DemoExpectedSearch>,
    pub workflow: DemoExpectedWorkflow,
}

#[derive(Clone, Deserialize)]
pub struct DemoExpectedCounts {
    pub records: usize,
    pub requests: usize,
    pub sources: usize,
}

#[derive(Clone, Deserialize)]
pub struct DemoExpectedPii {
    pub expected_findings: Vec<Value>,
    pub record_ids: Vec<String>,
}

#[derive(Clone, Deserialize)]
pub struct DemoExpectedSearch {
    pub query: String,
    pub record_ids: Vec<String>,
}

#[derive(Clone, Deserialize)]
pub struct DemoExpectedWorkflow {
    pub human_approval_required: bool,
    pub request_id: String,
    pub status_sequence: Vec<String>,
}

#[derive(Clone, Deserialize)]
pub struct DemoManifest {
    pub schema_version: String,
    pub fixture_id: String,
    pub fixture_version: String,
    pub deterministic_seed: String,
    pub generation_mode: String,
    pub generator: String,
    pub municipality: DemoMunicipality,
    pub synthetic: bool,
    pub watermark: String,
    pub network_calls: bool,
    pub provenance_modes: Vec<String>,
    pub artifact_hashes: DemoArtifactHashes,
}

#[derive(Clone, Deserialize)]
pub struct DemoMunicipality {
    pub name: String,
    pub fictional: bool,
}

#[derive(Clone, Deserialize)]
pub struct DemoArtifactHashes {
    #[serde(rename = "expected.json")]
    pub expected: String,
    #[serde(rename = "records.json")]
    pub records: String,
    #[serde(rename = "requests.json")]
    pub requests: String,
    #[serde(rename = "sources.json")]
    pub sources: String,
}

#[derive(Clone, Deserialize)]
pub struct DemoRecord {
    pub record_id: String,
    pub title: String,
    pub content: String,
    pub content_sha256: String,
    pub synthetic: bool,
    pub watermark: String,
    pub contains_personal_data: bool,
}

#[derive(Clone, Deserialize)]
pub struct DemoRequest {
    pub request_id: String,
    pub description: String,
    pub received_at: String,
    pub target_record_ids: Vec<String>,
    pub policy_basis: String,
    pub synthetic: bool,
    pub watermark: String,
    pub contains_personal_data: bool,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct DemoFixtureMarker {
    pub fixture_id: String,
    pub fixture_version: String,
    pub fixture_sha256: String,
    pub municipality_name: String,
    pub watermark: String,
    pub loaded_at_unix_seconds: u64,
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sha256_json(value: &Value) -> Result<String, String> {
    serde_json::to_vec(value)
        .map(|bytes| sha256_bytes(&bytes))
        .map_err(|error| format!("Could not serialize the demo-town fixture: {error}"))
}

pub fn parse_and_validate(contents: &str) -> Result<DemoFixture, String> {
    let mut root: Value = serde_json::from_str(contents)
        .map_err(|error| format!("The embedded demo-town fixture is invalid JSON: {error}"))?;
    let supplied_hash = root
        .get("fixture_sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| "The demo-town fixture is missing fixture_sha256.".to_string())?
        .to_string();
    root.as_object_mut()
        .ok_or_else(|| "The demo-town fixture root must be an object.".to_string())?
        .remove("fixture_sha256");
    let computed_hash = sha256_json(&root)?;
    if supplied_hash != computed_hash || supplied_hash != FIXTURE_SHA256 {
        return Err(
            "The demo-town fixture hash does not match Core's pinned v1 contract.".to_string(),
        );
    }

    let fixture: DemoFixture = serde_json::from_str(contents)
        .map_err(|error| format!("The demo-town fixture does not match its contract: {error}"))?;
    let manifest = &fixture.manifest;
    if manifest.schema_version != "1.0.0"
        || manifest.fixture_id != FIXTURE_ID
        || manifest.fixture_version != FIXTURE_VERSION
        || manifest.deterministic_seed != "townlight-records-demo-v1"
        || manifest.generation_mode != "static-canonical-v1"
        || manifest.generator != "civiccore.testing.mock_city"
        || manifest.municipality.name != FIXTURE_NAME
        || !manifest.municipality.fictional
        || !manifest.synthetic
        || manifest.network_calls
        || manifest.watermark != WATERMARK
        || manifest.provenance_modes != ["fully-synthetic"]
        || fixture.fixture_sha256 != FIXTURE_SHA256
    {
        return Err(
            "The demo-town manifest does not match Core's canonical v1 contract.".to_string(),
        );
    }

    let root: Value = serde_json::from_str(contents)
        .map_err(|error| format!("Could not re-read the demo-town fixture: {error}"))?;
    for (key, expected_hash) in [
        ("expected", manifest.artifact_hashes.expected.as_str()),
        ("records", manifest.artifact_hashes.records.as_str()),
        ("requests", manifest.artifact_hashes.requests.as_str()),
        ("sources", manifest.artifact_hashes.sources.as_str()),
    ] {
        let value = root
            .get(key)
            .ok_or_else(|| format!("The demo-town fixture is missing {key}."))?;
        if sha256_json(value)? != expected_hash {
            return Err(format!("The demo-town {key} artifact hash is invalid."));
        }
    }
    if fixture.records.len() != 3
        || fixture.requests.len() != 1
        || fixture.expected.counts.records != fixture.records.len()
        || fixture.expected.counts.requests != fixture.requests.len()
        || fixture.expected.counts.sources != 1
        || !fixture.expected.pii.expected_findings.is_empty()
        || fixture.expected.pii.record_ids.len() != fixture.records.len()
        || !fixture.expected.workflow.human_approval_required
        || fixture.expected.workflow.request_id != FIXTURE_REQUEST_ID
        || fixture.expected.workflow.status_sequence
            != [
                "received",
                "assigned",
                "searching",
                "in_review",
                "approved",
                "fulfilled",
                "closed",
            ]
    {
        return Err(
            "The canonical demo town ground truth does not match its pinned contract.".to_string(),
        );
    }
    for record in &fixture.records {
        if !record.synthetic
            || record.contains_personal_data
            || record.watermark != WATERMARK
            || sha256_bytes(record.content.as_bytes()) != record.content_sha256
        {
            return Err(format!(
                "Demo record {} failed safety validation.",
                record.record_id
            ));
        }
    }
    for request in &fixture.requests {
        if !request.synthetic || request.contains_personal_data || request.watermark != WATERMARK {
            return Err(format!(
                "Demo request {} failed safety validation.",
                request.request_id
            ));
        }
        if request
            .target_record_ids
            .iter()
            .any(|id| !fixture.records.iter().any(|record| &record.record_id == id))
        {
            return Err(format!(
                "Demo request {} has an unknown record reference.",
                request.request_id
            ));
        }
    }
    if fixture.expected.search.iter().any(|search| {
        search.query.trim().is_empty()
            || search.record_ids.is_empty()
            || search
                .record_ids
                .iter()
                .any(|id| !fixture.records.iter().any(|record| &record.record_id == id))
    }) {
        return Err("The demo search ground truth has an invalid record reference.".to_string());
    }
    Ok(fixture)
}

pub fn embedded_fixture() -> Result<DemoFixture, String> {
    parse_and_validate(EMBEDDED_FIXTURE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_fixture_matches_core_golden_contract() {
        let fixture = embedded_fixture().expect("canonical fixture validates");
        assert_eq!(fixture.fixture_sha256, FIXTURE_SHA256);
        assert_eq!(fixture.records.len(), 3);
        assert_eq!(fixture.requests.len(), 1);
        assert_eq!(fixture.expected.search.len(), 2);
    }

    #[test]
    fn fixture_tampering_fails_closed() {
        let tampered = EMBEDDED_FIXTURE.replace("fictional council", "actual council");
        let error = match parse_and_validate(&tampered) {
            Ok(_) => panic!("tampering must fail"),
            Err(error) => error,
        };
        assert!(error.contains("hash"));
    }
}
