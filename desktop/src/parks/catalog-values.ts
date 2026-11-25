type HoursDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAYS: HoursDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface ResourceSnapshot {
  id?: string | number | null;
  revision?: string | number | null;
  name?: string;
  address?: string;
  timezone?: string;
  description?: string;
  amenities?: string[] | string | null;
  accessibility?: string;
  public?: boolean;
  approval_required?: boolean;
  buffer_before_minutes?: number | string | null;
  buffer_after_minutes?: number | string | null;
  fee_cents?: number | string | null;
  deposit_cents?: number | string | null;
  currency?: string;
  hours?: Record<string, Array<[string, string]>>;
}

export interface ProgramSnapshot {
  id?: string | number | null;
  revision?: string | number | null;
  title?: string;
  description?: string;
  timezone?: string;
  public?: boolean;
  min_age?: number | string | null;
  max_age?: number | string | null;
  eligibility_text?: string;
  accessibility?: string;
}

function readControl(
  form: HTMLFormElement,
  name: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const element = form.elements.namedItem(name);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element;
  }
  return null;
}

function readValue(form: HTMLFormElement, name: string): string {
  const element = readControl(form, name);
  return element ? element.value : '';
}

function setValue(form: HTMLFormElement, name: string, value: unknown): void {
  const element = readControl(form, name);
  if (!element) return;
  element.value = value === null || value === undefined ? '' : String(value);
}

function readChecked(form: HTMLFormElement, name: string): boolean {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement ? element.checked : false;
}

function setChecked(form: HTMLFormElement, name: string, value: unknown): void {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLInputElement) {
    element.checked = Boolean(value);
  }
}

