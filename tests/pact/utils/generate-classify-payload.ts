/**
 * Test payload helpers for Service C.
 *
 * Reusable functions to build test request payloads.
 */

export const generateClassifyPayload = (text: string = 'server is down and unresponsive') => ({
  text,
})

export const classifyPayloads = {
  critical: generateClassifyPayload('server is down and unresponsive'),
  warning: generateClassifyPayload('disk usage at 85%, approaching threshold'),
  info: generateClassifyPayload('deployment completed successfully'),
  ok: generateClassifyPayload('all systems operational'),
}
