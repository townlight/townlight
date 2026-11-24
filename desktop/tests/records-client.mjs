import assert from "node:assert/strict";
import { createRecordsClient } from "../src/records/client.ts";
import { createAccessClient } from "../src/records/access-client.ts";
import { createRecordsController } from "../src/records/controller.ts";
import { createMeetingsClient } from "../src/meetings/client.ts";
import { createRecordsRenderer } from "../src/records/view.js";

const calls = [];
const client = createRecordsClient(async (command, args) => { calls.push({ command, ...args }); return {}; });
const current = {records_requests:[{id:"legacy-1", request_id:"a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78",
  documents:[{id:"legacy-doc", attachment_id:"b7abf8da-7c0b-47a5-b4ab-4fc1b33aab78"}]}]};
await client.action("draft-records-response", {recordsRequestId:"legacy-1", responseDraft:"New text", actor:"admin", meetingId:"wrong"}, current);
assert.deepEqual(calls[0].request.payload, {responseDraft:"New text", citation:""});
assert.equal(calls[0].request.request_id, current.records_requests[0].request_id);
await assert.rejects(client.action("close-records-request", {recordsRequestId:"gone"}, current));
assert.equal(calls.length, 1);
await client.action("add-records-release-copy", {recordsRequestId:"legacy-1", releaseDocumentId:"legacy-doc", releaseCopyPath:"synthetic.txt", releaseCopyStatus:"redacted copy"}, current);
assert.equal(calls[1].request.attachment_id, current.records_requests[0].documents[0].attachment_id);
await client.action("download-records-attachment", {recordsRequestId:"legacy-1", attachmentId:current.records_requests[0].documents[0].attachment_id,
  suggestedFileName:"station-recording.ts", targetPath:"must-not-be-web-supplied"}, current, true);
assert.equal(calls[2].command, "download_records_attachment");
assert.deepEqual({requestId:calls[2].requestId, attachmentId:calls[2].attachmentId, suggestedFileName:calls[2].suggestedFileName}, {
  requestId:current.records_requests[0].request_id, attachmentId:current.records_requests[0].documents[0].attachment_id, suggestedFileName:"station-recording.ts"});
assert.equal(Object.hasOwn(calls[2], "targetPath"), false);
await client.publicAction("lookup-public-records-request", {trackingNumber:"REQ-0001", requesterContact:"synthetic", responseDraft:"must not pass"});
assert.equal(calls[3].command, "records_public_request");
assert.deepEqual(calls[3].request.payload, {trackingNumber:"REQ-0001", requesterContact:"synthetic"});
let count = 0;
const failed = createRecordsClient(async () => { count++; throw {code:"service-unavailable", outcome_unknown:true}; });
await assert.rejects(failed.action("close-records-request", {recordsRequestId:"legacy-1"}, current));
assert.equal(count, 1);
console.log("PASS: Records client uses canonical IDs, strips unrelated fields, and never retries or falls back.");

