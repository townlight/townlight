import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { communityReadback } from './community-workflows.mjs';
import { recoveryEvidence } from './community-recovery.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(name.toLowerCase());
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function methodOf(input, init) {
  return String(init.method || (input && input.method) || 'GET').toUpperCase();
}

function pathOf(input) {
  const raw = typeof input === 'string'
    ? input
    : input && typeof input.url === 'string'
      ? input.url
      : String(input);
  return new URL(raw, 'http://localhost').pathname.replace(/\/+$/, '');
}

async function bodyText(input, init) {
  if (init.body !== undefined) {
    return typeof init.body === 'string' ? init.body : String(init.body);
  }
  if (input && typeof input.clone === 'function') return input.clone().text();
  return '';
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function binaryResponse(bytes) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length)
    }
  });
}

test('communityReadback uses the real records downloader and rejects corrupt archive bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'townlight-community-recovery-'));
  const originalFetch = globalThis.fetch;

  const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const archiveBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x02, 0x03, 0x04]);
  const corruptArchiveBytes = Buffer.from(archiveBytes);
  corruptArchiveBytes[0] ^= 0xff;

  const photoSha = sha256(photoBytes);
  const archiveSha = sha256(archiveBytes);
  const correctionSha = sha256(Buffer.from('community-correction-v1'));

  const photoPath = join(dir, 'photo.jpg');
  await writeFile(photoPath, photoBytes);

  const ids = {
    serviceRequest: 'sr-100',
    residentRequest: 'rr-200',
    communication: 'comm-300',
    parksResource: 'resource-400',
    parksBooking: 'booking-500',
    parksObligation: 'obligation-600',
    parksResidentBooking: 'resident-booking-700',
    parksResidentRegistration: 'registration-800',
    parksSession: 'session-900',
    parksMaintenanceRequest: 'maintenance-1000'
  };

  const photoAttachmentId = 'photo-attachment';
  const archiveAttachmentId = 'archive-attachment';
  const staffRequestId = 'staff-records-request';
  const deliveryRequestId = 'delivery-records-request';
  const parksRequestId = 'parks-records-request';

  const paidCents = 1200;
  const refundedCents = 500;
  const balanceCents = 700;

  const expected = recoveryEvidence({
    resident: {
      evidence: {
        photo: {
          attachmentId: photoAttachmentId,
          sha256: photoSha,
          sizeBytes: photoBytes.length
        }
      }
    },
    staff: {
      ids: {
        records_request: staffRequestId,
        records_attachment: archiveAttachmentId
      },
      milestones: {
        records_result_sha256: archiveSha
      }
    },
    delivery: {
      records: {
        requestId: deliveryRequestId,
        attachmentId: archiveAttachmentId,
        sha256: archiveSha,
        sizeBytes: archiveBytes.length
      },
      correction: {
        sha256: correctionSha
      }
    },
    enrollment: {
      registrations: {
        promoted: ids.parksResidentRegistration
      }
    },
    finance: {
      ids: {
        records_request: parksRequestId,
        records_attachment: archiveAttachmentId
      },
      archive: {
        sha256: archiveSha,
        size_bytes: archiveBytes.length
      },
      finance: {
        balance_after: balanceCents,
        refunded_after: refundedCents
      }
    }
  });

  let authPosts = 0;
  let contentGets = 0;
  let deleteSessions = 0;
  let corruptArchive = false;

  const sessionToken = randomUUID();
  const testProof = 'test-proof-no-credentials';

  const native = async (command, params = {}) => {
    const request = params.request ?? params;
    const operation = request.operation ?? request.op;

    if (
      /auth|proof/i.test(command) ||
      /session_request$/i.test(command) ||
      /proof/i.test(String(operation || ''))
    ) {
      return { result: { proof: testProof, token: testProof } };
    }

    switch (command) {
      case 'service_requests_request':
        if (operation === 'download-attachment') {
          return { result: { path: photoPath } };
        }
        if (operation === 'request') {
          return {
            result: {
              id: request.request_id ?? request.id ?? ids.serviceRequest,
              state: 'completed',
              revision: 1
            }
          };
        }
        break;

      case 'communications_request':
        if (operation === 'article') {
          return {
            result: {
              id: request.article_id ?? request.id ?? ids.communication,
              state: 'published',
              current_revision: 1,
              revision: { sha256: correctionSha }
            }
          };
        }
        break;

      case 'parks_request':
        switch (operation) {
          case 'bookings-get':
            return {
              result: {
                id: request.booking_id ?? request.id ?? ids.parksBooking,
                state: 'confirmed',
                revision: 1
              }
            };
          case 'registrations-get':
            return {
              result: {
                id: request.registration_id ?? request.id ?? ids.parksResidentRegistration,
                state: 'confirmed',
                revision: 1
              }
            };
          case 'obligation-get':
            return {
              result: {
                id: request.obligation_id ?? request.id ?? ids.parksObligation,
                paid_cents: paidCents,
                refunded_cents: refundedCents,
                balance_cents: balanceCents
              }
            };
          case 'catalog-get':
            return {
              result: {
                id: request.resource_id ?? request.id ?? ids.parksResource,
                revision: 1
              }
            };
          case 'sessions-get':
            return {
              result: {
                id: request.session_id ?? request.id ?? ids.parksSession,
                capacity: 1,
                revision: 1
              }
            };
          case 'sessions-roster':
            return {
              result: [
                {
                  registration_id: ids.parksResidentRegistration,
                  state: 'confirmed',
                  revision: 1,
                  checked_in_at: '2025-01-01T00:00:00.000Z'
                }
              ]
            };
          default:
            break;
        }
        break;

      case 'records_domain_request':
        if (operation === 'view') {
          return {
            result: {
              documents: [
                {
                  attachment_id: archiveAttachmentId,
                  sha256: archiveSha,
                  size_bytes: archiveBytes.length
                }
              ]
            }
          };
        }
        break;

      default:
        break;
    }

    throw new Error(`unexpected native call ${command}.${String(operation)}`);
  };

  try {
    globalThis.fetch = async (input, init = {}) => {
      const method = methodOf(input, init);
      const path = pathOf(input);

      if (method === 'POST' && path === '/staff/v1/session') {
        const parsed = JSON.parse(await bodyText(input, init));
        assert.equal(typeof parsed?.email, 'string');
        assert.ok(parsed.email.length > 0);
        assert.equal(typeof parsed?.passcode, 'string');
        assert.ok(parsed.passcode.length > 0);
        authPosts += 1;
        return jsonResponse({ proof: sessionToken });
      }

      if (method === 'GET' && path.startsWith('/staff/v1/api/') && path.endsWith('/content')) {
        const session = headerValue(init.headers ?? (input && input.headers), 'X-Townlight-Session');
        assert.equal(session, sessionToken, 'unexpected session header');
        contentGets += 1;
        return binaryResponse(corruptArchive ? corruptArchiveBytes : archiveBytes);
      }

      if (method === 'DELETE' && path === '/staff/v1/session') {
        const session = headerValue(init.headers ?? (input && input.headers), 'X-Townlight-Session');
        assert.equal(session, sessionToken, 'unexpected session header');
        deleteSessions += 1;
        return new Response(null, { status: 200 });
      }

      throw new Error(`unexpected fetch ${method} ${path}`);
    };

    const authBefore = authPosts;
    const contentBefore = contentGets;
    const deletesBefore = deleteSessions;

    const result = await communityReadback({ native, ids, expected });

    assert.ok(result && typeof result === 'object');
    assert.ok(authPosts > authBefore, 'real downloader did not authenticate');
    assert.ok(contentGets >= contentBefore + 3, 'real downloader did not fetch archive content');
    assert.ok(deleteSessions > deletesBefore, 'real downloader did not delete session');

    corruptArchive = true;
    const contentBeforeCorrupt = contentGets;

    await assert.rejects(
      communityReadback({ native, ids, expected }),
      /records download sha256/
    );

    assert.ok(contentGets > contentBeforeCorrupt, 'corrupt archive was not downloaded');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});
