import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createWorker } from '../src/worker.mjs';

const origin = 'https://insight.example.org';
const service = 'https://questions.insight.example.org';
const issuer = 'https://insight-test.cloudflareaccess.com';
const owner = 'owner@example.org';
const id = 'e0f52734-9d8c-43c6-a047-e1bafcb41120';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const keySet = createLocalJWKSet({ keys: [jwk] });
const schema = readFileSync(new URL('../migrations/0001_questions.sql', import.meta.url), 'utf8');
async function token(overrides = {}) {
  const time = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: owner, type: 'app', sub: 'owner-id', iss: issuer, aud: 'test-audience', iat: time, exp: time + 600, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
}
const ownerToken = await token();
function fixture(t, verification = { success: true, hostname: 'insight.example.org', action: 'question' }) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  t.after(() => db.close());
  const binding = { prepare(sql) { return { bind(...values) {
    const statement = db.prepare(sql);
    return { async all() { return { results: statement.all(...values) }; }, async run() { return { meta: { changes: statement.run(...values).changes } }; } };
  } }; } };
  let verificationCalls = 0;
  const env = { DB: binding, SITE_ORIGIN: origin, OWNER_EMAIL: owner, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'test-audience', TURNSTILE_SECRET_KEY: 'server-secret' };
  const worker = createWorker({ resolveKeys: () => keySet, newId: () => id, now: () => '2026-10-03T10:00:00.000Z', fetchRemote: async (url, options) => {
    verificationCalls++;
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.body.get('secret'), 'server-secret');
    return new Response(JSON.stringify(verification), { headers: { 'content-type': 'application/json' } });
  } });
  const request = (path, { method = 'GET', body, headers = {}, ...rest } = {}) => worker.fetch(new Request(service + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), ...rest }), env);
  const submit = (extra = {}, headers = { Origin: origin }) => request('/questions', { method: 'POST', headers, body: { name: 'A reader', question: 'What does it mean to observe a thought?', consent: true, turnstileToken: 'fixture-token', ...extra } });
  const admin = (operation, auth = ownerToken, headers = {}) => request('/admin/api/questions/' + id, { method: 'POST', headers: { Origin: service, 'X-Insight-Admin': '1', ...(auth ? { 'cf-access-jwt-assertion': auth } : {}), ...headers }, body: operation });
  return { db, env, request, submit, admin, verificationCalls: () => verificationCalls };
}

test('Visitors can post and read a question, but cannot set its answer or private fields', async t => {
  const f = fixture(t);
  const posted = await f.submit({ name: '<script>alert(1)</script>' });
  assert.equal(posted.status, 201);
  const response = await f.request('/questions', { headers: { Origin: origin } });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  const data = await response.json();
  assert.equal(data.questions.length, 1);
  assert.equal(data.questions[0].answer, null);
  assert.equal(data.questions[0].name, '<script>alert(1)</script>'); // Stored as text; clients use textContent.
  assert.ok(!('hidden' in data.questions[0]));
  for (const extra of [{ answer: 'A forged answer' }, { hidden: 0 }, { email: 'private@example.org' }, { consent: false }]) {
    assert.equal((await f.submit(extra)).status, 400);
  }
  assert.equal(f.verificationCalls(), 1);
  assert.equal(f.db.prepare('SELECT count(*) AS count FROM questions').get().count, 1);
  assert.equal((await f.request('/questions/' + id + '/answer', { method: 'POST', body: { answer: 'Forged' } })).status, 404);
});

