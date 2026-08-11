'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'wicky_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

/**
 * Constant-time comparison of a submitted password against ADMIN_PASSWORD.
 */
function checkPassword(submitted) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof submitted !== 'string') return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * `netlify dev` sets NETLIFY_DEV=true and typically serves over plain
 * HTTP; the Secure cookie attribute strictly requires HTTPS transport, so
 * it's omitted there to keep local login working, and always included
 * everywhere else (Netlify's actual deploys are always HTTPS).
 */
function secureAttr() {
  return process.env.NETLIFY_DEV === 'true' ? '' : ' Secure;';
}

function createSessionCookie() {
  const token = jwt.sign({ role: 'admin' }, getSessionSecret(), { expiresIn: SESSION_TTL_SECONDS });
  return `${COOKIE_NAME}=${token}; HttpOnly;${secureAttr()} SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly;${secureAttr()} SameSite=Strict; Path=/; Max-Age=0`;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

/**
 * Returns true if the incoming request event carries a valid session cookie.
 */
function isAuthenticated(event) {
  const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    jwt.verify(token, getSessionSecret());
    return true;
  } catch {
    return false;
  }
}

module.exports = { checkPassword, createSessionCookie, clearSessionCookie, isAuthenticated, COOKIE_NAME };
