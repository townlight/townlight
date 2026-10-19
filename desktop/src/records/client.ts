/** Records UI adapter. No HTTP, session proof, fallback state, or retry here. */
export type Invoke = <T>(command: string, args: {request: object}) => Promise<T>;
export interface Attachment { id: string; attachment_id: string }
export interface RecordView { id: string; request_id: string; documents: Attachment[]; [field: string]: unknown }
export interface RecordsState { records_requests: RecordView[]; notification_events?: {id:string; notification_id:string}[]; [field: string]: unknown }
export interface OperationResult { action: string; message: string; request: RecordView }
export interface PublicResult { accepted: boolean; message: string; state: RecordsState }

const fields = {
  "assign-records-request": ["assignedTo"],
  "set-records-deadline": ["deadline", "deadlineBasis"],
  "calculate-records-deadline": ["deadlineReceivedDate", "deadlineRuleName", "deadlineDayCount", "deadlineDayType", "deadlineBasis"],
  "request-records-clarification": ["clarificationNote"],
  "add-records-message": ["requestMessageBody"],
  "record-records-search": ["sourceNote", "citation"],
  "record-records-search-session": ["searchQuery", "searchLocations", "searchResultTitle", "searchResultCitation", "searchResultSummary", "searchResultStatus", "searchReviewer"],
  "add-records-exemption-review": ["exemptionNote"],
  "add-records-exemption-decision": ["exemptionSource", "exemptionKind", "exemptionFinding", "exemptionDecision", "exemptionBasis", "exemptionReviewer"],
  "estimate-records-fee": ["feeEstimate"],
  "add-records-fee-line": ["feeLineDescription", "feeScheduleBasis", "feeLineAmount"],
  "waive-records-fee": ["feeWaiverReason"],
  "draft-records-response": ["responseDraft", "citation"],
  "approve-records-response": ["approvalNote"],
  "fulfill-records-request": [],
  "close-records-request": [],
} as const;

export type LifecycleAction = keyof typeof fields;
export type RecordsAction = LifecycleAction | "create-records-request" | "add-records-document" |
  "add-records-release-copy" | "build-records-release-package" | "export-records-response" | "suggest-records-response" | "mark-notification-sent";
export type PublicAction = "submit-public-records-request" | "lookup-public-records-request" | "add-public-records-message";

export function isRecordsAction(action: string): action is RecordsAction {
  return Object.hasOwn(fields, action) || ["create-records-request", "add-records-document", "add-records-release-copy",
    "build-records-release-package", "export-records-response", "suggest-records-response", "mark-notification-sent"].includes(action);
}
export function isPublicRecordsAction(action: string): action is PublicAction {
  return ["submit-public-records-request", "lookup-public-records-request", "add-public-records-message"].includes(action);
}

function pick(payload: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map(key => [key, payload[key] ?? ""]));
}

export function createRecordsClient(invoke: Invoke) {
  return {
    refresh(publicOnly = false): Promise<RecordsState> {
      return invoke(publicOnly ? "records_public_request" : "records_domain_request", {request: {operation: "state"}});
    },
    async publicAction(action: PublicAction, payload: Record<string, string>): Promise<PublicResult> {
      const operation = action === "submit-public-records-request" ? "submit" : action === "lookup-public-records-request" ? "lookup" : "message";
      const keys = operation === "submit" ? ["requester", "requesterContact", "summary"] :
        operation === "lookup" ? ["trackingNumber", "requesterContact"] : ["trackingNumber", "requesterContact", "publicRequestMessage"];
      return invoke("records_public_request", {request: {operation, payload: pick(payload, keys)}});
    },
    async action(action: RecordsAction, payload: Record<string, string>, current: RecordsState): Promise<OperationResult | Record<string, unknown>> {
      if (action === "mark-notification-sent") {
        const notification = current.notification_events?.find(item => item.id === payload.notificationId);
        if (!notification) throw new Error("Refresh Records and select the notification again.");
        return invoke("records_domain_request", {request: {operation: "mark-notification", notification_id: notification.notification_id}});
      }
      if (action === "create-records-request") {
        return invoke("records_domain_request", {request: {operation: "create", payload: pick(payload, ["requester", "summary", "deadline", "deadlineBasis"])}});
      }
      // Never use a display/legacy ID as an API UUID, or silently choose a
      // different request if selection disappeared after refresh.
      const selected = current.records_requests.find(item => item.id === payload.recordsRequestId);
      if (!selected?.request_id) throw new Error("Refresh Records and select the request again.");
      const request_id = selected.request_id;
      if (action === "suggest-records-response") {
        return invoke("records_domain_request", {request: {operation: "suggest", request_id}});
      }
      if (action === "add-records-document") {
        return invoke("records_domain_request", {request: {operation: "attach-document", request_id,
          title: payload.documentTitle, source_path: payload.documentSourcePath, citation: payload.documentCitation ?? ""}});
      }
      if (action === "add-records-release-copy") {
        const document = payload.releaseDocumentId ? selected.documents.find(item => item.id === payload.releaseDocumentId) : selected.documents[0];
        if (!document?.attachment_id) throw new Error("Refresh Records and select the original document again.");
        return invoke("records_domain_request", {request: {operation: "attach-release-copy", request_id, attachment_id: document.attachment_id,
          source_path: payload.releaseCopyPath, status: payload.releaseCopyStatus, note: payload.releaseCopyNote ?? "", added_by: payload.releaseCopyAddedBy ?? ""}});
      }
      if (action === "export-records-response" || action === "build-records-release-package") {
        return invoke("records_domain_request", {request: {operation: "export", request_id,
          kind: action === "export-records-response" ? "response" : "release-package"}});
      }
      if (!Object.hasOwn(fields, action)) throw new Error("This Records action is not connected yet.");
      return invoke("records_domain_request", {request: {operation: "apply", request_id, action, payload: pick(payload, fields[action])}});
    },
  };
}
