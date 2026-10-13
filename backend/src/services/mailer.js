import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
export const testMailbox = []
const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null
export async function sendMail(to, subject, text) {
  try {
    if (env.NODE_ENV === 'test')
      testMailbox.push({
        to,
        subject,
        text,
      })
    if (!transport) {
      if (env.NODE_ENV !== 'test') console.log(`[mail] to=${to} subject="${subject}"\n${text}\n`)
      return
    }
    await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      text,
    })
  } catch (error) {
    console.error('mail failed', error)
  }
}
