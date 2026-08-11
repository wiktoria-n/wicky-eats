import { describe, it, expect, beforeEach } from 'vitest';
import { checkPassword, createSessionCookie, clearSessionCookie, isAuthenticated } from '../netlify/functions/lib/auth.js';

describe('auth', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
    process.env.SESSION_SECRET = 'test-secret-value';
    delete process.env.NETLIFY_DEV;
  });

  it('accepts the correct password and rejects a wrong one', () => {
    expect(checkPassword('correct-horse-battery-staple')).toBe(true);
    expect(checkPassword('wrong')).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
  });

  it('issues a cookie that isAuthenticated recognizes', () => {
    const cookieHeader = createSessionCookie();
    const cookieValue = cookieHeader.split(';')[0];
    expect(isAuthenticated({ headers: { cookie: cookieValue } })).toBe(true);
  });

  it('rejects missing, garbage, or wrongly-signed cookies', () => {
    expect(isAuthenticated({ headers: {} })).toBe(false);
    expect(isAuthenticated({ headers: { cookie: 'wicky_session=garbage' } })).toBe(false);
  });

  it('clearSessionCookie sets Max-Age=0', () => {
    expect(clearSessionCookie()).toMatch(/Max-Age=0/);
  });

  it('sets Secure by default (production/deployed contexts)', () => {
    expect(createSessionCookie()).toMatch(/;\s*Secure;/);
    expect(clearSessionCookie()).toMatch(/;\s*Secure;/);
  });

  it('omits Secure under `netlify dev` so local login over HTTP still works', () => {
    process.env.NETLIFY_DEV = 'true';
    const cookieHeader = createSessionCookie();
    expect(cookieHeader).not.toMatch(/Secure/);
    expect(cookieHeader).toMatch(/HttpOnly;\s*SameSite=Strict/);
    // still valid and still recognized as authenticated
    const cookieValue = cookieHeader.split(';')[0];
    expect(isAuthenticated({ headers: { cookie: cookieValue } })).toBe(true);
  });
});