// Exercise the actual shared-staff Documents button payload through its
// controller and native command adapter, including a cancelled save dialog.
const requestWithFile = {id:"legacy-1", request_id:"a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78", documents:[{
  id:"legacy-doc", attachment_id:"b7abf8da-7c0b-47a5-b4ab-4fc1b33aab78", title:"Station recording", file_name:"station.ts", sha256:"d".repeat(64), size_bytes:2174280536
}]};
const documentsHtml = createRecordsRenderer({escapeHtml:String}).renderRecordsDocuments(requestWithFile, true);
const encodedButtonPayload = documentsHtml.match(/data-action-payload='([^']+)'/)[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'");
const buttonPayload = JSON.parse(encodedButtonPayload);
const nativeCalls = [];
const downloadController = createRecordsController(async (command, args) => {
  nativeCalls.push({command, ...args});
  if (command === "download_records_attachment") return {path:"C:/Records/station.ts", size_bytes:2174280536, sha256:"d".repeat(64)};
  if (command === "records_domain_request") return {records_requests:[requestWithFile]};
  throw new Error(`Unexpected command ${command}`);
});
const downloaded = await downloadController.action("download-records-attachment", buttonPayload, {records_requests:[requestWithFile]}, true);
assert.deepEqual(nativeCalls.filter(call => call.command === "download_records_attachment").map(({command, requestId, attachmentId, suggestedFileName}) => ({command, requestId, attachmentId, suggestedFileName})), [{
  command:"download_records_attachment", requestId:requestWithFile.request_id,
  attachmentId:requestWithFile.documents[0].attachment_id, suggestedFileName:"station.ts"
}]);
assert.match(downloaded.message, /2174280536 bytes, SHA-256/);
const cancelledController = createRecordsController(async (command) => {
  if (command === "download_records_attachment") throw new Error("Download cancelled.");
  return {records_requests:[requestWithFile]};
});
await assert.rejects(cancelledController.action("download-records-attachment", buttonPayload, {records_requests:[requestWithFile]}, true), /Download cancelled/);
console.log("PASS: shared Records Documents button routes canonical attachment IDs and filename to the native verified downloader; cancellation is preserved.");
const accessCalls = [];
const access = createAccessClient(async (command, args) => {accessCalls.push({command, ...args}); return {};});
await access.action("accessibility-review", {title:"Notice", body:"Public text", hasAltText:false, actor:"admin", ai_analysis:"forged"});
assert.equal(accessCalls[0].command, "access_domain_request");
assert.deepEqual(accessCalls[0].request.payload, {title:"Notice", body:"Public text", language:"", hasAltText:false});
await access.action("townlight_access-form-plan", {formName:"Request", fields:"name,contact\nrequest"});
assert.deepEqual(accessCalls[1].request.payload.fields, ["name","contact","request"]);
assert.throws(() => access.action("townlight_access-tagged-pdf", {headingLevels:"1,2.5"}));
assert.throws(() => access.action("unknown", {}));
assert.equal(accessCalls.length, 2);
await access.action("townlight_access-delete-review", {reviewId:"legacy-review"}, {reviews:[{
  review_id:"legacy-review", canonical_review_id:"a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78"}]});
assert.equal(accessCalls[2].request.review_id, "a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78");
assert.throws(() => access.action("townlight_access-records-export", {reviewId:"missing"}, {reviews:[]}));
console.log("PASS: Access client strips actor/AI injection, translates existing fields, and rejects unsupported actions.");
const controllerCalls = [];
const canonical = {records_requests:current.records_requests, authority:"python-records"};
const controller = createRecordsController(async (command, args) => {
  controllerCalls.push({command, ...args});
  return command === "suite_domain_request" ? canonical : {message:"Saved"};
});
const result = await controller.action("draft-records-response", {recordsRequestId:"legacy-1", responseDraft:"New text"}, current);
assert.deepEqual(controllerCalls.map(c => c.command), ["records_domain_request", "suite_domain_request"]);
assert.equal(result.state.records_requests, canonical.records_requests);
assert.deepEqual(result.state.meetings, []);
await assert.rejects(controller.action("create-meeting", {}, current));
assert.equal(controllerCalls.length, 2); // Explicitly unavailable; never legacy fallback.
const unavailable = createRecordsController(async () => {throw {message:"Backend unavailable", outcome_unknown:true};});
await assert.rejects(unavailable.action("draft-records-response", {recordsRequestId:"legacy-1"}, current));
console.log("PASS: Canonical controller refreshes SQL state and never falls back to the legacy writer.");

const meetingCalls = [];
const meetings = createMeetingsClient(async (command, args) => { meetingCalls.push({command, ...args}); return {}; });
await meetings.createMeeting({title:"Council", scheduled_start:"2026-10-20T18:00:00-06:00", location:"Hall", actor:"forged"});
await meetings.createAgendaItem({title:"Trail report", department_name:"Public Works", actor:"forged"});
await meetings.read("meeting", "a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78");
assert.equal(meetingCalls[0].command, "meetings_domain_request");
assert.equal(Object.hasOwn(meetingCalls[0].request.payload, "actor"), false);
assert.equal(Object.hasOwn(meetingCalls[1].request.payload, "actor"), false);
assert.equal(meetingCalls[2].request.operation, "get-meeting");
let meetingAttempts = 0;
await assert.rejects(createMeetingsClient(async () => { meetingAttempts++; throw new Error("unavailable"); }).createAgendaItem({title:"Report", department_name:"Works"}));
assert.equal(meetingAttempts, 1);
console.log("PASS: Meetings uses typed native requests, strips actor input and never retries/falls back.");
