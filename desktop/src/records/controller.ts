/** Canonical Records milestone controller. Never merges a legacy JSON snapshot. */
import {createRecordsClient, isRecordsAction, isPublicRecordsAction} from "./client.ts";
import type {Invoke, RecordsState} from "./client.ts";
import {createAccessClient} from "./access-client.ts";
import type {AccessState} from "./access-client.ts";

type State = RecordsState & {access?: object; demo_fixture?: object | null};
type Result = {accepted?: boolean; message?: string; state?: State; search_results?: unknown[];
  next_steps?: string[]; disclaimer?: string};

export function canonicalWork(snapshot: State) {
  // Explicit unavailable product collections, not data read from the retired writer.
  return {schema_version:1, demo_fixture:null, meeting_bodies:[], meeting_members:[], agenda_intakes:[],
    meetings:[], code_sources:[], code_handoffs:[], adopted_legislation:[], audit_entries:[],
    publication_events:[], notification_events:[], access:{reviews:[], audit_events:[]}, ...snapshot};
}

export function createRecordsController(invoke: Invoke) {
  const records = createRecordsClient(invoke);
  const access = createAccessClient(invoke);
  const refresh = async (publicOnly: boolean) => canonicalWork(publicOnly ? await records.refresh(true) :
    await invoke<State>("suite_domain_request", {request:{operation:"state"}}));
  return {
    refresh,
    async action(action: string, payload: Record<string, string>, current: RecordsState) {
      let result: Result;
      let publicOnly = false;
      if (isPublicRecordsAction(action)) {
        publicOnly = true;
        result = await records.publicAction(action, payload);
      } else if (isRecordsAction(action)) {
        result = await records.action(action, payload, current) as Result;
      } else if (action === "accessibility-review" || action.startsWith("civicaccess-")) {
        result = await access.action(action, payload, current.access as AccessState | undefined) as Result;
      } else if (action === "search-city-knowledge") {
        result = await invoke<Result>("suite_domain_request", {request:{operation:"search", query:payload.query ?? ""}});
      } else if (action === "open-exports-folder") {
        const folder = payload.folder || "all";
        if (!["all", "records", "access"].includes(folder)) throw new Error("This export folder is not available in the Records candidate.");
        result = await invoke<Result>("open_domain_exports", {request:{folder}});
      } else {
        throw new Error("This operation is not integrated in the Records candidate. No legacy writer was called.");
      }
      // Public lookup's contact-authorized thread belongs to this returned view;
      // an anonymous refresh would incorrectly discard it.
      const state = result.state ? canonicalWork(result.state) : await refresh(publicOnly);
      return {accepted: result.accepted ?? true, action, status: result.accepted === false ? "Needs attention" : "Saved", message: result.message ?? "Records work saved.",
        next_action: "Review the current saved work.", next_steps: result.next_steps ?? [], disclaimer: result.disclaimer ?? "",
        search_results: result.search_results ?? [], state};
    },
  };
}
