export type Invoke = <T>(command: string, args: { request: object }) => Promise<T>;

export interface CodeProposal {
  id: string;
  version_id: string;
  meeting_id: string;
  title: string;
  ordinance_number: string;
  proposed_text: string;
  supersedes_id?: string | null;
  reconciliation_note?: string | null;
}
export interface CodeDecision {
  id: string;
  outcome: 'adopted' | 'not_adopted' | 'deferred' | 'withdrawn';
  decided_at?: string | null;
  decision_text: string;
  supporting_references: string[];
  supersedes_decision_id?: string | null;
  reconciliation_note?: string | null;
}
export interface CodeCloseout {
  decision_id: string;
  version_id: string;
  source_id: string;
  version_label: string;
  body: string;
  effective_start: string;
  effective_end?: string | null;
  is_current: boolean;
  reconciliation_note?: string | null;
}
export interface ConnectionView {
  id: string;
  proposal: Record<string, unknown>;
  delivery_status: string;
  decisions: Array<Record<string, unknown>>;
  closeout: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ImportSource {
  source_id?: string;
  name: string;
  publisher: string;
  source_type: string;
  source_category: string;
  is_official?: boolean;
  status?: string;
  source_url?: string;
  file_reference?: string;
  retrieval_method?: string;
  staff_notes?: string;
}

export interface ImportTitle {
  title_id: string;
  title_number: string;
  title_name: string;
}

export interface ImportChapter {
  chapter_id: string;
  title_id: string;
  chapter_number: string;
  chapter_name: string;
}

export interface ImportSection {
  section_id: string;
  chapter_id: string;
  section_number: string;
  section_heading: string;
}

export interface ImportVersion {
  version_id: string;
  section_id: string;
  source_id: string;
  version_label: string;
  body: string;
  effective_start: string;
  effective_end?: string | null;
  status: string;
  is_current: boolean;
}

export interface ImportBundle {
  connector_type: "csv_bundle" | "official_html_extract";
  source: ImportSource;
  titles: ImportTitle[];
  chapters: ImportChapter[];
  sections: ImportSection[];
  versions: ImportVersion[];
  job_id?: string;
  provenance?: Record<string, unknown>;
}

export interface ImportResult {
  job_id: string;
  status: string;
  counts: Record<string, number>;
  failure?: { message: string; fix: string } | null;
}

export interface Section {
  section_id: string;
  section_number: string;
  section_heading: string;
}

export interface Version {
  version_id: string;
  version_label: string;
  body: string;
  effective_start: string;
  effective_end?: string | null;
  status: string;
  is_current: boolean;
}

export interface Lookup {
  section: Section;
  version: Version;
}

export type CitationResult =
  | { status: "ok"; citation: Record<string, unknown> }
  | { status: "refused"; reason: string; fix: string };

export function createCodeClient(invoke: Invoke) {
  const request = <T>(payload: object) =>
    invoke<T>("code_domain_request", { request: payload });

  return {
    connections: () => request<ConnectionView[]>({ operation: 'connections' }),
    connection: (id: string) => request<ConnectionView>({ operation: 'connection', id }),
    sendProposal: (payload: CodeProposal) => request<ConnectionView>({ operation: 'send-proposal', payload }),
    closeConnection: (id: string, payload: CodeCloseout) => request<ConnectionView>({ operation: 'close-connection', id, payload }),
    exportSection(sectionRef: string, asOf?: string): Promise<Record<string, unknown>> {
      return request<Record<string, unknown>>({
        operation: "export", section_ref: sectionRef, as_of: asOf ?? null,
      });
    },
    question(question: string, sectionNumber?: string, asOf?: string): Promise<QuestionResult> {
      return request<QuestionResult>({
        operation: "question", question, section_number: sectionNumber ?? null, as_of: asOf ?? null,
      });
    },
    importTree(id: string): Promise<Record<string, unknown>> {
      return request<Record<string, unknown>>({ operation: "import-tree", id });
    },
    importProvenance(id: string): Promise<Record<string, unknown>> {
      return request<Record<string, unknown>>({ operation: "import-provenance", id });
    },
    workspace(): Promise<Record<string, unknown>> {
      return request({ operation: "workspace" });
    },

    sources(): Promise<Record<string, unknown>> {
      return request({ operation: "sources" });
    },

    importBundle(bundle: ImportBundle): Promise<ImportResult> {
      return request({ operation: "import", payload: bundle });
    },

    lookup(sectionNumber: string, asOf?: string): Promise<Lookup> {
      return request({
        operation: "lookup",
        section_number: sectionNumber,
        as_of: asOf ?? null,
      });
    },

    citation(sectionNumber: string, asOf?: string): Promise<CitationResult> {
      return request({
        operation: "citation",
        section_number: sectionNumber,
        as_of: asOf ?? null,
      });
    },

    history(id: string): Promise<{ section: Section; versions: Version[] }> {
      return request<{ section: Section; versions: Version[] }>({ operation: "history", id });
    },

    search(query: string): Promise<Record<string, unknown>> {
      return request({ operation: "search", query });
    },
  };
}

interface QuestionResult {
  status: string;
  answer?: string;
  citations?: Array<Record<string, unknown>>;
  citation?: null;
  reason?: string;
  fix?: string;
  [key: string]: unknown;
}
