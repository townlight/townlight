'use strict';

export function createUleFixtureConfig() {
  const actors = {
    administrator: {
      name: 'Fictional Audit Administrator',
      email: 'audit-admin@example.invalid',
      passcode: 'Audit-fixture-2026-11-04!',
      role: 'local-admin'
    },
    clerk: {
      name: 'Synthetic Clerk Rowan',
      email: 'clerk-rowan@example.invalid',
      passcode: 'Synthetic-clerk-2026!',
      role: 'clerk'
    },
    official: {
      name: 'Synthetic Official Marlow',
      email: 'official-marlow@example.invalid',
      passcode: 'Synthetic-official-2026!',
      role: 'city-staff'
    },
    communicationsApprover: {
      name: 'Synthetic Communications Approver Vale',
      email: 'communications-approver-vale@example.invalid',
      passcode: 'Synthetic-comms-2026!',
      role: 'city-staff'
    },
    unauthorized: {
      name: 'Synthetic Records Viewer Quinn',
      email: 'records-viewer-quinn@example.invalid',
      passcode: 'Synthetic-records-2026!',
      role: 'records-staff'
    }
  };

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  startsAt.setSeconds(0, 0);

  const utility = {
    categoryCode: 'ule-payment-options',
    policy: {
      policy_id: 'ule-payment-options',
      version: 1,
      title: 'Synthetic utility payment options',
      text: 'Fictional approved options: a three-cycle payment arrangement or a cashier appointment. No payment processing occurs in this fixture.',
      citation: 'Synthetic Utility Payment Options Policy Section 2, version 1',
      approved: true
    },
    description: 'Fictional resident question about utility payment options.',
    body: 'A helpful fictional response: call 555-0100 to request the same three-cycle arrangement or a cashier appointment. No payments are processed here.',
    privateNotes: 'utility-private-canary-7Q2L',
    approverName: actors.clerk.name
  };

  const library = {
    fields: {
      title: 'Synthetic library reading program',
      starts_at: startsAt.toISOString(),
      location: 'Synthetic Main Hall',
      description: 'Fictional public reading program details for fixture testing.'
    },
    privateNotes: 'library-private-canary-4M8R'
  };

  const elections = {
    v1: {
      fields: {
        title: 'Synthetic election checklist',
        jurisdiction: 'Synthetic Townlight City',
        election: 'Fictional December election',
        official_source: 'https://elections.example.invalid/checklist/version-1',
        source_version: 'Synthetic official version 1',
        description: 'Fictional checklist: Confirm the Example Hall location at 100 Synthetic Way.'
      },
      privateNotes: 'election-v1-private-canary-9T3K'
    },
    v2: {
      fields: {
        title: 'Synthetic election checklist',
        jurisdiction: 'Synthetic Townlight City',
        election: 'Fictional December election',
        official_source: 'https://elections.example.invalid/checklist/version-2',
        source_version: 'Synthetic official version 2',
        description: 'Fictional checklist: Correct the location to Example Annex at 200 Synthetic Way.'
      },
      privateNotes: 'election-v2-private-canary-6B1N'
    }
  };

  return { actors, utility, library, elections };
}
