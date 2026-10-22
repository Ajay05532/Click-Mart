import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

/** Emails "sent" while NODE_ENV=test, newest last. */
export const testMailbox = []

const smtp = !env.RESEND_API_KEY && env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null
export const mailProvider = env.RESEND_API_KEY ? 'resend' : smtp ? 'smtp' : 'console'

/**
 * Sends one email. `options.html` is the designed version, `text` the plain one every client can show.
 * `options.idempotencyKey` stops Resend from sending the same email twice within 24 hours.
 * Never throws: a failed email must not undo the order, sign-up or reply that triggered it.
 */
export async function sendMail(to, subject, text, options = {}) {
  const message = { to, subject, text, html: options.html, replyTo: options.replyTo ?? env.MAIL_REPLY_TO }
  try {
    if (env.NODE_ENV === 'test') {
      testMailbox.push(message)
      return { ok: true }
    }
    if (mailProvider === 'resend') return await sendWithResend(message, options.idempotencyKey)
    if (smtp) {
      await smtp.sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      })
      return { ok: true }
    }
    console.log(`[mail] to=${to} subject="${subject}"\n${text}\n`)
    return { ok: true, logged: true }
  } catch (error) {
    console.error(`mail failed to=${to} subject="${subject}":`, error instanceof Error ? error.message : error)
    return { ok: false }
  }
}

async function sendWithResend(message, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    // 403 from the test sender means the address is not your Resend account email: verify a domain to email anyone.
    console.error(`mail failed (Resend ${response.status}) to=${message.to} subject="${message.subject}": ${(await response.text()).slice(0, 300)}`)
    return { ok: false, status: response.status }
  }
  const data = await response.json().catch(() => ({}))
  return { ok: true, id: data.id }
}
