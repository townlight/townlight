import assert from 'node:assert/strict'

export async function loseUtilityApprovalAck(native, { requestId, expectedRevision }) {
  assert.equal(typeof native, 'function', 'native must be the actual typed bridge function')

  const raw = await native('utilities_request', {
    request: {
      operation: 'approve-reply',
      request_id: requestId,
      payload: {
        expected_revision: expectedRevision,
        confirm: true,
      },
    },
  })

  const result = raw?.result ?? raw

  assert.equal(result?.delivered, true)
  assert.equal(result?.receipt?.request_id, requestId)
  assert.ok(
    typeof result?.receipt?.comment_id === 'string' && result.receipt.comment_id.length > 0,
  )
  assert.ok(
    typeof result?.workpaper?.idempotency_key === 'string' &&
      result.workpaper.idempotency_key.length > 0,
  )

  const error = new Error('Simulated test caller acknowledgement timeout after committed reply')
  error.simulatedAcknowledgementLoss = true
  throw error
}