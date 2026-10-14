import './setup.js'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { readAccessToken, readRefreshToken, signAccessToken, signRefreshToken } from '../src/services/auth.js'
import { hashPassword, needsRehash, verifyPassword } from '../src/services/passwords.js'
import { requireHttps } from '../src/middleware/https.js'
describe('password storage', () => {
  it('stores a salted, peppered bcrypt hash, never the password', async () => {
    const a = await hashPassword('123456')
    const b = await hashPassword('123456')
    assert.ok(a.startsWith('v2$$2'), 'versioned bcrypt format')
    assert.notEqual(a, b, 'each hash has its own salt')
    assert.ok(!a.includes('123456'))
    assert.equal(await verifyPassword('123456', a), true)
    assert.equal(await verifyPassword('1234567', a), false)
    assert.equal(needsRehash(a), false)
  })
  it('a database leak alone is not enough: hashes made without the server pepper do not verify', async () => {
    const attacker = 'v2$' + (await bcrypt.hash(createHmac('sha256', 'a-different-pepper-value').update('123456').digest('base64'), 4))
    assert.equal(await verifyPassword('123456', attacker), false)
    const noPepper = 'v2$' + (await bcrypt.hash('123456', 4))
    assert.equal(await verifyPassword('123456', noPepper), false)
  })
  it('still accepts older plain-bcrypt hashes and flags them for upgrade', async () => {
    const legacy = await bcrypt.hash('OldPassword#1', 4)
    assert.equal(await verifyPassword('OldPassword#1', legacy), true)
    assert.equal(await verifyPassword('nope', legacy), false)
    assert.equal(needsRehash(legacy), true)
  })
  it("does not ignore characters past bcrypt's 72-byte limit", async () => {
    const base = 'x'.repeat(80)
    const hash = await hashPassword(`${base}A`)
    assert.equal(await verifyPassword(`${base}A`, hash), true)
    assert.equal(await verifyPassword(`${base}B`, hash), false)
  })
})
describe('JWT hardening', () => {
  const claims = {
    sub: 'user-1',
    role: 'ADMIN',
  }
  it('accepts our own tokens', () => {
    assert.deepEqual(
      readAccessToken(
        signAccessToken({
          id: 'user-1',
          role: 'ADMIN',
        }),
      ),
      {
        id: 'user-1',
        role: 'ADMIN',
      },
    )
  })
  it('rejects unsigned, wrong-algorithm, wrong-issuer and wrong-secret tokens', () => {
    assert.equal(
      readAccessToken(
        jwt.sign(claims, '', {
          algorithm: 'none',
          issuer: 'clickmart',
        }),
      ),
      null,
    )
    assert.equal(
      readAccessToken(
        jwt.sign(claims, env.JWT_ACCESS_SECRET, {
          algorithm: 'HS512',
          issuer: 'clickmart',
        }),
      ),
      null,
    )
    assert.equal(
      readAccessToken(
        jwt.sign(claims, env.JWT_ACCESS_SECRET, {
          issuer: 'someone-else',
        }),
      ),
      null,
    )
    assert.equal(
      readAccessToken(
        jwt.sign(claims, 'another-secret-another-secret', {
          issuer: 'clickmart',
        }),
      ),
      null,
    )
    assert.equal(readAccessToken('not.a.token'), null)
  })
  it('issues a refresh JWT that an access token cannot impersonate', () => {
    const refresh = signRefreshToken({ id: 'user-1', role: 'CUSTOMER' }, 'session-1')
    assert.deepEqual(readRefreshToken(refresh), { id: 'user-1', role: 'CUSTOMER', jti: 'session-1' })
    assert.equal(readAccessToken(refresh), null)
    assert.equal(
      readRefreshToken(
        signAccessToken({
          id: 'user-1',
          role: 'CUSTOMER',
        }),
      ),
      null,
    )
    assert.equal(
      readRefreshToken(
        jwt.sign({ sub: 'user-1', role: 'CUSTOMER', jti: 'session-1', typ: 'refresh' }, env.JWT_ACCESS_SECRET, {
          algorithm: 'HS256',
          issuer: 'clickmart',
        }),
      ),
      null,
    )
  })
  it('rejects expired tokens', () => {
    assert.equal(
      readAccessToken(
        jwt.sign(claims, env.JWT_ACCESS_SECRET, {
          issuer: 'clickmart',
          expiresIn: -10,
        }),
      ),
      null,
    )
  })
})
describe('HTTPS enforcement', () => {
  const run = (req) => {
    const out = {
      next: false,
    }
    const res = {
      redirect: (code, url) => (out.redirect = [code, url]),
      status: (code) => ({
        json: () => (out.status = code),
      }),
    }
    requireHttps(req, res, () => (out.next = true))
    return out
  }
  it('lets secure requests and the health check through', () => {
    assert.equal(
      run({
        secure: true,
        method: 'POST',
        path: '/api/v1/auth/login',
      }).next,
      true,
    )
    assert.equal(
      run({
        secure: false,
        method: 'GET',
        path: '/health',
      }).next,
      true,
    )
  })
  it('redirects plain-HTTP page requests and refuses plain-HTTP writes', () => {
    assert.deepEqual(
      run({
        secure: false,
        method: 'GET',
        path: '/x',
        headers: {
          host: 'api.example.com',
        },
        originalUrl: '/x?a=1',
      }).redirect,
      [308, 'https://api.example.com/x?a=1'],
    )
    assert.equal(
      run({
        secure: false,
        method: 'POST',
        path: '/api/v1/auth/login',
        headers: {},
        originalUrl: '/',
      }).status,
      426,
    )
  })
})
