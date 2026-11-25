type SourceRef = {
  kind?: string;
  id?: string;
  dataset?: { kind?: string; id?: string };
};

type Revision = {
  title?: string;
  body?: string;
  language?: string;
  kind?: string;
  access_review?: { reviewed?: boolean };
  translation_provenance?: {
    source_language?: string;
    method?: string;
    reviewer?: string;
    source_text?: string;
  } | null;
};

type Article = {
  kind?: string;
  revision?: Revision;
};

const KINDS = ["meeting_summary", "ordinance_explainer", "announcement", "faq", "newsletter"];

export function createEditor(root: ParentNode) {
  const form = root.querySelector<HTMLFormElement>("form[data-draft]");
  if (!form) throw new Error("Draft form not found");

  const field = <T extends HTMLElement>(name: string) => {
    const element = form.elements.namedItem(name) as T | null;
    if (!element) throw new Error(`Missing field: ${name}`);
    return element;
  };

  const title = field<HTMLInputElement>("title");
  const body = field<HTMLTextAreaElement>("body");
  const kind = field<HTMLSelectElement>("kind");
  const language = field<HTMLInputElement>("language");
  const reviewed = field<HTMLInputElement>("access_reviewed");
  const sourceLanguage = field<HTMLInputElement>("translation_source_language");
  const method = field<HTMLInputElement>("translation_method");
  const reviewer = field<HTMLInputElement>("translation_reviewer");
  const sourceText = field<HTMLTextAreaElement>("translation_original_text");

  const onEdit = (event: Event) => {
    if (event.target !== reviewed) reviewed.checked = false;
  };
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);

  function payload(sources: ArrayLike<SourceRef> = []) {
    const titleValue = title.value.trim();
    const bodyValue = body.value.trim();
    const languageValue = language.value.trim();
    if (!titleValue) throw new Error("Title is required");
    if (!bodyValue) throw new Error("Body is required");
    if (!KINDS.includes(kind.value)) throw new Error("Invalid article kind");
    if (languageValue.length < 1 || languageValue.length > 16) {
      throw new Error("Language must be 1-16 characters");
    }
    const values = [sourceLanguage.value, method.value, reviewer.value, sourceText.value]
      .map((value) => value.trim());
    const hasTranslation = values.some(Boolean);
    if (hasTranslation && values.some((value) => !value)) {
      throw new Error("Translation provenance requires all fields");
    }

    return {
      title: titleValue,
      body: bodyValue,
      kind: kind.value,
      language: languageValue,
      access_reviewed: reviewed.checked,
      sources: Array.from(sources ?? [], (source) => ({
        kind: source.dataset?.kind ?? source.kind,
        id: source.dataset?.id ?? source.id,
      })),
      translation_provenance: hasTranslation
        ? {
            source_language: values[0],
            method: values[1],
            reviewer: values[2],
            source_text: values[3],
            target_language: languageValue,
          }
        : null,
    };
  }

  function fill(article: Article) {
    const revision = article.revision ?? {};
    const provenance = revision.translation_provenance;
    title.value = revision.title ?? "";
    body.value = revision.body ?? "";
    kind.value = article.kind ?? revision.kind ?? "";
    language.value = revision.language ?? "en";
    reviewed.checked = revision.access_review?.reviewed === true;
    sourceLanguage.value = provenance?.source_language ?? "";
    method.value = provenance?.method ?? "";
    reviewer.value = provenance?.reviewer ?? "";
    sourceText.value = provenance?.source_text ?? "";
  }

  function reset() {
    form.reset();
    kind.value = "announcement";
    language.value = "en";
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
    });
  }

  return { payload, fill, reset };
}
