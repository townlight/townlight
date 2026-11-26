export function transportCode(error) {
  const code = error?.cause?.code ?? error?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'TRANSPORT_ERROR';
}

export async function waitForStaffReady({ staffBaseUrl, fetchImpl = fetch, timeoutMs = 120000, attemptTimeoutMs = 2000, pollMs = 250 }) {
  for (const [n, v] of Object.entries({ timeoutMs, attemptTimeoutMs, pollMs })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`invalid ${n}`);
  }
  let base;
  try { base = new URL(staffBaseUrl); } catch { throw new Error('invalid staffBaseUrl'); }
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('staffBaseUrl must be a pure origin');
  const loopback = base.hostname === '127.0.0.1' || base.hostname === '[::1]';
  if (!(base.protocol === 'https:' || (base.protocol === 'http:' && loopback))) throw new Error('staffBaseUrl must be https or http loopback');

  const url = base.origin + '/ready';
  const start = performance.now();
  const deadline = start + timeoutMs;
  const deadlineErr = () => new Error('waitForStaffReady timed out');
  const sleep = async () => {
    const rem = deadline - performance.now();
    if (rem <= 0) throw deadlineErr();
    await new Promise(r => setTimeout(r, Math.min(pollMs, rem)));
  };

  let attempts = 0;
  for (;;) {
    attempts++;
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw deadlineErr();
    const signal = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(attemptTimeoutMs, remaining))));

    let res;
    try {
      res = await fetchImpl(url, { method: 'GET', redirect: 'error', signal, credentials: 'omit' });
    } catch (e) {
      const c = e && e.cause && e.cause.code;
      if (e?.name === 'TimeoutError' || c === 'ECONNREFUSED' || c === 'UND_ERR_CONNECT_TIMEOUT') { await sleep(); continue; }
      const code = transportCode(e);
      throw new Error(`staff readiness transport rejected (${code})`, {cause: {code}});
    }

    if (res.url !== url) throw new Error('unexpected response url');

    if (res.status === 200) {
      let data;
      try { data = await res.json(); } catch { throw new Error('malformed ready response'); }
      if (data && data.status === 'ready') return { passed: true, attempts, elapsed_ms: performance.now() - start };
      throw new Error('unexpected ready response');
    }

    if (res.status === 503) {
      let data = null;
      try { data = await res.json(); } catch {}
      if (data && data.status === 'not-ready') { await sleep(); continue; }
      throw new Error('service unavailable');
    }

    throw new Error(`unexpected HTTP status ${res.status}`);
  }
}
