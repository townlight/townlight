export async function installedParksEnrollment({ page, native, save, householdId }) {
  const must = (value, message) => {
    if (!value) throw new Error(message);
  };
  const rowOf = (value) => value?.session ?? value?.registration ?? value;
  const stamp = Date.now();

  async function parksRequest(operation, extra = {}) {
    if (typeof native !== "function") {
      throw new Error("Installed native parks_request bridge is unavailable.");
    }
    const response = await native("parks_request", { request: { operation, ...extra } });
    return response && typeof response === "object" && "result" in response
      ? response.result
      : response;
  }

  async function openParks() {
    await page.evaluate(async () => {
      await window.audit.click('[data-surface="Staff"]', { confirm: false });
      await window.audit.nav("parks");
    });
    await page.locator("[data-session-program]").waitFor({ state: "visible" });
    await page.locator("[data-parks-sessions]").waitFor({ state: "visible" });
  }

  async function selectSession(programId, sessionId) {
    const program = page.locator("[data-session-program]");
    await program.selectOption(programId);
    await page
      .locator(`[data-session-list] option[value="${sessionId}"]`)
      .waitFor({ state: "attached" });
    const session = page.locator("[data-session-list]");
    if ((await session.inputValue()) === sessionId) await session.selectOption("");
    await session.selectOption(sessionId);
  }

  async function waitForRosterRow(name, state, checkedIn) {
    await page.waitForFunction(
      ({ name, state, checkedIn }) =>
        Array.from(document.querySelectorAll("[data-session-roster] tr")).some((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
            (td.textContent || "").trim(),
          );
          return (
            cells[0] === name &&
            (!state || cells[2] === state) &&
            (!checkedIn || cells[3] === checkedIn)
          );
        }),
        { name, state, checkedIn },
    );
  }

  async function readDomRoster() {
    return page.locator("[data-session-roster] tr").evaluateAll((rows) =>
      rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").trim(),
        );
        return { name: cells[0], household: cells[1], state: cells[2], checkedIn: cells[3] };
      }),
    );
  }

  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(15, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const program = rowOf(
    await parksRequest("catalog-create", {
      kind: "program",
      payload: {
        payload: {
          title: `Installed enrollment ${stamp}`,
          description: "Public program for installed enrollment verification.",
          timezone: "UTC",
          public: true,
        },
      },
    }),
  );
  const programId = program?.id;
  must(programId, "Program creation did not return an id.");

  const publicProgram = rowOf(
    await parksRequest("catalog-get", {
      kind: "program",
      id: programId,
      public_only: true,
    }),
  );
  must(publicProgram?.id === programId, "Created program is not publicly readable.");

  const session = rowOf(
    await parksRequest("sessions-create", {
      payload: {
        program_id: programId,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        capacity: 1,
        fee_cents: 0,
        currency: "USD",
      },
    }),
  );
  const sessionId = session?.id;
  must(sessionId && Number(session.capacity) === 1, "Session creation/capacity failed.");

  const householdIds = [];
  const participantIds = [];
  for (const [name, email] of [
    [`Ada Installed ${stamp}`, `ada.${stamp}@example.test`],
    [`Bob Installed ${stamp}`, `bob.${stamp}@example.test`],
  ]) {
    const household = rowOf(
      await parksRequest("households-create", {
        payload: {
          payload: {
            contact_name: name,
            email,
            phone: "555-0100",
            address: "1 Installed Test Way, Testville, CA 90210",
            language: "en",
          },
        },
      }),
    );
    must(household?.id, "Household creation did not return an id.");
    householdIds.push(household.id);

    const participant = rowOf(
      await parksRequest("create-participant", {
        payload: {
          household_id: household.id,
          payload: {
            name,
            birth_date: "2000-01-01",
            accommodations: "",
          },
        },
      }),
    );
    must(participant?.id, "Participant creation did not return an id.");
    participantIds.push(participant.id);
  }

  async function sessionRevision() {
    const current = rowOf(
      await parksRequest("sessions-get", { session_id: sessionId }),
    );
    must(Number.isInteger(Number(current?.revision)), "Session revision is unavailable.");
    return current.revision;
  }

  const firstRegistration = rowOf(
    await parksRequest("registrations-create", {
      payload: {
        session_id: sessionId,
        participant_id: participantIds[0],
        expected_session_revision: await sessionRevision(),
      },
    }),
  );
  must(firstRegistration?.id, "First registration creation failed.");
  must(firstRegistration.state === "confirmed", "First registration was not enrolled.");

  const secondRegistration = rowOf(
    await parksRequest("registrations-create", {
      payload: {
        session_id: sessionId,
        participant_id: participantIds[1],
        expected_session_revision: await sessionRevision(),
      },
    }),
  );
  must(secondRegistration?.id, "Second registration creation failed.");
  must(secondRegistration.state === "waitlisted", "Second registration was not waitlisted.");

  await openParks();
  await page.locator("[data-session-refresh]").click();
  await page
    .locator(`[data-session-program] option[value="${programId}"]`)
    .waitFor({ state: "attached" });
  await selectSession(programId, sessionId);

  const firstName = `Ada Installed ${stamp}`;
  const secondName = `Bob Installed ${stamp}`;
  await waitForRosterRow(firstName, "confirmed");
  await waitForRosterRow(secondName, "waitlisted");
  const initialRoster = await readDomRoster();
  must(initialRoster.length === 2, "Initial roster did not contain exactly two registrations.");

  const privacyText = await page.locator("[data-parks-sessions]").innerText();
  must(
    privacyText.includes("Private staff only") &&
      privacyText.includes("Minor status and accommodations are never public"),
    "Roster privacy notice is missing.",
  );

  const persistedSession = rowOf(
    await parksRequest("sessions-get", { session_id: sessionId }),
  );
  must(Number(persistedSession?.capacity) === 1, "Session capacity was not persisted.");

  const cancelled = await parksRequest("registrations-cancel", {
    registration_id: firstRegistration.id,
    payload: {
      expected_revision: firstRegistration.revision,
      reason: "Installed enrollment cancellation",
    },
  });
  must(cancelled?.registration?.state === "cancelled", "Original registration was not cancelled.");
  const promotedRows = Array.isArray(cancelled?.promoted) ? cancelled.promoted : [];
  must(
    promotedRows.length === 1 && String(promotedRows[0]?.id) === String(secondRegistration.id),
    "Waitlisted registration was not promoted exactly once.",
  );

  const promoted = rowOf(
    await parksRequest("registrations-get", {
      registration_id: secondRegistration.id,
    }),
  );
  must(promoted?.state === "confirmed", "Promoted registration is not confirmed.");

  await selectSession(programId, sessionId);
  await waitForRosterRow(firstName, "cancelled");
  await waitForRosterRow(secondName, "confirmed");
  const promotedRoster = await readDomRoster();
  must(
    promotedRoster.filter((row) => row.name === secondName).length === 1,
    "Promoted registration appears more than once in the roster.",
  );

  const checkedIn = rowOf(
    await parksRequest("registrations-check-in", {
      registration_id: secondRegistration.id,
      payload: {
        expected_revision: promoted.revision,
        reason: "Installed enrollment check-in",
      },
    }),
  );
  must(checkedIn?.state === "confirmed", "Promoted registration check-in failed.");
  must(checkedIn.checked_in_at != null, "Check-in did not persist an attendance timestamp.");

  const attendanceReadback = rowOf(
    await parksRequest("registrations-get", {
      registration_id: secondRegistration.id,
    }),
  );
  must(
    attendanceReadback?.checked_in_at != null,
    "Native registration readback is missing attendance.",
  );

  await selectSession(programId, sessionId);
  await waitForRosterRow(secondName, "confirmed", "Yes");
  const finalRoster = await readDomRoster();
  const finalSecondRows = finalRoster.filter((row) => row.name === secondName);
  must(finalSecondRows.length === 1, "Final roster contains duplicate promoted rows.");
  must(finalSecondRows[0].checkedIn === "Yes", "DOM roster did not persist attendance.");

  const nativeRoster = await parksRequest("sessions-roster", { session_id: sessionId });
  must(Array.isArray(nativeRoster), "Native roster readback is not an array.");
  const nativeSecondRows = nativeRoster.filter(
    (row) => String(row?.name) === secondName,
  );
  must(nativeSecondRows.length === 1, "Native roster promoted row was not unique.");
  must(nativeSecondRows[0].state === "confirmed", "Native roster state is not confirmed.");
  must(nativeSecondRows[0].checked_in_at != null, "Native roster attendance was not persisted.");

  const result = {
    programId,
    sessionId,
    householdIds,
    participantIds,
    registrations: {
      original: firstRegistration.id,
      promoted: secondRegistration.id,
    },
    assertions: {
      publicProgram: true,
      futureUtcSession: true,
      capacityOnePersisted: true,
      firstEnrolled: true,
      secondWaitlisted: true,
      rosterPrivacy: true,
      promotionExactlyOnce: true,
      attendancePersisted: true,
      rosterDeduplicated: true,
    },
    inputHouseholdId: householdId ?? null,
  };

  if (typeof save === "function") {
    if (save.length >= 2) await save("parks-enrollment", result);
    else await save(result);
  }
  return result;
}
