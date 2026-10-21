export type Invoke = <T>(command: string, args: { request: object }) => Promise<T>;
export interface Citation {
  section_number?: string; section_id?: string; version_id?: string; source_id?: string;
  effective_start?: string; effective_end?: string; body_text?: string; canonical_url?: string;
}
export interface Parcel {
  parcel_id?: string; address?: string; jurisdiction?: string;
  zone?: {code: string; name?: string};
  source?: {source_date: string; version: string; content_sha256: string};
}
export interface ZoningResult {
  status?: string; reason?: string; answer?: string; disclaimer?: string;
  citations?: Citation[]; parcel?: Parcel; id?: string;
}
export interface Workspace {
  questions?: ZoningResult[]; queue?: ZoningResult[]; reviews?: ZoningResult[];
  analytics?: Record<string, unknown>;
}
export interface LookupPayload { jurisdiction: string; query: string; }
export interface QuestionPayload {
  jurisdiction: string; query: string; question: string; kind: "use" | "dimension"; key: string;
}
export interface RegisterRulePayload {
  jurisdiction: string; zone_code: string; kind: "use" | "dimension"; key: string;
  value: string; section_number: string; overlay_code?: string | null;
}
export interface ReviewPayload {
  answer: string; notes?: string; queue_status: "open" | "in_review" | "resolved" | "closed";
}
export interface OutlinePayload { title: string; question_ids: string[]; }
export interface CodeContextPayload { section_number: string; as_of?: string | null; }

export function createZoningClient(invoke: Invoke, publicMode = false) {
  const command = publicMode ? "zoning_public_request" : "zoning_domain_request";
  const requireStaff = (method: string): void => {
    if (publicMode) throw new Error(`${method} is not available in public mode`);
  };
  return {
    async lookup(payload: LookupPayload): Promise<ZoningResult> {
      return invoke<ZoningResult>(command, {request: {operation: "lookup", payload: {
        jurisdiction: payload.jurisdiction, query: payload.query}}});
    },
    async question(payload: QuestionPayload): Promise<ZoningResult> {
      return invoke<ZoningResult>(command, {request: {operation: "question", payload: {
        jurisdiction: payload.jurisdiction, query: payload.query, question: payload.question,
        kind: payload.kind, key: payload.key}}});
    },
    async registerRule(payload: RegisterRulePayload): Promise<ZoningResult> {
      requireStaff("registerRule");
      return invoke<ZoningResult>(command, {request: {operation: "register-rule", payload: {
        jurisdiction: payload.jurisdiction, zone_code: payload.zone_code, kind: payload.kind,
        key: payload.key, value: payload.value, section_number: payload.section_number,
        overlay_code: payload.overlay_code ?? null}}});
    },
    async importBundle(payload: object): Promise<ZoningResult> {
      requireStaff("importBundle");
      return invoke<ZoningResult>(command, {request: {operation: "import-bundle", payload}});
    },
    async workspace(): Promise<Workspace> {
      requireStaff("workspace");
      return invoke<Workspace>(command, {request: {operation: "workspace"}});
    },
    async review(id: string, payload: ReviewPayload): Promise<ZoningResult> {
      requireStaff("review");
      return invoke<ZoningResult>(command, {request: {operation: "review", id, payload: {
        answer: payload.answer, notes: payload.notes, queue_status: payload.queue_status}}});
    },
    async outline(payload: OutlinePayload): Promise<ZoningResult> {
      requireStaff("outline");
      return invoke<ZoningResult>(command, {request: {operation: "outline", payload: {
        title: payload.title, question_ids: payload.question_ids.slice()}}});
    },
    async codeContext(payload: CodeContextPayload): Promise<ZoningResult> {
      requireStaff("codeContext");
      return invoke<ZoningResult>(command, {request: {operation: "code-context", payload: {
        section_number: payload.section_number, as_of: payload.as_of ?? null}}});
    },
    async searchMeetings(query: string): Promise<ZoningResult> {
      requireStaff("searchMeetings");
      return invoke<ZoningResult>(command, {request: {operation: "search-meetings", payload: {query}}});
    },
    async linkMeeting(id: string, payload: {source_id: string; expected_sha256: string; relation: "hearing" | "context" | "precedent"}): Promise<ZoningResult> {
      requireStaff("linkMeeting");
      return invoke<ZoningResult>(command, {request: {operation: "link-meeting", id, payload: {
        source_id: payload.source_id, expected_sha256: payload.expected_sha256, relation: payload.relation}}});
    },
    async history(id: string): Promise<ZoningResult> {
      requireStaff("history");
      return invoke<ZoningResult>(command, {request: {operation: "history", id}});
    },
    async snapshot(id: string, payload: {visibility: "public" | "staff_only"; meeting_event_ids: string[]}): Promise<ZoningResult> {
      requireStaff("snapshot");
      return invoke<ZoningResult>(command, {request: {operation: "snapshot", id, payload: {
        visibility: payload.visibility, meeting_event_ids: payload.meeting_event_ids.slice()}}});
    },
  };
}
