'use strict';

const { checkPassword, createSessionCookie } = require('./lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON body' }) };
  }

  if (!checkPassword(body.password)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'incorrect password' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Set-Cookie': createSessionCookie(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
