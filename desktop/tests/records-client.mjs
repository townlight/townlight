import assert from "node:assert/strict";
import { createRecordsClient } from "../src/records/client.ts";
import { createAccessClient } from "../src/records/access-client.ts";
import { createRecordsController } from "../src/records/controller.ts";
import { createMeetingsClient } from "../src/meetings/client.ts";

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
await client.publicAction("lookup-public-records-request", {trackingNumber:"REQ-0001", requesterContact:"synthetic", responseDraft:"must not pass"});
assert.equal(calls[2].command, "records_public_request");
assert.deepEqual(calls[2].request.payload, {trackingNumber:"REQ-0001", requesterContact:"synthetic"});
let count = 0;
const failed = createRecordsClient(async () => { count++; throw {code:"service-unavailable", outcome_unknown:true}; });
await assert.rejects(failed.action("close-records-request", {recordsRequestId:"legacy-1"}, current));
assert.equal(count, 1);
console.log("PASS: Records client uses canonical IDs, strips unrelated fields, and never retries or falls back.");
const accessCalls = [];
const access = createAccessClient(async (command, args) => {accessCalls.push({command, ...args}); return {};});
await access.action("accessibility-review", {title:"Notice", body:"Public text", hasAltText:false, actor:"admin", ai_analysis:"forged"});
assert.equal(accessCalls[0].command, "access_domain_request");
assert.deepEqual(accessCalls[0].request.payload, {title:"Notice", body:"Public text", language:"", hasAltText:false});
await access.action("civicaccess-form-plan", {formName:"Request", fields:"name,contact\nrequest"});
assert.deepEqual(accessCalls[1].request.payload.fields, ["name","contact","request"]);
assert.throws(() => access.action("civicaccess-tagged-pdf", {headingLevels:"1,2.5"}));
assert.throws(() => access.action("unknown", {}));
assert.equal(accessCalls.length, 2);
await access.action("civicaccess-delete-review", {reviewId:"legacy-review"}, {reviews:[{
  review_id:"legacy-review", canonical_review_id:"a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78"}]});
assert.equal(accessCalls[2].request.review_id, "a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78");
assert.throws(() => access.action("civicaccess-records-export", {reviewId:"missing"}, {reviews:[]}));
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
