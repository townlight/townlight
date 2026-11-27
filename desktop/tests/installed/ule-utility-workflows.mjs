import { createUtilityCategory, registerUtilityPolicy } from './ule-utility-fixture.mjs';
import { installedUtilityResident } from './resident-311.mjs';
import { openUtilityRequest, saveUtilityDraft } from './ule-utilities.mjs';

export async function prepareUleUtility({page,native,residentPage,portalBaseUrl,switchActor,categoryCode,policy,description,body,privateNotes,save}) {
  await switchActor('administrator');
  await createUtilityCategory(page, categoryCode);
  await registerUtilityPolicy(page, policy);
  const resident = await installedUtilityResident({native,portalBaseUrl,categoryCode,description,...(residentPage?{page:residentPage}:{})});
  const requestId = resident.evidence.requestId;
  await switchActor('clerk');
  await openUtilityRequest(page, {requestId});
  await saveUtilityDraft(page, {requestId,policyId:policy.policy_id,policyVersion:policy.version,body,privateNotes});
  if (save) await save('ule-utilities-private-draft', {requestId,policyId:policy.policy_id,policyVersion:policy.version});
  return {requestId,resident,policy,description,body,privateNotes};
}