function requiredInteger(form: HTMLFormElement, name: string): number {
  const raw = readValue(form, name).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function optionalInteger(form: HTMLFormElement, name: string): number | null {
  const raw = readValue(form, name).trim();
  if (raw === '') return null;

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer when provided.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer when provided.`);
  }

  return value;
}

function readAmenities(form: HTMLFormElement): string[] {
  return readValue(form, 'amenities')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isValidTime(value: string, allowEndOfDay: boolean): boolean {
  if (allowEndOfDay && value === '24:00') return true;
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function hoursForDay(form: HTMLFormElement, day: HoursDay): Array<[string, string]> {
  const container = form.querySelector<HTMLElement>(`[data-hours-day="${day}"]`);
  if (!container) return [];

  const intervals: Array<[string, string]> = [];
  const rows = container.querySelectorAll<HTMLElement>('[data-hour-row]');

  rows.forEach((row) => {
    const startsInput = row.querySelector<HTMLInputElement>('input[name="starts"]');
    const endsInput = row.querySelector<HTMLInputElement>('input[name="ends"]');
    const starts = startsInput ? startsInput.value.trim() : '';
    const ends = endsInput ? endsInput.value.trim() : '';

    if (!isValidTime(starts, false)) {
      throw new Error(`Invalid start time for ${day}. Use HH:MM; 24:00 is only allowed as an end time.`);
    }
    if (!isValidTime(ends, true)) {
      throw new Error(`Invalid end time for ${day}. Use HH:MM, with 24:00 allowed only as an end time.`);
    }

    intervals.push([starts, ends]);
  });

  return intervals;
}

export function resourcePayload(form: HTMLFormElement): Record<string, unknown> {
  const hours: Record<string, Array<[string, string]>> = {};
  for (const day of DAYS) {
    hours[day] = hoursForDay(form, day);
  }

  return {
    name: readValue(form, 'name'),
    address: readValue(form, 'address'),
    timezone: readValue(form, 'timezone'),
    description: readValue(form, 'description'),
    amenities: readAmenities(form),
    accessibility: readValue(form, 'accessibility'),
    public: readChecked(form, 'public'),
    approval_required: readChecked(form, 'approval_required'),
    buffer_before_minutes: requiredInteger(form, 'buffer_before_minutes'),
    buffer_after_minutes: requiredInteger(form, 'buffer_after_minutes'),
    fee_cents: requiredInteger(form, 'fee_cents'),
    deposit_cents: requiredInteger(form, 'deposit_cents'),
    currency: readValue(form, 'currency'),
    hours,
  };
}

export function programPayload(form: HTMLFormElement): Record<string, unknown> {
  return {
    title: readValue(form, 'title'),
    description: readValue(form, 'description'),
    timezone: readValue(form, 'timezone'),
    public: readChecked(form, 'public'),
    min_age: optionalInteger(form, 'min_age'),
    max_age: optionalInteger(form, 'max_age'),
    eligibility_text: readValue(form, 'eligibility_text'),
    accessibility: readValue(form, 'accessibility'),
  };
}

export function fillResource(form: HTMLFormElement, snapshot: ResourceSnapshot): void {
  setValue(form, 'id', snapshot.id);
  setValue(form, 'revision', snapshot.revision);
  setValue(form, 'name', snapshot.name);
  setValue(form, 'address', snapshot.address);
  setValue(form, 'timezone', snapshot.timezone);
  setValue(form, 'description', snapshot.description);
  setValue(
    form,
    'amenities',
    Array.isArray(snapshot.amenities) ? snapshot.amenities.join(', ') : snapshot.amenities,
  );
  setValue(form, 'accessibility', snapshot.accessibility);
  setChecked(form, 'public', snapshot.public);
  setChecked(form, 'approval_required', snapshot.approval_required);
  setValue(form, 'buffer_before_minutes', snapshot.buffer_before_minutes);
  setValue(form, 'buffer_after_minutes', snapshot.buffer_after_minutes);
  setValue(form, 'fee_cents', snapshot.fee_cents);
  setValue(form, 'deposit_cents', snapshot.deposit_cents);
  setValue(form, 'currency', snapshot.currency);

  const containers = form.querySelectorAll<HTMLElement>('[data-hours-day]');
  containers.forEach((container) => {
    container.replaceChildren();
  });

  if (!snapshot.hours) return;

  for (const day of Object.keys(snapshot.hours)) {
    const intervals = snapshot.hours[day];
    if (!Array.isArray(intervals)) continue;

    for (const interval of intervals) {
      addHours(form, day, interval[0], interval[1]);
    }
  }
}

export function fillProgram(form: HTMLFormElement, snapshot: ProgramSnapshot): void {
  setValue(form, 'id', snapshot.id);
  setValue(form, 'revision', snapshot.revision);
  setValue(form, 'title', snapshot.title);
  setValue(form, 'description', snapshot.description);
  setValue(form, 'timezone', snapshot.timezone);
  setChecked(form, 'public', snapshot.public);
  setValue(form, 'min_age', snapshot.min_age ?? '');
  setValue(form, 'max_age', snapshot.max_age ?? '');
  setValue(form, 'eligibility_text', snapshot.eligibility_text);
  setValue(form, 'accessibility', snapshot.accessibility);
}

export function addHours(
  form: HTMLFormElement,
  day: string,
  start = '09:00',
  end = '17:00',
): void {
  const container = form.querySelector<HTMLElement>(`[data-hours-day="${day}"]`);
  if (!container) return;

  const row = document.createElement('div');
  row.setAttribute('data-hour-row', '');

  const startLabel = document.createElement('label');
  startLabel.textContent = 'Starts ';
  const startInput = document.createElement('input');
  startInput.type = 'text';
  startInput.name = 'starts';
  startInput.value = start;
  startInput.placeholder = 'HH:MM';
  startInput.inputMode = 'numeric';
  startInput.autocomplete = 'off';
  startInput.pattern = '(?:[01]\\d|2[0-3]):[0-5]\\d';
  startInput.setAttribute('aria-label', `${day} start time`);
  startLabel.appendChild(startInput);

  const endLabel = document.createElement('label');
  endLabel.textContent = 'Ends ';
  const endInput = document.createElement('input');
  endInput.type = 'text';
  endInput.name = 'ends';
  endInput.value = end;
  endInput.placeholder = 'HH:MM';
  endInput.inputMode = 'numeric';
  endInput.autocomplete = 'off';
  endInput.pattern = '(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)';
  endInput.setAttribute('aria-label', `${day} end time`);
  endLabel.appendChild(endInput);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(startLabel);
  row.appendChild(endLabel);
  row.appendChild(removeButton);
  container.appendChild(row);
}
