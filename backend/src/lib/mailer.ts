import nodemailer from 'nodemailer'
import { env } from './env.js'

/** Messages "sent" while testing, so tests can read reset links. */
export const testMailbox: { to: string; subject: string; text: string }[] = []

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null

/** Fire-and-forget: mail failures must never fail an order. Without SMTP_URL, messages are logged. */
export async function sendMail(to: string, subject: string, text: string) {
  try {
    if (env.NODE_ENV === 'test') testMailbox.push({ to, subject, text })
    if (!transport) {
      if (env.NODE_ENV !== 'test') console.log(`[mail] to=${to} subject="${subject}"\n${text}\n`)
      return
    }
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text })
  } catch (error) {
    console.error('mail failed', error)
  }
}
