/** Existing Access UI input adapter. Permissions and rules stay in the service. */
import type {Invoke} from "./client.ts";

type Payload = Record<string, unknown>;
export interface AccessState { reviews: {review_id: string; canonical_review_id: string}[] }
const text = (p: Payload, key: string) => String(p[key] ?? "");
const flag = (p: Payload, key: string) => p[key] === true || p[key] === "true";
const list = (p: Payload, key: string): string[] => Array.isArray(p[key]) ? (p[key] as unknown[]).map(String) :
  text(p, key).split(/[,\n]/).map(s => s.trim()).filter(Boolean);

export function createAccessClient(invoke: Invoke) {
  return {
    refresh() { return invoke("access_domain_request", {request: {operation: "state"}}); },
    action(action: string, p: Payload, current?: AccessState) {
      let request: object;
      switch (action) {
        case "accessibility-review":
          request = {operation: "review", payload: {title: text(p, "title"), body: text(p, "body"),
            language: text(p, "language"), hasAltText: flag(p, "hasAltText")}};
          break;
        case "civicaccess-delete-review": case "civicaccess-records-export":
          const selected = current?.reviews.find(row => row.review_id === text(p, "reviewId"));
          if (!selected?.canonical_review_id) throw new Error("Refresh Access and select the saved review again.");
          request = {operation: action === "civicaccess-delete-review" ? "delete-review" : "export-review", review_id: selected.canonical_review_id};
          break;
        case "civicaccess-plain-language": case "civicaccess-language-variant":
          request = {operation: "rewrite", payload: {action: action.slice("civicaccess-".length),
            text: text(p, "text"), language: text(p, "language")}};
          break;
        case "civicaccess-form-plan":
          request = {operation: "tool", payload: {action: "form-plan", formName: text(p, "formName"), fields: list(p, "fields")}};
          break;
        case "civicaccess-publishing-workflow":
          request = {operation: "tool", payload: {action: "publishing-workflow", title: text(p, "title"),
            hasReview: flag(p, "hasReview"), hasPlainLanguage: flag(p, "hasPlainLanguage"), hasTranslationReview: flag(p, "hasTranslationReview")}};
          break;
        case "civicaccess-ada-title-ii":
          request = {operation: "tool", payload: {action: "ada-title-ii", serviceArea: text(p, "serviceArea"), hasCoordinatorReview: flag(p, "hasCoordinatorReview")}};
          break;
        case "civicaccess-tagged-pdf": {
          const levels = list(p, "headingLevels");
          if (levels.some(level => !/^\d+$/.test(level) || Number(level) > 4294967295)) throw new Error("Heading levels must be whole numbers.");
          request = {operation: "tool", payload: {action: "tagged-pdf", headingLevels: levels.map(Number)}};
          break;
        }
        default: throw new Error("This Access action is not connected.");
      }
      return invoke("access_domain_request", {request});
    },
  };
}