test('Posting requires server-verified Turnstile success, correct hostname, action, and origin', async t => {
  for (const verification of [{ success: false }, { success: true, hostname: 'another.example.org', action: 'question' }, { success: true, hostname: 'insight.example.org', action: 'other' }]) {
    const f = fixture(t, verification);
    assert.equal((await f.submit()).status, 400);
    assert.equal(f.db.prepare('SELECT count(*) AS count FROM questions').get().count, 0);
  }
  const f = fixture(t);
  assert.equal((await f.submit({}, { Origin: 'https://another.example.org' })).status, 403);
  assert.equal((await f.submit({}, {})).status, 403);
  assert.equal(f.verificationCalls(), 0);
  const allowed = await f.request('/questions', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(allowed.status, 204);
  const denied = await f.request('/questions', { method: 'OPTIONS', headers: { Origin: 'https://another.example.org' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('Admin page and writes reject missing, forged, expired, and wrong-account credentials', async t => {
  const f = fixture(t);
  await f.submit();
  for (const path of ['/admin', '/admin/app.js', '/admin/api/questions']) assert.equal((await f.request(path)).status, 401);
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, null, { 'cf-access-authenticated-user-email': owner })).status, 401);
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, 'unsigned.fake.jwt')).status, 401);
  for (const overrides of [{ aud: 'another-app' }, { iss: 'https://wrong.cloudflareaccess.com' }, { exp: 1 }, { email: undefined }, { sub: undefined }]) {
    assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, await token(overrides))).status, 401);
  }
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, await token({ email: 'visitor@example.org' }))).status, 403);
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, await token({ type: 'service' }))).status, 403);
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, ownerToken, { Origin: origin })).status, 403);
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' }, ownerToken, { 'X-Insight-Admin': '' })).status, 403);
  assert.equal(f.db.prepare('SELECT answer FROM questions').get().answer, null);
  f.env.ACCESS_AUD = '';
  assert.equal((await f.admin({ operation: 'answer', answer: 'No' })).status, 503);
});

test('Only a valid owner can publish, edit, hide, and restore an answer', async t => {
  const f = fixture(t);
  await f.submit();
  assert.equal((await f.admin({ operation: 'answer', answer: 'Look at the thought as it arises.' })).status, 200);
  assert.equal((await (await f.request('/questions')).json()).questions[0].answer, 'Look at the thought as it arises.');
  assert.equal((await f.admin({ operation: 'answer', answer: 'A revised answer.' })).status, 200);
  assert.equal((await f.admin({ operation: 'hide' })).status, 200);
  assert.deepEqual((await (await f.request('/questions')).json()).questions, []);
  const ownerList = await f.request('/admin/api/questions', { headers: { 'cf-access-jwt-assertion': ownerToken } });
  assert.equal((await ownerList.json()).questions[0].hidden, 1);
  assert.equal((await f.admin({ operation: 'answer', answer: 'An update while hidden.' })).status, 200);
  assert.deepEqual((await (await f.request('/questions')).json()).questions, []);
  assert.equal((await f.admin({ operation: 'show' })).status, 200);
  const publicItem = (await (await f.request('/questions')).json()).questions[0];
  assert.equal(publicItem.answer, 'An update while hidden.');
  assert.ok(publicItem.answeredAt);
  const page = await f.request('/admin', { headers: { 'cf-access-jwt-assertion': ownerToken } });
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await f.admin({ operation: 'answer', answer: '', question: 'changed question' })).status, 400);
});

test('Public pagination omits hidden questions and returns each visible question once', async t => {
  const f = fixture(t);
  for (let index = 0; index < 25; index++) f.db.prepare('INSERT INTO questions(id,name,question,created_at,hidden) VALUES (?,?,?,?,?)').run(String(index).padStart(36, '0'), '', 'A longer test question', '2026-10-03T10:00:00.000Z', index === 24 ? 1 : 0);
  const first = await (await f.request('/questions')).json();
  const second = await (await f.request('/questions?cursor=' + encodeURIComponent(first.nextCursor))).json();
  assert.equal(first.questions.length, 20);
  assert.equal(second.questions.length, 4);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.questions, ...second.questions].map(q => q.id)).size, 24);
});

test('The request-size limit rejects large payloads while allowing a Unicode owner answer', async t => {
  const f = fixture(t);
  assert.equal((await f.submit({ question: 'x'.repeat(70000) })).status, 413);
  assert.equal(f.verificationCalls(), 0);
  await f.submit();
  const answer = 'अ'.repeat(12000);
  assert.equal((await f.admin({ operation: 'answer', answer })).status, 200);
  assert.equal(f.db.prepare('SELECT answer FROM questions').get().answer, answer);
});
