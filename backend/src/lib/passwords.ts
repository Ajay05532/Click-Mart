import { createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from './env.js'

/**
 * Password storage: bcrypt over HMAC-SHA256(password, PASSWORD_PEPPER).
 *  - bcrypt is slow and salted, so each password must be guessed one at a time.
 *  - The pepper lives in the server's environment, not the database, so stolen database rows alone are useless.
 *  - Pre-hashing to a fixed 44-character string also avoids bcrypt silently ignoring everything after 72 bytes.
 * Stored form: "v2$" + bcrypt hash. Older hashes (plain bcrypt, no prefix) still verify and are upgraded on login.
 */
const VERSION = 'v2$'
const COST = 12

const prehash = (password: string) => createHmac('sha256', env.PASSWORD_PEPPER).update(password).digest('base64')

export const hashPassword = async (password: string) => VERSION + (await bcrypt.hash(prehash(password), COST))

export async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith(VERSION)) return bcrypt.compare(prehash(password), stored.slice(VERSION.length))
  return bcrypt.compare(password, stored) // legacy, e.g. accounts created with the SQL helper
}

export const needsRehash = (stored: string) => !stored.startsWith(VERSION)

// Compared against when the email is unknown, so a missing account takes as long as a wrong password.
const DUMMY = bcrypt.hashSync('not-a-real-password', COST)
export const burnTime = (password: string) => bcrypt.compare(password, DUMMY)
