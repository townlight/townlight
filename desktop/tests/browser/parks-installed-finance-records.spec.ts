import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installedParksFinanceRecords } from '../installed/parks-finance-records.mjs';

const bytes = Buffer.from('controlled park booking archive');
const hash = createHash('sha256').update(bytes).digest('hex');
const booking = { id: 'booking-1', resource_id: 'resource-1', obligation_id: 'obligation-1', revision: 1, state: 'confirmed', starts_at: '2027-01-01T09:00:00Z', ends_at: '2027-01-01T10:00:00Z' };
const resource = { id: 'resource-1', revision: 1, snapshot: { title: 'Shelter', timezone: 'UTC' } };
const A = 5000;
const base = { currency: 'USD', entity: { entity_kind: 'booking', entity_id: booking.id, amount_cents: A, deposit_cents: 0 }, ledger: [] as any[], totals: { paid_cents: 0, refunded_cents: 0, net_paid_cents: 0, balance_cents: A, deposit_cents: 0 } };

function recompute(ledger: any[]) {
  const paid = ledger.filter(e => e.operation === 'payment').reduce((s, e) => s + e.amount_cents, 0);
  const ref = ledger.filter(e => e.operation === 'refund').reduce((s, e) => s + e.amount_cents, 0);
  return { paid_cents: paid, refunded_cents: ref, net_paid_cents: paid - ref, balance_cents: A - (paid - ref), deposit_cents: 0 };
}

function findField(o: any, field: string, depth = 0): any {
  if (!o || typeof o !== 'object' || depth > 6) return undefined;
  if (field in o && o[field] != null) return o[field];
  for (const v of Object.values(o)) { const r = findField(v, field, depth + 1); if (r != null) return r; }
  return undefined;
}

for (const mode of ['valid', 'tampered-bytes'] as const) {
  test(`finance records helper ${mode}`, async ({ page }) => {
    test.setTimeout(20000);
    const state: any = { archiveWrites: 0, ledger: [], keys: new Map(), dup: 0, saved: undefined };
    const clone = (v: any) => JSON.parse(JSON.stringify(v));
    const native = async (cmd: string, extra: any) => {
      await new Promise(r => setTimeout(r, 10));
      if (cmd === 'records_domain_request') {
        if (extra?.request?.operation !== 'view') throw new Error(`Unexpected records op: ${extra?.request?.operation}`);
        return clone({ documents: [{ attachment_id: 'attachment-1', sha256: hash, size_bytes: bytes.length }] });
      }
      if (cmd !== 'parks_request') throw new Error(`Unexpected cmd: ${cmd}`);
      const req = extra?.request ?? {}; const op = req.operation;
      if (op === 'catalog-list') return clone(req.kind === 'resource' ? [resource] : []);
      if (op === 'bookings-list') return clone([booking]);
      if (op === 'bookings-get') return clone(booking);
      if (op === 'obligation-receipt') return clone({ ...base, ledger: state.ledger, totals: recompute(state.ledger) });
      if (op === 'offline-payment' || op === 'offline-refund') {
        const k = req.payload.idempotency_key;
        if (state.keys.has(k)) { state.dup++; return clone(state.keys.get(k)); }
        state.ledger.push({ id: `ledger-${state.ledger.length + 1}`, operation: op === 'offline-payment' ? 'payment' : 'refund', reference: req.payload.reference, amount_cents: req.payload.amount_cents });
        state.keys.set(k, {}); return {};
      }
      if (op === 'reconciliation') return clone([{ obligation_id: booking.obligation_id, ...recompute(state.ledger) }]);
      if (op === 'archive-preview') return clone({ kind: 'booking', entity_id: booking.id, name: 'Booking archive', current_revision: 1, sha256: hash, size: bytes.length });
      if (op === 'archive-records') {
        expect(req.payload.confirm).toBe(true); expect(req.payload.expected_revision).toBe(1); expect(req.payload.expected_sha256).toBe(hash);
        state.archiveWrites++;
        return clone({ records_request_id: 'records-1', attachment_id: 'attachment-1', sha256: hash });
      }
      throw new Error(`Unexpected parks_request op: ${op}`);
    };
    await page.exposeFunction('parksNative', async (op: string, extra: any) => native('parks_request', { request: { operation: op, ...extra } }));
    await page.route('**/parks-fixture', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await page.goto('/parks-fixture');
    await page.evaluate(async () => {
      const [rr, r, fr, f, as, rh] = await Promise.all([
        import('/src/parks/reservations-render.ts'), import('/src/parks/reservations.ts'),
        import('/src/parks/finance-render.ts'), import('/src/parks/finance.ts'),
        import('/src/parks/archive-selection.ts'), import('/src/parks/records-handoff.ts'),
      ]);
      document.body.innerHTML = `<main data-parks-view>${rr.renderReservations()}${fr.renderFinance()}${as.renderArchiveSelection()}${rh.renderRecordsHandoff()}</main>`;
      const ctx: any = {};
      ctx.call = (op: string, extra: any) => (window as any).parksNative(op, extra);
      ctx.run = async (_l: string, t: () => Promise<any>) => t();
      ctx.status = () => {};
      const root = document.querySelector('main[data-parks-view]') as HTMLElement;
      f.bindFinance(root, ctx); rh.bindRecordsHandoff(root, ctx); as.bindArchiveSelection(root, ctx);
      await r.bindReservations(root, ctx).refresh();
    });
    const helper = installedParksFinanceRecords({
      page, native,
      save: async (key: string, value: any) => { state.saved = { key, value }; },
      bookingId: booking.id, obligationId: booking.obligation_id,
      downloadRecordsAttachment: async (args: any) => {
        expect(args).toEqual({ requestId: 'records-1', attachmentId: 'attachment-1', expectedSha256: hash, expectedSize: bytes.length });
        return mode === 'valid' ? bytes : Buffer.from(bytes.map(v => v ^ 1));
      },
    });
    if (mode === 'valid') {
      const result: any = await helper;
      expect(result?.passed).toBe(true);
      expect(state.saved.value).toEqual(result);
      expect(findField(result, 'sha256')).toBe(hash);
      expect(findField(result, 'size') ?? findField(result, 'size_bytes')).toBe(bytes.length);
      expect(state.archiveWrites).toBe(1);
      expect(state.ledger.length).toBe(2);
      const totals = recompute(state.ledger);
      expect(totals.paid_cents).toBe(1000);
      expect(totals.refunded_cents).toBe(500);
      expect(totals.balance_cents).toBe(4500);
      expect(state.dup).toBe(1);
    } else {
      await expect(helper).rejects.toThrow(/downloaded bytes hash/);
      expect(state.saved).toBeUndefined();
      expect(state.archiveWrites).toBe(1);
    }
  });
}
