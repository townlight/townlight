(async () => {
  const a = window.audit;
  const result = [];
  const native = (operation, values = {}) => a.native("municipal_staff_request", {request: {operation, ...values}});
  const app = () => a.native("get_app_state");
  const workspace = () => document.querySelector("[data-municipal-content]");
  const nav = async (area) => {
    await a.click('[data-surface="Staff"]', {confirm:false});
    await a.nav(area);
    if (["boards", "contracts", "procurement"].includes(area)) {
      await a.until(() => workspace()?.querySelector("[data-municipal-form]"), 45000);
    }
  };
  const save = async (operation, values, files) => {
    await a.form('form[data-municipal-form="' + operation + '"]', values, files);
    const status = document.querySelector("[data-municipal-message]")?.textContent;
    if (status !== "Saved.") throw Error(operation + ": " + status);
  };
  const record = async (label, action, check) => {
    const row = await a.test(label, action, check);
    result.push({id: row.id, pass: row.pass, error: row.error, text: row.pass ? undefined : row.text});
    if (!row.pass) throw Error(label + " failed: " + (row.error || row.text));
  };
  const settings = async () => {
    await a.click('[data-surface="IT/Admin"]', {confirm:false});
    await a.nav("settings");
  };
  const users = {
    clerk: {email:"staff-check-clerk@example.invalid", passcode:"Synthetic-Check-Clerk-2026!"},
    "city-staff": {email:"staff-check-city@example.invalid", passcode:"Synthetic-Check-City-2026!"},
  };
  const signOut = async () => { await settings(); await a.click('[data-auth-action="sign-out"]'); };
  const signIn = async (role, user) => {
    await settings();
    a.fill('[data-access-field="email"]', user.email);
    a.fill('[data-access-field="passcode"]', user.passcode);
    await a.click('[data-auth-action="sign-in"]');
    await a.until(async () => { const {access} = await app(); return access.signed_in && access.role === role; });
  };
  const denied = async (op, args) => {
    try { await native(op, args); }
    catch (error) { return /denied|authoriz|permission|sign.in|not allowed/i.test(JSON.stringify(error)); }
    return false;
  };
  // Full-profile first-run deliberately leaves legacy Records activation to
  // this documented operator action before canonical Meetings staff work.
  if ((await app()).domain_authority !== "python-records") {
    await a.click('[data-surface="IT/Admin"]', {confirm:false});
    await a.nav("health");
    await a.click('[data-supervisor-action="activate-records"]', {timeout:600000});
    await a.until(async () => (await app()).domain_authority === "python-records", 600000);
  }
  await settings();
  for (const [role, user] of Object.entries(users)) {
    for (const [field, value] of Object.entries({
      userName: "Synthetic " + role, userRole: role, userEmail: user.email, userPasscode: user.passcode,
    })) a.fill('[data-user-field="' + field + '"]', value);
    await a.click('[data-auth-action="create-user"]');
  }
  await nav("meetings");
  await a.form('[data-meetings-create="meeting"]', {title:"Synthetic Boards linkage meeting",
    scheduled_start:"2026-12-15T18:00:00-07:00", location:"Synthetic chamber", meeting_type:"regular"});
  const meeting = JSON.parse(document.querySelector("[data-meetings-result]").textContent);
  if (!meeting.id) throw Error("Meeting creation did not return an ID.");
  await signOut();
  await record("anonymous-native-denial", async () => {}, async () =>
    await denied("boards") && await denied("contracts") && await denied("procurement"));
  await signIn("clerk", users.clerk);
  await nav("boards");
  let board, member;
  await record("clerk-boards-roster-vacancy-and-term", async () => {
    await save("create-board", {board_name:"Synthetic Parks Board", liaison:"Synthetic Liaison"});
    board = (await native("boards")).boards.find(row => row.board_name === "Synthetic Parks Board");
    await save("save-seat", {board_id:board.board_id, seat_name:"Seat A", member_name:"Synthetic Member",
      term_start:"2026-01-01", term_end:"2028-12-31"});
    await save("save-seat", {board_id:board.board_id, seat_name:"Seat B", member_name:"", term_start:"", term_end:""});
    member = (await native("boards")).seats.find(row => row.member_name === "Synthetic Member");
  }, () => member && workspace().textContent.includes("Seat B") && /vacant/i.test(workspace().textContent)
    && workspace().textContent.includes("2028-12-31"));
  await record("clerk-boards-attendance-and-meeting-link", async () => {
    await save("save-attendance", {seat_id:member.id, meeting_id:meeting.id, present:"true"});
    await a.click('[data-municipal-link="meetings"][data-id="' + meeting.id + '"]');
    await a.until(() => document.querySelector("[data-meetings-result]")?.textContent.includes(meeting.id), 45000);
  }, () => document.querySelector("[data-meetings-result]").textContent.includes(meeting.title));
  await record("clerk-contracts-and-procurement-denial", async () => {}, async () =>
    await denied("contracts") && await denied("procurement"));
  await signOut();
  await signIn("city-staff", users["city-staff"]);
  await nav("procurement");
  let solicitation;
  await record("staff-rfp-and-proposal-comparison", async () => {
    await save("save-rfp", {title:"Synthetic landscape RFP", procurement_type:"Services", city_need:"Synthetic park service"});
    solicitation = (await native("procurement")).drafts.find(row => row.procurement_title === "Synthetic landscape RFP");
    await save("save-proposal", {vendor_name:"Synthetic Vendor A", summary:"Landscape care", staff_score:83, staff_exceptions:"Weather exclusions"});
    await save("save-proposal", {vendor_name:"Synthetic Vendor B", summary:"Alternative care", staff_score:72, staff_exceptions:""});
  }, () => /RFP outline/.test(workspace().textContent) && /Weather exclusions/.test(workspace().textContent)
    && /83\s*\/\s*100/.test(workspace().textContent) && /72\s*\/\s*100/.test(workspace().textContent));
  const id = solicitation.draft_id;
  const proposal = (await native("procurement")).proposals.find(row => row.solicitation_id === id && row.vendor_name === "Synthetic Vendor A");
  await record("city-staff-cannot-record-award", async () => {}, async () =>
    !workspace().querySelector('[data-municipal-form="record-award"]')
    && await denied("record-award", {id,payload:{proposal_id:proposal.id,decision_reference:"Denied synthetic",decision_note:"Denied synthetic"}})
    && await denied("create-draft-contract", {id}));
  await signOut();
  await signIn("local-admin", window.__auditAccount);
  await nav("procurement");
  let contract;
  await record("administrator-award-and-idempotent-contract-link", async () => {
    await save("record-award", {proposal_id:proposal.id, decision_reference:"Synthetic minute 42", decision_note:"Staff entered an existing decision."});
    await save("create-draft-contract");
    const retry = await native("create-draft-contract", {id});
    const linked = (await native("contracts")).filter(row => row.procurement_id === id);
    if (linked.length !== 1 || linked[0].id !== retry.id || linked[0].status !== "draft") throw Error("Draft retry changed identity.");
    contract = linked[0];
    await a.click('[data-municipal-link="contracts"][data-id="' + contract.id + '"]');
    await a.until(() => !!workspace()?.querySelector('[data-contract-record="' + contract.id + '"]'));
  }, () => workspace().querySelector('[data-contract-record="' + contract.id + '"]').textContent.includes("Draft"));
  await record("contract-link-back-to-source-procurement", async () => {
    await a.click('[data-municipal-link="procurement"][data-id="' + id + '"]');
    await a.until(() => workspace()?.textContent.includes("Synthetic minute 42"));
    await a.click('[data-municipal-link="contracts"][data-id="' + contract.id + '"]');
    await a.until(() => !!workspace()?.querySelector('[data-contract-record="' + contract.id + '"]'));
  }, () => workspace().querySelector('[data-contract-record="' + contract.id + '"]').textContent.includes("Draft"));
  const pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\n";
  const xref = "xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n" + pdf.length + "\n%%EOF\n";
  const agreement = {title:"Synthetic signed park contract", vendor_name:"Synthetic Vendor A", owner:"Synthetic Contract Owner",
    start_date:"2027-01-01", expiration_date:"2027-12-31", renewal_due:"2027-10-01"};
  await record("signed-pdf-and-searchable-renewals", async () => {
    await save("sign-contract", agreement, {document:{name:"synthetic-agreement.pdf", text:pdf+xref, type:"application/pdf"}});
    const record = (await native("contracts")).find(row => row.id === contract.id);
    const document = await native("contract-document", {id:contract.id});
    if (record.status !== "signed" || document.name !== "synthetic-agreement.pdf" || atob(document.content) !== pdf+xref) {
      throw Error("Stored PDF readback differs.");
    }
    const filter = "[data-contract-filter]";
    a.fill(filter, "there is no matching vendor");
    const renewal = [...workspace().querySelectorAll("p[data-keywords]")].find(node => node.textContent.includes(agreement.title));
    if (!renewal?.hidden) throw Error("Search did not hide the renewal row.");
    a.fill(filter, "Synthetic Contract Owner");
    if (renewal.hidden) throw Error("Search did not reveal the renewal row.");
    const createUrl = URL.createObjectURL;
    let downloaded;
    URL.createObjectURL = blob => {
      if (blob.type === "application/pdf") downloaded = blob;
      return createUrl.call(URL, blob);
    };
    try {
      await a.click('[data-contract-document="' + contract.id + '"]');
      await a.until(() => !!downloaded, 15000);
      if (await downloaded.text() !== pdf+xref) throw Error("Download blob differs from signed document.");
    } finally {
      URL.createObjectURL = createUrl;
    }
  }, () => workspace().textContent.includes("2027-10-01") && workspace().textContent.includes("synthetic-agreement.pdf")
    && !document.querySelector("[data-municipal-message]").textContent.includes("verification"));
  await signOut();
  await signIn("city-staff", users["city-staff"]);
  await nav("contracts");
  await record("city-staff-standalone-contract-register", async () => {
    await save("register-contract", {...agreement,title:"Synthetic direct register agreement"},
      {document:{name:"synthetic-direct.pdf",text:pdf+xref,type:"application/pdf"}});
  }, async () => (await native("contracts")).some(row =>
    row.title==="Synthetic direct register agreement" && row.status==="signed" && !row.procurement_id));
  return {passed: result.every(row => row.pass), rows: result, meeting_id:meeting.id, board_id:board.board_id,
    solicitation_id:id, contract_id:contract.id, pdf_name:"synthetic-agreement.pdf"};
})()
