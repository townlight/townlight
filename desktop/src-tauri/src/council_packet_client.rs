//! Move chosen attachments and verified council packets across the staff connection.
use super::{send, DomainError, PacketInput};
use base64::prelude::*;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use uuid::Uuid;

const MAX_REMOTE_ATTACHMENT: u64 = 8 * 1024 * 1024;
const MAX_PACKET_FILE: u64 = 512 * 1024 * 1024;
const CHUNK_BYTES: usize = 4 * 1024 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum PacketAccess {
    StaffOnly,
    PublicCandidate,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SelectedSource {
    path: String,
    packet_access: PacketAccess,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CouncilDownload {
    artifact_id: Uuid,
    manifest_sha256: String,
    approved: bool,
}

#[derive(Deserialize)]
struct FileChunk {
    sha256: String,
    size_bytes: u64,
    offset: u64,
    content_base64: String,
}

fn file_error(message: &'static str) -> DomainError {
    DomainError::new("council-packet-file", message, false)
}

pub(crate) async fn snapshot_payload(
    meeting_id: Uuid,
    payload: PacketInput,
    proof: &str,
) -> Result<Value, DomainError> {
    let mut selected = payload.council_sources;
    selected.extend(payload.source_paths.into_iter().map(|path| SelectedSource {
        path,
        packet_access: PacketAccess::StaffOnly,
    }));
    let mut local = Vec::new();
    let mut uploaded = Vec::new();
    for source in selected {
        if crate::shared_staff::configured() {
            let path = Path::new(&source.path);
            let name = path
                .file_name()
                .and_then(|part| part.to_str())
                .ok_or_else(|| file_error("The attachment requires a valid file name."))?;
            let file =
                File::open(path).map_err(|_| file_error("Open the attachment and try again."))?;
            let mut bytes = Vec::new();
            file.take(MAX_REMOTE_ATTACHMENT + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| file_error("The selected attachment could not be read."))?;
            if bytes.is_empty() || bytes.len() as u64 > MAX_REMOTE_ATTACHMENT {
                return Err(file_error(
                    "Choose a PDF or UTF-8 text attachment up to 8 MiB for shared work.",
                ));
            }
            let receipt = send(
                Method::POST,
                format!("/desktop/v1/meetings/meetings/{meeting_id}/council-source"),
                Some(json!({"file_name": name, "content_base64": BASE64_STANDARD.encode(bytes)})),
                proof,
            )
            .await?;
            let upload_id = receipt["upload_id"]
                .as_str()
                .and_then(|id| Uuid::parse_str(id).ok())
                .ok_or_else(|| file_error("The host did not confirm the attachment upload."))?;
            uploaded.push(json!({"upload_id": upload_id, "packet_access": source.packet_access}));
        } else {
            let receipt = crate::domain_files::stage_meetings(&source.path).map_err(|_| {
                file_error("The selected source file could not be staged; no packet was submitted.")
            })?;
            let mut receipt = json!(receipt);
            receipt["packet_access"] = json!(source.packet_access);
            local.push(receipt);
        }
    }
    Ok(
        json!({"agenda_item_ids": payload.agenda_item_ids, "public_agenda_ids": payload.public_agenda_ids,
        "prior_packet_id": payload.prior_packet_id, "retained_source_indexes": payload.retained_source_indexes,
        "source_files": local, "uploaded_sources": uploaded}),
    )
}

fn file_identity(bytes: &str) -> bool {
    bytes.len() == 64
        && bytes
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

pub(crate) async fn save_files(
    packet_id: Uuid,
    download: CouncilDownload,
    proof: &str,
) -> Result<Value, DomainError> {
    if !file_identity(&download.manifest_sha256) {
        return Err(file_error("The packet manifest hash is invalid."));
    }
    let folder = std::path::PathBuf::from(
        crate::local_paths::effective_locations()
            .map_err(|_| file_error("Townlight could not find the local project folder."))?
            .data_root,
    )
    .join("exports")
    .join("meetings")
    .join("downloaded-council-packets")
    .join(packet_id.to_string())
    .join(download.artifact_id.to_string());
    let parent = folder
        .parent()
        .ok_or_else(|| file_error("The packet export folder is unavailable."))?;
    fs::create_dir_all(parent)
        .map_err(|_| file_error("Could not create a local packet folder."))?;
    let temporary = parent.join(Uuid::new_v4().to_string());
    fs::create_dir(&temporary)
        .map_err(|_| file_error("Could not create a temporary packet folder."))?;
    let result = async {
        for name in ["packet.pdf", "agenda.html"] {
            let path = temporary.join(name);
            let mut file = OpenOptions::new().write(true).create_new(true).open(&path)
                .map_err(|_| file_error("Could not write local packet files."))?;
            let mut offset = 0;
            let mut expected = None;
            let mut hash = Sha256::new();
            loop {
                let response = send(Method::GET, format!(
                    "/desktop/v1/meetings/packets/{packet_id}/council-file/{}/{name}?manifest_sha256={}&offset={offset}&approved={}",
                    download.artifact_id, download.manifest_sha256, download.approved), None, proof).await?;
                let chunk: FileChunk = serde_json::from_value(response)
                    .map_err(|_| file_error("The host returned an incomplete packet download."))?;
                let bytes = BASE64_STANDARD.decode(chunk.content_base64)
                    .map_err(|_| file_error("The host returned invalid packet bytes."))?;
                let size = bytes.len() as u64;
                let identity = (chunk.sha256, chunk.size_bytes);
                if chunk.offset != offset || size == 0 || bytes.len() > CHUNK_BYTES ||
                    offset + size > identity.1 || identity.1 > MAX_PACKET_FILE ||
                    !file_identity(&identity.0) || expected.as_ref().is_some_and(|previous| previous != &identity) {
                    return Err(file_error("The downloaded packet does not match the host file metadata."));
                }
                file.write_all(&bytes).map_err(|_| file_error("Could not write the downloaded packet."))?;
                hash.update(&bytes);
                offset += size;
                if offset == identity.1 {
                    if format!("{:x}", hash.finalize()) != identity.0 {
                        return Err(file_error("The packet download failed its integrity check."));
                    }
                    break;
                }
                expected = Some(identity);
            }
            file.sync_all().map_err(|_| file_error("Could not finish the local packet file."))?;
        }
        // Every download has its own local copy, preserving any earlier reviewed copy.
        let target = folder.join(Uuid::new_v4().to_string());
        fs::create_dir_all(&folder).map_err(|_| file_error("Could not create the packet export folder."))?;
        fs::rename(&temporary, &target).map_err(|_| file_error("Could not save the local packet files."))?;
        Ok(json!({"folder": target}))
    }.await;
    if result.is_err() {
        let _ = fs::remove_dir_all(&temporary);
    }
    result
}
