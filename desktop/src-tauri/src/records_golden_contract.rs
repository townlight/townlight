// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) The CivicSuite Authors

//! Temporary test-only proof adapter for the Records Python/Postgres migration.
//!
//! Delete this module after packaged Townlight proves the Python/Postgres Records
//! path authoritative and preserves the final dual-runtime receipts as evidence.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

const CONTRACT_JSON: &str = include_str!("../resources/fixtures/records-golden-contract-v1.json");
const CONTRACT_SHA256: &str = "601ca9449f3e55f49b9b3443e6222514ce3bd5cf9923722a7e3da83d392fd995";

fn sha256_json(value: &Value) -> Result<String, String> {
    serde_json::to_vec(value)
        .map(|bytes| format!("{:x}", Sha256::digest(bytes)))
        .map_err(|error| format!("Could not serialize the Records golden contract: {error}"))
}

fn contract() -> Result<Value, String> {
    let mut value: Value = serde_json::from_str(CONTRACT_JSON)
        .map_err(|error| format!("The Records golden contract is invalid JSON: {error}"))?;
    let supplied_hash = value
        .get("contract_sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| "The Records golden contract has no contract_sha256.".to_string())?
        .to_string();
    value
        .as_object_mut()
        .ok_or_else(|| "The Records golden contract root must be an object.".to_string())?
        .remove("contract_sha256");
    let computed_hash = sha256_json(&value)?;
    if supplied_hash != computed_hash || supplied_hash != CONTRACT_SHA256 {
        return Err(
            "The Records golden contract does not match Core's pinned v1 hash.".to_string(),
        );
    }
    value["contract_sha256"] = Value::String(supplied_hash);
    let metadata = &value["metadata"];
    if metadata["purpose"] != "temporary-migration-proof"
        || metadata["expires_when"] != "python-postgres-records-authoritative"
        || metadata["fixture_sha256"] != crate::demo_fixture::FIXTURE_SHA256
    {
        return Err("The Records golden contract lifecycle metadata is invalid.".to_string());
    }
    Ok(value)
}

fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
    let _guard = crate::first_run::test_env_lock()
        .lock()
        .expect("test environment lock");
    let root = env::temp_dir().join(format!(
        "townlight-records-golden-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
    let result = test(root.clone());
    env::remove_var("CIVICSUITE_DESKTOP_STATE_DIR");
    let _ = fs::remove_dir_all(root);
    result
}

fn loaded_search_receipt() -> Result<Value, String> {
    let result = crate::workflows::city_work_action("load-demo-town", None)?;
    let request = result
        .state
        .records_requests
        .first()
        .ok_or_else(|| "The desktop golden receipt has no Records request.".to_string())?;
    Ok(json!({
        "contract_sha256": CONTRACT_SHA256,
        "fixture_sha256": crate::demo_fixture::FIXTURE_SHA256,
        "request_id": request.id,
        "searches": request.search_sessions.iter().map(|session| json!({
            "query": session.query,
            "record_ids": session.results.iter().map(|result| result.id.clone()).collect::<Vec<_>>(),
            "citations": session.results.iter().map(|result| result.citation.clone()).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    }))
}

#[test]
fn records_golden_contract_matches_core_and_declares_its_expiry() {
    let value = contract().expect("pinned Core contract validates");
    assert_eq!(value["contract_sha256"], CONTRACT_SHA256);
    assert_eq!(value["metadata"]["purpose"], "temporary-migration-proof");
    assert_eq!(
        value["metadata"]["expires_when"],
        "python-postgres-records-authoritative"
    );
}

#[test]
fn records_golden_search_receipt_matches_core_ground_truth() {
    with_temp_state_dir(|_| {
        let expected = contract().expect("pinned Core contract validates");
        let receipt = loaded_search_receipt().expect("desktop search receipt emits");
        assert_eq!(receipt["contract_sha256"], expected["contract_sha256"]);
        assert_eq!(
            receipt["fixture_sha256"],
            expected["metadata"]["fixture_sha256"]
        );
        assert_eq!(receipt["request_id"], expected["request"]["request_id"]);
        assert_eq!(receipt["searches"], expected["searches"]);
    });
}
