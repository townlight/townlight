import { startUleHosted } from './ule-hosted-start.mjs';
import { uleWorkflows } from './ule-workflows.mjs';
import { verifyUtilityPublic } from './ule-utility-public.mjs';
import { downloadRecordsAttachment } from './community-workflows.mjs';

export async function runUleHosted(config) {
  const setup = await startUleHosted(config);
  const result = await uleWorkflows({
    ...config,
    ...setup,
    page: config.getPage(),
    downloadRecordsAttachment
  });

  for (const context of result.utilities) {
    const actualsafeResult = await verifyUtilityPublic({
      context,
      portalBaseUrl: config.portalBaseUrl,
      captureMessage: setup.captureMessage
    });
    await config.save('ule-utility-post-desktop-restart-' + context.requestId, actualsafeResult);
  }

  await config.save('ule-outcome', {
    passed: true,
    utilityRequestIds: result.utilities.map(x => x.requestId),
    librarySourceId: result.publications.library.source.id,
    electionsSourceId: result.publications.elections.v1.source.id,
    recoverySnapshot: 'ule-recovery.json'
  });

  return result;
}