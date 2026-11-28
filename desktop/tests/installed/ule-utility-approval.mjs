import assert from 'node:assert/strict'
import { approveUtilityReply, readUtilityWorkpaper } from './ule-utilities.mjs'
import { loseUtilityApprovalAck } from './ule-lost-ack.mjs'

export async function approveUleUtility({
  page,
  native,
  context,
  approverName,
  lostAcknowledgement = false,
}) {
  const args = {
    requestId: context.requestId,
    body: context.body,
    privateNotes: context.privateNotes,
    policyCitation: context.policy.citation,
    approverName,
  }

  if (!lostAcknowledgement) {
    const delivered = await approveUtilityReply(page, args)
    assert.equal(delivered.delivered, true)
  } else {
    const nativeResponse = await native('utilities_request', {
      request: {
        operation: 'open-request',
        request_id: context.requestId,
      },
    })

    const result = nativeResponse?.result ?? nativeResponse

    let caught
    try {
      await loseUtilityApprovalAck(native, {
        requestId: context.requestId,
        expectedRevision: result.workpaper.revision,
      })
    } catch (error) {
      caught = error
    }

    assert.equal(caught?.simulatedAcknowledgementLoss, true)
  }

  return readUtilityWorkpaper(page, { ...args, delivered: true })
}