// 10JUN2026 client video Item 2 — Orlando: "when the approver is
// selected, it should send an email to the approver".
//
// 17JUN2026 — migrated from SMTP Basic Auth (Office 365 was blocking
// the tenant-level via Conditional Access / Security Defaults — see
// the 12-15JUN email thread) to Microsoft Graph with OAuth2 client-
// credentials flow. Dan from Callmax IT set up an Entra app
// registration scoped to harmonydr@callmaxsolutions.com only via an
// Application Access Policy, so even if the client_secret leaks the
// app can only send AS harmonydr@ — never as any other mailbox.
//
// Required env (in backend/.env on the server):
//   GRAPH_TENANT_ID
//   GRAPH_CLIENT_ID
//   GRAPH_CLIENT_SECRET
//   GRAPH_SEND_AS         (sender mailbox, defaults to harmonydr@callmaxsolutions.com)
//
// When any of those are missing the module falls back to in-app-only
// notifications (the previous behavior) — workflow keeps working,
// just no outbound email.

import { query } from '../config/db.js'

const GRAPH_TENANT_ID     = process.env.GRAPH_TENANT_ID
const GRAPH_CLIENT_ID     = process.env.GRAPH_CLIENT_ID
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET
const GRAPH_SEND_AS       = process.env.GRAPH_SEND_AS || 'harmonydr@callmaxsolutions.com'

// ---------------------------------------------------------------------------
// MSAL client (lazy) — acquires Graph access tokens via client-credentials.
// ---------------------------------------------------------------------------

let msalClient = null
let cachedToken = null
let tokenExpiresAt = 0  // ms epoch

async function getMsalClient() {
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) return null
  if (msalClient) return msalClient
  try {
    const msal = await import('@azure/msal-node')
    const Cls = msal.ConfidentialClientApplication || msal.default?.ConfidentialClientApplication
    if (!Cls) throw new Error('@azure/msal-node missing ConfidentialClientApplication')
    msalClient = new Cls({
      auth: {
        clientId: GRAPH_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${GRAPH_TENANT_ID}`,
        clientSecret: GRAPH_CLIENT_SECRET,
      },
    })
    return msalClient
  } catch (err) {
    console.warn('[notifyApprover] @azure/msal-node not installed — falling back to in-app notifications.', err?.message || err)
    return null
  }
}

async function getAccessToken() {
  const now = Date.now()
  // Reuse cached token while it has 60+ seconds left.
  if (cachedToken && tokenExpiresAt > now + 60_000) return cachedToken
  const client = await getMsalClient()
  if (!client) return null
  try {
    const result = await client.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    })
    if (!result?.accessToken) return null
    cachedToken = result.accessToken
    tokenExpiresAt = result.expiresOn ? new Date(result.expiresOn).getTime() : now + 50 * 60_000
    return cachedToken
  } catch (err) {
    console.warn('[notifyApprover] token acquisition failed:', err?.message || err)
    return null
  }
}

async function sendEmailViaGraph({ to, subject, body }) {
  const token = await getAccessToken()
  if (!token) return { sent: false, reason: 'no-token' }
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_SEND_AS)}/sendMail`
  const payload = {
    message: {
      subject,
      body: { contentType: 'Text', content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    // Graph /sendMail returns 202 Accepted on success.
    if (res.status === 202 || res.status === 200) {
      return { sent: true, status: res.status }
    }
    const text = await res.text().catch(() => '')
    return { sent: false, reason: `http-${res.status}`, errText: text.slice(0, 500) }
  } catch (err) {
    return { sent: false, reason: 'fetch-error', errText: err?.message || String(err) }
  }
}

// ---------------------------------------------------------------------------
// Public API — same shape as before so call sites don't change.
// ---------------------------------------------------------------------------

/**
 * Notify the approver that a record needs their decision.
 *
 *   notifyApprover({ approverId, type: 'leave'|'payroll_input', recordRef, subject })
 *
 * - Always inserts an in-app notification row (table: notifications) so
 *   the approver sees the badge in the app.
 * - Sends an actual email via Microsoft Graph when GRAPH_* env vars +
 *   @azure/msal-node are available.
 * - Returns { emailed, notified, reason? } so callers can log / decide.
 */
export async function notifyApprover({ approverId, type, recordRef, subject, body }) {
  if (!approverId) return { emailed: false, notified: false }
  const title = subject || `Action needed: ${type === 'leave' ? 'Leave request' : 'Payroll input'} ${recordRef || ''}`
  const msg = body || `You've been assigned as the approver on ${type === 'leave' ? 'leave request' : 'payroll input'} ${recordRef || ''}. Please review and set the approval status in the HRMS app.`

  let notified = false
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [approverId, `${type}_approval_pending`, title, msg, JSON.stringify({ recordRef })],
    )
    notified = true
  } catch (err) {
    console.warn('[notifyApprover] in-app notification insert failed:', err?.message || err)
  }

  let emailed = false
  let reason
  try {
    const userRes = await query(
      `SELECT email, company_email FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1`,
      [approverId],
    )
    const to = userRes.rows[0]?.company_email || userRes.rows[0]?.email
    if (!to) {
      reason = 'no-recipient-email'
    } else {
      const result = await sendEmailViaGraph({ to, subject: title, body: msg })
      if (result.sent) {
        emailed = true
      } else {
        reason = result.reason
        if (result.errText) {
          console.warn(`[notifyApprover] Graph sendMail failed (${result.reason}): ${result.errText}`)
        } else if (!GRAPH_TENANT_ID) {
          console.log(`[notifyApprover] Graph not configured — would email approver=${approverId}: ${title}`)
        }
      }
    }
  } catch (err) {
    reason = 'unexpected'
    console.warn('[notifyApprover] email send failed:', err?.message || err)
  }

  return { emailed, notified, reason }
}

// Standalone Graph send (no DB lookup) — used by the deploy-time test
// script to verify SMTP/Graph from the command line.
export { sendEmailViaGraph }
