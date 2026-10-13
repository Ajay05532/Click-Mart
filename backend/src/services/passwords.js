import { createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
const VERSION = 'v2$'
const COST = 12
const prehash = (password) => createHmac('sha256', env.PASSWORD_PEPPER).update(password).digest('base64')
export const hashPassword = async (password) => VERSION + (await bcrypt.hash(prehash(password), COST))
export async function verifyPassword(password, stored) {
  if (stored.startsWith(VERSION)) return bcrypt.compare(prehash(password), stored.slice(VERSION.length))
  return bcrypt.compare(password, stored)
}
export const needsRehash = (stored) => !stored.startsWith(VERSION)
const DUMMY = bcrypt.hashSync('not-a-real-password', COST)
export const burnTime = (password) => bcrypt.compare(password, DUMMY)
