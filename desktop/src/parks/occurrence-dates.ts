export type Occurrence = { starts_at: string; ends_at: string };

export function validatePair(start: string, end: string): Occurrence {
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
  const utcMs: number[] = [];
  for (const value of [start, end]) {
    const m = iso.exec(value);
    if (!m) throw new Error('Timestamp must be ISO with Z or numeric HH:mm offset');
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    const ms = m[7] ? Number((m[7] + '00').slice(0, 3)) : 0;
    const offset = m[8];
    let offsetMinutes = 0;
    if (offset !== 'Z') {
      const oh = Number(offset.slice(1, 3));
      const om = Number(offset.slice(4, 6));
      if (oh > 23 || om > 59) throw new Error('Invalid offset');
      offsetMinutes = (offset[0] === '+' ? 1 : -1) * (oh * 60 + om);
    }
    if (sec > 59) throw new Error('Invalid timestamp');
    const localMs = Date.UTC(y, mo - 1, d, h, min, sec, ms);
    const check = new Date(localMs);
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== mo - 1 ||
      check.getUTCDate() !== d ||
      check.getUTCHours() !== h ||
      check.getUTCMinutes() !== min ||
      check.getUTCSeconds() !== sec ||
      check.getUTCMilliseconds() !== ms
    ) throw new Error('Invalid timestamp');
    utcMs.push(localMs - offsetMinutes * 60000);
  }
  if (!(utcMs[1] > utcMs[0])) throw new Error('end must be after start');
  return { starts_at: start, ends_at: end };
}

export function weeklyPairs(start: string, end: string, count: number): Occurrence[] {
  if (!Number.isInteger(count) || count < 1 || count > 52) throw new Error('count must be an integer from 1 to 52');
  validatePair(start, end);
  const startOffset = start.endsWith('Z') ? 'Z' : start.slice(-6);
  const endOffset = end.endsWith('Z') ? 'Z' : end.slice(-6);
  const startOffsetMinutes = startOffset === 'Z' ? 0 : (startOffset[0] === '+' ? 1 : -1) * (Number(startOffset.slice(1, 3)) * 60 + Number(startOffset.slice(4, 6)));
  const endOffsetMinutes = endOffset === 'Z' ? 0 : (endOffset[0] === '+' ? 1 : -1) * (Number(endOffset.slice(1, 3)) * 60 + Number(endOffset.slice(4, 6)));
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const occurrences: Occurrence[] = [];
  for (let i = 0; i < count; i++) {
    const s = new Date(startMs + i * weekMs + startOffsetMinutes * 60000);
    const e = new Date(endMs + i * weekMs + endOffsetMinutes * 60000);
    const startsAt = `${String(s.getUTCFullYear()).padStart(4, '0')}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}T${String(s.getUTCHours()).padStart(2, '0')}:${String(s.getUTCMinutes()).padStart(2, '0')}:${String(s.getUTCSeconds()).padStart(2, '0')}.${String(s.getUTCMilliseconds()).padStart(3, '0')}${startOffset}`;
    const endsAt = `${String(e.getUTCFullYear()).padStart(4, '0')}-${String(e.getUTCMonth() + 1).padStart(2, '0')}-${String(e.getUTCDate()).padStart(2, '0')}T${String(e.getUTCHours()).padStart(2, '0')}:${String(e.getUTCMinutes()).padStart(2, '0')}:${String(e.getUTCSeconds()).padStart(2, '0')}.${String(e.getUTCMilliseconds()).padStart(3, '0')}${endOffset}`;
    occurrences.push({ starts_at: startsAt, ends_at: endsAt });
  }
  return occurrences;
}
