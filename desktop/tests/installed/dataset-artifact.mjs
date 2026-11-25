import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const MEMBER_PATH = "dataset.json";
const MAX_BUFFER = 16 * 1024 * 1024;
const PYTHON_TIMEOUT_MS = 10_000;

const EXTRACT_MEMBER_SCRIPT = [
  "import io, sys, zipfile",
  "archive = sys.stdin.buffer.read()",
  "with zipfile.ZipFile(io.BytesIO(archive)) as z:",
  `    member = z.read(${JSON.stringify(MEMBER_PATH)})`,
  "sys.stdout.buffer.write(member)",
].join("\n");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateRevision(revision) {
  if (revision === null || typeof revision !== "object") {
    throw new TypeError("revision must be an object");
  }
  if (typeof revision.content_base64 !== "string") {
    throw new TypeError("revision.content_base64 must be a base64 string");
  }
  if (typeof revision.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(revision.sha256)) {
    throw new TypeError("revision.sha256 must be a 64-character SHA-256 hex string");
  }
  if (!Number.isSafeInteger(revision.size) || revision.size < 0) {
    throw new TypeError("revision.size must be a non-negative safe integer");
  }
}

/**
 * Verify that the published revision identifies the whole ZIP archive and that
 * the downloaded bytes are the exact approved dataset.json member bytes.
 *
 * revision.sha256 and revision.size describe the ZIP archive returned in
 * revision.content_base64. The ZIP is expected to contain dataset.json,
 * dataset.csv and data-dictionary.json. The member is extracted byte-for-byte
 * with Python's stdlib zipfile; JSON is never parsed or reserialized.
 */
export function verifyPublishedDataset(
  revision,
  actualBytes,
  python = process.env.TOWNLIGHT_TEST_PYTHON || "python",
) {
  validateRevision(revision);
  if (!Buffer.isBuffer(actualBytes)) {
    throw new TypeError("actualBytes must be a Buffer");
  }
  if (typeof python !== "string" || python.length === 0) {
    throw new TypeError("python must be a non-empty executable name or path");
  }

  const archiveBytes = Buffer.from(revision.content_base64, "base64");
  const sourceZipSha256 = sha256(archiveBytes);
  const expectedArchiveSha256 = revision.sha256.toLowerCase();

  if (sourceZipSha256 !== expectedArchiveSha256) {
    throw new Error(
      `Approved revision archive SHA-256 mismatch: revision.sha256=${expectedArchiveSha256}, ` +
        `actual ZIP SHA-256=${sourceZipSha256}. revision.sha256 must identify the whole ZIP archive, ` +
        `not a member such as ${MEMBER_PATH}.`,
    );
  }
  if (archiveBytes.length !== revision.size) {
    throw new Error(
      `Approved revision archive size mismatch: revision.size=${revision.size}, ` +
        `actual ZIP size=${archiveBytes.length}.`,
    );
  }

  let approvedMemberBytes;
  try {
    approvedMemberBytes = execFileSync(python, ["-c", EXTRACT_MEMBER_SCRIPT], {
      input: archiveBytes,
      timeout: PYTHON_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
  } catch (error) {
    throw new Error(
      `Failed to extract approved ${MEMBER_PATH} member with Python (${python}): ${error.message}`,
      { cause: error },
    );
  }

  const expectedMemberSha256 = sha256(approvedMemberBytes);
  const actualMemberSha256 = sha256(actualBytes);

  if (!actualBytes.equals(approvedMemberBytes)) {
    throw new Error(
      `Downloaded bytes do not match approved ${MEMBER_PATH} member bytes: ` +
        `actual member SHA-256=${actualMemberSha256}, approved member SHA-256=${expectedMemberSha256}, ` +
        `actual bytes=${actualBytes.length}, approved bytes=${approvedMemberBytes.length}, ` +
        `source ZIP SHA-256=${sourceZipSha256}.`,
    );
  }

  return {
    memberPath: MEMBER_PATH,
    memberSize: approvedMemberBytes.length,
    expectedMemberSha256,
    actualMemberSha256,
    sourceZipSha256,
  };
}
