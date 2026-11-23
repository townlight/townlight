import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareBudget } from './budget-prepare.mjs';

const sha = (value, label) => {
  assert.match(String(value), /^[0-9a-f]{64}$/, `${label} must be 64 lowercase hex characters`);
  return value;
};

async function prepareHearing({ native, attachment }) {
  const call = (operation, payload = {}, id) => {
    const request = { operation };
    if (id !== undefined) request.id = id;
    if (Object.keys(payload).length) request.payload = payload;
    return native('meetings_domain_request', { request });
  };
  const meeting = await call('create-meeting', {
    title: 'Public Budget Hearing', scheduled_start: '2026-06-15T18:00:00-07:00',
    location: 'Council Chamber', meeting_type: 'regular',
  });
  const agenda = await call('create-agenda-item', {
    title: 'Public Budget Hearing', department_name: 'Finance',
  });
  await call('assign-agenda-meeting', { meeting_id: meeting.id }, agenda.id);
  const tempDir = await mkdtemp(join(tmpdir(), 'hearing-'));
  const absoluteFilePath = join(tempDir, attachment.file_name);
  try {
    await writeFile(absoluteFilePath, attachment.text, 'utf8');
    const packet = await call('capture-packet', {
      agenda_item_ids: [agenda.id], public_agenda_ids: [agenda.id],
      council_sources: [{ path: absoluteFilePath, packet_access: 'public_candidate' }],
    }, meeting.id);
    assert.ok(packet.packet_id, 'capture-packet must return packet_id');
    const preview = await call('preview-council-packet', {
      audience: 'public', agenda_item_ids: [agenda.id], source_indexes: [0],
    }, packet.packet_id);
    await call('save-council-files', {
      artifact_id: preview.preview_id, manifest_sha256: preview.manifest_sha256, approved: false,
    }, packet.packet_id);
    await call('approve-council-packet', {
      preview_id: preview.preview_id, manifest_sha256: preview.manifest_sha256, public_confirmed: true,
    }, packet.packet_id);
    const motion = await call('capture-motion', {
      text: 'Motion to adopt the exact budget', seconded_by: 'Councilmember Smith', agenda_item_id: agenda.id,
    }, meeting.id);
    assert.ok(motion.id, 'recorded motion required');
    const vote = await call('capture-vote', {
      voter_name: 'Councilmember Jones', vote: 'yes',
    }, motion.id);
    assert.ok(vote.id, 'recorded vote required');
    const proceedings = await call('get-proceedings', {}, meeting.id);
    const approval = proceedings.packets.find(p => p.id === packet.packet_id)
      .delivery_history.find(a => a.kind === 'council-packet-approval');
    assert.ok(approval, 'Persisted approval required'); assert.equal(approval.audience, 'public', 'Persisted approval is not public');
    assert.equal(approval.preview_sha256, preview.manifest_sha256, 'approval preview SHA mismatch');
    assert.notEqual(approval.manifest_sha256, approval.preview_sha256, 'approval manifest SHA must differ from preview SHA');
    return { meeting, agenda, approval, packet, motion, vote };
  } finally {
    await unlink(absoluteFilePath).catch(() => {});
    await rmdir(tempDir).catch(() => {});
  }
}

