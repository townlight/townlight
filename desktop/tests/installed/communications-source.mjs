const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error("minutesId must be a UUID");
  }
  return value;
}

function assertNonEmpty(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("publicRecordId must be a non-empty string");
  }
  return value;
}

export async function preparePublicMeetingSource({ native, meetingId, save }) {
  const call = async (command, request) => {
    const response = await native(command, { request });
    return response?.result ?? response;
  };

  const draft = await call("meetings_domain_request", {
    operation: "create-minutes-draft",
    id: meetingId,
    payload: {
      source_materials: [{ source_id: "fixture-notes", label: "Synthetic public clerk notes", text: "The council received the clerk report." }],
      sentences: [{ text: "The council received the clerk report.", citations: ["fixture-notes"] }]
    }
  });
  const minutesId = assertUuid(draft.id);

  for (const action of ["post", "adopt"]) {
    await call("meetings_domain_request", {
      operation: "record-minutes-decision",
      id: minutesId,
      payload: { action, note: "Synthetic installed acceptance operator decision" }
    });
  }

  const archive = await call("meetings_domain_request", {
    operation: "archive-meeting",
    id: meetingId,
    payload: {
      visibility: "public",
      packet_id: null,
      minutes_id: minutesId,
      plain_language_summary: "Synthetic meeting record used for installed acceptance."
    }
  });
  const publicRecordId = assertNonEmpty(archive.id);

  const source = await call("communications_request", {
    operation: "source",
    payload: { kind: "meetings", id: publicRecordId }
  });
  if (source?.reference?.eligible !== true) {
    throw new Error("public communications source is not eligible");
  }

  const result = { publicRecordId, meetingId, minutesId };
  await save("communications-public-source", result);
  return result;
}
