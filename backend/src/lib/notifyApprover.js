// 10JUN2026 client video Item 2 — Orlando: "when the approver is
// selected, it should send an email to the approver". Real SMTP creds
// aren't configured in this environment yet (existing TODO at
// payroll-calculator.js:991 confirms that), so this is a thin layer
// that's hooked into the right call sites today and will start
// actually sending the moment SMTP_HOST / SMTP_USER are set on the
// server. Until then it logs and stores an in-app notification so
// the approver still gets notified — just inside the app, not by email.
//
// To turn email on: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM in backend/.env and (optionally) `npm i nodemailer`. The
// real send path is gated on those env vars so this file is a no-op
// for the path that didn't request real send.

import { query } from '../config/db.js'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@callmaxsolutions.com'

let mailer = null
async function getMailer() {
  if (!SMTP_HOST) return null
  if (mailer) return mailer
  try {
    const nodemailer = await import('nodemailer')
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    })
    return mailer
  } catch (err) {
    console.warn('[notifyApprover] nodemailer not installed — falling back to log+in-app notification.', err?.message || err)
    return null
  }
}

/**
 * Notify the approver that a record needs their decision.
 *
 *   notifyApprover({ approverId, type: 'leave'|'payroll_input', recordRef, subject })
 *
 * - Always inserts an in-app notification row (table: notifications) so
 *   the approver sees the badge in the app.
 * - Sends an actual email if SMTP_HOST is set and nodemailer is installed.
 * - Returns { emailed: boolean, notified: boolean }.
 */
export async function notifyApprover({ approverId, type, recordRef, subject, body }) {
  if (!approverId) return { emailed: false, notified: false }
  const title = subject || `Action needed: ${type === 'leave' ? 'Leave request' : 'Payroll input'} ${recordRef || ''}`
  const msg = body || `You've been assigned as the approver on ${type === 'leave' ? 'leave request' : 'payroll input'} ${recordRef || ''}. Please review and set the approval status.`

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
  const transport = await getMailer()
  if (transport) {
    try {
      const userRes = await query(
        `SELECT email, company_email FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         WHERE u.id = $1`,
        [approverId],
      )
      const to = userRes.rows[0]?.company_email || userRes.rows[0]?.email
      if (to) {
        await transport.sendMail({
          from: SMTP_FROM,
          to,
          subject: title,
          text: msg,
        })
        emailed = true
      }
    } catch (err) {
      console.warn('[notifyApprover] email send failed:', err?.message || err)
    }
  } else {
    console.log(`[notifyApprover] SMTP not configured — would email approver=${approverId}: ${title}`)
  }

  return { emailed, notified }
}
