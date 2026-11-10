/** Native transport only. No actor, service URL, retries or JSON fallback. */
import type { CodeDecision, ConnectionView } from '../code/client';
type Invoke = <T>(command: string, args: {request: object}) => Promise<T>;
export interface MeetingInput {title: string; scheduled_start: string; location: string; meeting_type?: string}
export interface AgendaInput {title: string; department_name: string}
interface ImportPayload {
  connector: string; input_format: string; source_url: string; content_base64: string;
}
interface ImportPreview {
  source: {sha256: string};
  meetings: Array<{external_id: string; title: string; meeting_date?: string; scheduled_start?: string}>;
}
interface ImportSource {
  connector: string; input_format: string; label: string;
}
interface ImportReceipt {
  payload: {documents?: Array<{kind: string; title?: string; url: string}>};
}

export async function readImportFile(source: ImportSource, data: {source_url: string; export_file: File}): Promise<ImportPayload> {
  const file = data.export_file;
  if (!file?.size || file.size > 16 * 1024 * 1024) {
    throw new Error("Choose a saved source response up to 16 MiB.");
  }
  const content_base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.readAsDataURL(file);
  });
  const {connector, input_format} = source;
  return {connector, input_format, source_url: data.source_url, content_base64};
}

export function createMeetingsClient(invoke: Invoke) {
  return {
    importSources(): Promise<ImportSource[]> {
      return invoke("meetings_domain_request", {request: {operation: "import-sources"}});
    },
    previewImport(payload: ImportPayload): Promise<ImportPreview> {
      return invoke("meetings_domain_request", {request: {operation: "preview-import", payload}});
    },
    fetchImport(source: ImportSource, source_url: string): Promise<{payload: ImportPayload; preview: ImportPreview}> {
      const {connector, input_format} = source;
      return invoke("meetings_domain_request", {request: {operation: "fetch-import", payload: {
        connector, input_format, source_url,
      }}});
    },
    commitImport(payload: ImportPayload, external_id: string, expected_sha256: string) {
      return invoke("meetings_domain_request", {request: {operation: "commit-import", payload: {
        ...payload, external_id, expected_sha256,
      }}});
    },
    getImport(id: string): Promise<ImportReceipt> {
      return invoke("meetings_domain_request", {request: {operation: "get-import", id}});
    },
    attachImportDocument(id: string, request_id: string, document_index: number) {
      return invoke("meetings_domain_request", {request: {operation: "attach-import-document", id, payload: {
        request_id, document_index,
      }}});
    },
    codeConnections(_id?: string, _data?: unknown): Promise<ConnectionView[]> {
      return invoke('meetings_domain_request', {request: {operation: 'code-connections'}});
    },
    codeConnection: (id: string): Promise<ConnectionView> => invoke('meetings_domain_request', {request: {operation: 'code-connection', id}}),
    recordCodeDecision: (id: string, data: CodeDecision): Promise<unknown> => invoke('meetings_domain_request', {request: {operation: 'record-code-decision', id, payload: data}}),
    getNoticeTemplate(id:string) { return invoke("meetings_domain_request",{request:{operation:"get-notice-template",id}}); },
    deliverNotice(id:string,data:{text:string}) {
      return invoke("meetings_domain_request",{request:{operation:"deliver-notice",id,payload:{text:data.text}}});
    },
    openExports() { return invoke("open_domain_exports",{request:{folder:"meetings"}}); },
    captureTranscript(id:string,data:{source_label:string;transcript_text:string;correction_of_id?:string}) {
      return invoke("meetings_domain_request",{request:{operation:"capture-transcript",id,payload:{
        source_label:data.source_label,transcript_text:data.transcript_text,correction_of_id:data.correction_of_id || null,
      }}});
    },
    captureActionItem(id:string,data:{description:string;assigned_to?:string;source_motion_id?:string}) {
      return invoke("meetings_domain_request",{request:{operation:"capture-action-item",id,payload:{
        description:data.description,assigned_to:data.assigned_to || null,source_motion_id:data.source_motion_id || null,
      }}});
    },
    archiveMeeting(id:string,data:{visibility:string;packet_id?:string;minutes_id?:string;plain_language_summary?:string}) {
      return invoke("meetings_domain_request",{request:{operation:"archive-meeting",id,payload:{
        visibility:data.visibility,packet_id:data.packet_id || null,minutes_id:data.minutes_id || null,
        plain_language_summary:data.plain_language_summary || "",
      }}});
    },
    checkNotice(id: string, data: {notice_type:string;posted_at:string;minimum_notice_hours:string;statutory_basis?:string;approved_by?:string}) {
      return invoke("meetings_domain_request",{request:{operation:"check-notice",id,payload:{
        notice_type:data.notice_type,posted_at:data.posted_at,minimum_notice_hours:Number(data.minimum_notice_hours),
        statutory_basis:data.statutory_basis || null,approved_by:data.approved_by || null,
      }}});
    },
    recordNoticeProof(id:string,data:{location:string;note?:string;document_delivery_id?:string}) {
      return invoke("meetings_domain_request",{request:{operation:"record-notice-proof",id,payload:{location:data.location,note:data.note || "",document_delivery_id:data.document_delivery_id || null}}});
    },
    recordMeetingStage(id: string, data: {to_status: string; statutory_basis?: string}) {
      return invoke("meetings_domain_request", {request: {operation:"record-meeting-stage",id,payload:{
        to_status:data.to_status,statutory_basis:data.statutory_basis || null,
      }}});
    },
    deliverPacket(id: string) {
      return invoke("meetings_domain_request", {request:{operation:"deliver-packet",id}});
    },
    capturePacket(id: string, data: {agenda_item_ids: string; source_paths?: string}) {
      return invoke("meetings_domain_request", {request: {operation: "capture-packet", id, payload: {
        agenda_item_ids: data.agenda_item_ids.split(/[\s,]+/).filter(Boolean),
        source_paths: (data.source_paths || "").split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
      }}});
    },
    recordMinutesDecision(id: string, data: {action: string; note?: string}) {
      return invoke("meetings_domain_request", {request: {operation: "record-minutes-decision", id, payload: {action: data.action, note: data.note || ""}}});
    },
    recordAgendaReview(id: string, data: {to_status: string}) {
      return invoke("meetings_domain_request", {request: {operation: "record-agenda-review", id, payload: {to_status: data.to_status}}});
    },
    assignAgendaMeeting(id: string, data: {meeting_id: string}) {
      return invoke("meetings_domain_request", {request: {operation: "assign-agenda-meeting", id, payload: {meeting_id: data.meeting_id}}});
    },
    createMeeting(data: MeetingInput) {
      const {title, scheduled_start, location} = data;
      return invoke("meetings_domain_request", {request: {operation: "create-meeting", payload: {title, scheduled_start, location,meeting_type:data.meeting_type || "regular"}}});
    },
    createAgendaItem(data: AgendaInput) {
      const {title, department_name} = data;
      return invoke("meetings_domain_request", {request: {operation: "create-agenda-item", payload: {title, department_name}}});
    },
    captureMotion(id: string, data: {text: string; seconded_by?: string}) {
      return invoke("meetings_domain_request", {request: {operation: "capture-motion", id, payload: {text: data.text, seconded_by: data.seconded_by || null}}});
    },
    correctMotion(id: string, data: {text: string; reason: string}) {
      return invoke("meetings_domain_request", {request: {operation: "correct-motion", id, payload: {text: data.text, reason: data.reason}}});
    },
    captureVote(id: string, data: {voter_name: string; vote: string}) {
      return invoke("meetings_domain_request", {request: {operation: "capture-vote", id, payload: {voter_name: data.voter_name, vote: data.vote}}});
    },
    correctVote(id: string, data: {vote: string; reason: string}) {
      return invoke("meetings_domain_request", {request: {operation: "correct-vote", id, payload: {vote: data.vote, reason: data.reason}}});
    },
    createMinutes(id: string, data: {source_id: string; label: string; source_text: string; text: string}) {
      return invoke("meetings_domain_request", {request: {operation: "create-minutes-draft", id, payload: {
        source_materials: data.source_id && data.label && data.source_text ? [{source_id: data.source_id, label: data.label, text: data.source_text}] : [],
        sentences: [{text: data.text, citations: data.source_id ? [data.source_id] : []}],
      }}});
    },
    read(kind: "meeting" | "agenda-item" | "proceedings" | "import", id: string) {
      return invoke("meetings_domain_request", {request: {operation: `get-${kind}`, id}});
    },
  };
}