async function finishBudget({ native, publicOrigin, revision, meeting, agenda, approval, packet, motion, vote }) {
  const call = (operation, args = {}) => native('municipal_staff_request', { request: { operation, ...args } });
  const publicSummary = 'Public Works Salaries; proposed totals 2345.67 and 890.12';
  assert.ok(revision?.id, 'revision.id required');
  const contentSha = sha(revision.content_sha256, 'revision.content_sha256');
  const manifestSha = sha(approval.manifest_sha256, 'approval.manifest_sha256');
  const adoptionFields = {
    content_sha256: contentSha, packet_manifest_sha256: manifestSha,
    meeting_id: meeting.id, agenda_id: agenda.id, packet_id: packet.packet_id,
    packet_approval_id: approval.approval_id, motion_id: motion.id,
    carried: true, public_summary: publicSummary,
  };
  for (const key of ['meeting_id', 'agenda_id', 'packet_id', 'packet_approval_id', 'motion_id'])
    assert.ok(adoptionFields[key], `${key} required`);
  assert.ok(vote.id, 'recorded vote required');
  const wrongSha = contentSha === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
  await assert.rejects(
    () => call('adopt-budget', { id: revision.id, payload: { ...adoptionFields, content_sha256: wrongSha } }),
    /.*/, 'adopt-budget accepted wrong content_sha256',
  );
  const adopted = await call('adopt-budget', { id: revision.id, payload: adoptionFields });
  assert.ok(adopted && adopted.adopted_at && adopted.adopted_by, 'adopt-budget must return a direct adopted row');
  assert.equal(String(adopted.id), String(revision.id), 'adopted id mismatch');
  for (const [actual, expected, label] of [
    [adopted.hearing_meeting_id, meeting.id, 'hearing_meeting_id'],
    [adopted.hearing_agenda_id, agenda.id, 'hearing_agenda_id'],
    [adopted.packet_id, packet.packet_id, 'packet_id'],
    [adopted.packet_approval_id, approval.approval_id, 'packet_approval_id'],
    [adopted.recorded_motion_id, motion.id, 'recorded_motion_id'],
  ]) assert.equal(String(actual), String(expected), `${label} mismatch`);
  assert.equal(adopted.packet_manifest_sha256, manifestSha, 'packet_manifest_sha256 mismatch');
  assert.deepEqual(adopted.recorded_vote_ids.map(String), [String(vote.id)], 'recorded_vote_ids mismatch');
  assert.equal(adopted.reviewed_public_summary, publicSummary, 'reviewed_public_summary mismatch');
  const receipt = await call('publish-budget', {
    id: revision.id, payload: { content_sha256: contentSha, confirm: true },
  });
  assert.ok(receipt.meeting_id, 'publish receipt meeting_id required');
  assert.ok(receipt.sequence, 'publish receipt sequence required');
  const deadline = Date.now() + 60_000;
  const datasetUrl = new URL(`/datasets/${receipt.meeting_id}/dataset.csv`, publicOrigin);
  const summaryUrl = new URL(`/datasets/${receipt.meeting_id}/summary.txt`, publicOrigin);
  const fetchWithTimeout = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  let datasetResponse;
  let summaryResponse;
  while (true) {
    [datasetResponse, summaryResponse] = await Promise.all([
      fetchWithTimeout(datasetUrl),
      fetchWithTimeout(summaryUrl),
    ]);
    if (datasetResponse.status === 200 && summaryResponse.status === 200) break;
    if (datasetResponse.status !== 404 && datasetResponse.status !== 200) {
      throw new Error(`dataset.csv fetch failed with status ${datasetResponse.status}`);
    }
    if (summaryResponse.status !== 404 && summaryResponse.status !== 200) {
      throw new Error(`summary.txt fetch failed with status ${summaryResponse.status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Budget publication fetch timed out: dataset.csv=${datasetResponse.status}, summary.txt=${summaryResponse.status}`);
    }
    await delay(500);
  }
  const csv = await datasetResponse.text();
  const summary = await summaryResponse.text();
  assert.ok(csv.includes('Salaries'), 'dataset.csv missing Salaries');
  assert.ok(csv.includes('Public Works'), 'dataset.csv missing Public Works');
  assert.ok(csv.includes('2345.67') || csv.includes('234567'), 'dataset.csv missing amount');
  assert.ok(summary.includes(publicSummary), 'summary.txt missing publicSummary');
  return { passed: true, meeting_id: receipt.meeting_id, sequence: receipt.sequence };
}

export async function installedBudget({ native, publicOrigin }) {
  const { revision, attachment } = await prepareBudget({ native, publicOrigin });
  const hearing = await prepareHearing({ native, attachment });
  return finishBudget({ native, publicOrigin, revision, ...hearing });
}
