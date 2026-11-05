/**
 * @file Review sheet for `bubbleagent://review?p=<base64url>`: a payment an
 * external agent (MCP) asks the user to approve. Same translucent sheet as
 * `ask`; the payload is decoded and re-validated on the device there.
 */
export { default } from './ask';
