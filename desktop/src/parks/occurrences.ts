import { weeklyPairs, validatePair, type Occurrence } from './occurrence-dates.ts';

let occurrenceIdCounter = 0;

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export function bindOccurrences(root: ParentNode): { read(): Occurrence[] } {
  const form = requireElement<HTMLFormElement>(root, '[data-booking-create]');
  const container = requireElement<HTMLElement>(root, '[data-occurrences]');
  const previewButton = requireElement<HTMLButtonElement>(root, '[data-preview-occurrences]');
  const startsInput = requireElement<HTMLInputElement>(form, '[name="starts_at"]');
  const endsInput = requireElement<HTMLInputElement>(form, '[name="ends_at"]');
  const repeatsInput = requireElement<HTMLInputElement>(form, '[name="repeats"]');
  const idPrefix = `occurrence-${++occurrenceIdCounter}`;
  let stale = true;

  function setStale(value: boolean): void {
    stale = value;
    container.setAttribute('data-stale', value ? 'true' : 'false');
    const rows = container.querySelectorAll<HTMLElement>('[data-occurrence-row]');
    for (const row of Array.from(rows)) {
      if (value) row.setAttribute('data-stale', 'true');
      else row.removeAttribute('data-stale');
    }
  }

  function markStale(): void {
    setStale(true);
  }

  function generateOccurrences(): Occurrence[] {
    const count = Number(repeatsInput.value);
    return weeklyPairs(startsInput.value, endsInput.value, count);
  }

  function renderRows(occurrences: Occurrence[]): void {
    container.replaceChildren();
    occurrences.forEach((occurrence, index) => {
      const row = document.createElement('div');
      row.setAttribute('data-occurrence-row', 'true');

      const startId = `${idPrefix}-${index}-start`;
      const endId = `${idPrefix}-${index}-end`;

      const startLabel = document.createElement('label');
      startLabel.htmlFor = startId;
      startLabel.textContent = `Occurrence ${index + 1} starts at`;

      const startInput = document.createElement('input');
      startInput.id = startId;
      startInput.type = 'text';
      startInput.value = occurrence.starts_at;
      startInput.setAttribute('data-occurrence-start', '');

      const endLabel = document.createElement('label');
      endLabel.htmlFor = endId;
      endLabel.textContent = `Occurrence ${index + 1} ends at`;

      const endInput = document.createElement('input');
      endInput.id = endId;
      endInput.type = 'text';
      endInput.value = occurrence.ends_at;
      endInput.setAttribute('data-occurrence-end', '');

      row.append(startLabel, startInput, endLabel, endInput);
      container.append(row);
    });
    setStale(false);
  }

  function showError(error: unknown): void {
    setStale(true);
    const message = error instanceof Error ? error.message : String(error);
    container.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.setAttribute('role', 'alert');
    paragraph.textContent = message;
    container.append(paragraph);
  }

  function regenerate(): void {
    const occurrences = generateOccurrences();
    renderRows(occurrences);
  }

  markStale();

  for (const input of [startsInput, endsInput, repeatsInput]) {
    input.addEventListener('input', markStale);
    input.addEventListener('change', markStale);
  }

  previewButton.addEventListener('click', (event) => {
    event.preventDefault();
    try {
      regenerate();
    } catch (error) {
      showError(error);
    }
  });

  return {
    read(): Occurrence[] {
      if (stale) {
        regenerate();
      }
      const rows = container.querySelectorAll<HTMLElement>('[data-occurrence-row]');
      return Array.from(rows).map((row) => {
        const start = row.querySelector<HTMLInputElement>('[data-occurrence-start]');
        const end = row.querySelector<HTMLInputElement>('[data-occurrence-end]');
        if (!start || !end) {
          throw new Error('Occurrence row is missing a start or end input');
        }
        return validatePair(start.value, end.value);
      });
    },
  };
}
