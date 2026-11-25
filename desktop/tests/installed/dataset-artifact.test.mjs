import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import { verifyPublishedDataset } from "./dataset-artifact.mjs";

const PYTHON = process.env.TOWNLIGHT_TEST_PYTHON || "python";
const MAX_BUFFER = 16 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

const DATASET_JSON = Buffer.from(
  '{"columns":["a","b"],"rows":[[1,2],[3,4]]}\n',
  "utf8",
);
const DATASET_CSV = Buffer.from("a,b\n1,2\n3,4\n", "utf8");
const DATA_DICTIONARY = Buffer.from('{"a":"first","b":"second"}\n', "utf8");

const CREATE_FIXTURE_ZIP_SCRIPT = [
  "import base64, io, json, sys, zipfile",
  "members = json.load(sys.stdin)",
  "out = io.BytesIO()",
  'with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:',
  "    for item in members:",
  '        info = zipfile.ZipInfo(item["name"], date_time=(2024, 1, 1, 0, 0, 0))',
  "        info.compress_type = zipfile.ZIP_STORED",
  "        info.external_attr = 0o644 << 16",
  '        z.writestr(info, base64.b64decode(item["base64"]))',
  "sys.stdout.buffer.write(out.getvalue())",
].join("\n");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeFixtureArchive() {
  const members = [
    { name: "dataset.json", base64: DATASET_JSON.toString("base64") },
    { name: "dataset.csv", base64: DATASET_CSV.toString("base64") },
    { name: "data-dictionary.json", base64: DATA_DICTIONARY.toString("base64") },
  ];
  return execFileSync(PYTHON, ["-c", CREATE_FIXTURE_ZIP_SCRIPT], {
    input: JSON.stringify(members),
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
}

function revisionFor(archiveBytes) {
  return {
    sha256: sha256(archiveBytes),
    content_base64: archiveBytes.toString("base64"),
    size: archiveBytes.length,
    rows: 2,
  };
}

test("approves a ZIP_STORED archive whose downloaded bytes match dataset.json exactly", () => {
  const archiveBytes = makeFixtureArchive();
  const revision = revisionFor(archiveBytes);

  const evidence = verifyPublishedDataset(revision, DATASET_JSON, PYTHON);

  assert.deepEqual(evidence, {
    memberPath: "dataset.json",
    memberSize: DATASET_JSON.length,
    expectedMemberSha256: sha256(DATASET_JSON),
    actualMemberSha256: sha256(DATASET_JSON),
    sourceZipSha256: sha256(archiveBytes),
  });
  assert.notEqual(evidence.sourceZipSha256, evidence.expectedMemberSha256);
});

test("rejects downloaded bytes that differ from the approved dataset.json member", () => {
  const archiveBytes = makeFixtureArchive();
  const revision = revisionFor(archiveBytes);
  const substituted = Buffer.from(
    '{"columns":["a","b"],"rows":[[9,9],[8,8]]}\n',
    "utf8",
  );

  assert.equal(substituted.length, DATASET_JSON.length);
  assert.notDeepEqual(substituted, DATASET_JSON);
  assert.throws(
    () => verifyPublishedDataset(revision, substituted, PYTHON),
    /Downloaded bytes do not match approved dataset\.json member bytes/,
  );
});

test("rejects a revision whose hash does not identify the whole ZIP archive", () => {
  const archiveBytes = makeFixtureArchive();
  const revision = revisionFor(archiveBytes);
  revision.sha256 = "0".repeat(64);

  assert.throws(
    () => verifyPublishedDataset(revision, DATASET_JSON, PYTHON),
    (error) =>
      /Approved revision archive SHA-256 mismatch/.test(error.message) &&
      /must identify the whole ZIP archive/.test(error.message),
  );
});
