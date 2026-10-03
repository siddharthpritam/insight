import test from 'node:test';
import assert from 'node:assert/strict';
import { setupOwnerAccess, checkApplication, ACCOUNT_ID, APP_NAME, HOST, OWNER_EMAIL } from './setup-owner-access.mjs';

const appId = '11111111-1111-4111-8111-111111111111';
const idpId = '22222222-2222-4222-8222-222222222222';
const policy = { decision: 'allow', include: [{ email: { email: OWNER_EMAIL } }], exclude: [], require: [] };
const ownerApp = { id: appId, name: APP_NAME, type: 'self_hosted', domain: HOST + '/admin', destinations: [{ type: 'public', uri: HOST + '/admin' }, { type: 'public', uri: HOST + '/admin/*' }], allowed_idps: [idpId], aud: 'a'.repeat(64) };

function cloud({ existing = false, org = true, failure, additionalApps = [] } = {}) {
  const calls = [];
  const fetchRemote = async (url, request) => {
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, 'Bearer test-token');
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.cloudflare.com');
    assert.ok(parsed.pathname.startsWith('/client/v4/accounts/' + ACCOUNT_ID + '/access/'));
    const path = parsed.pathname.split('/access')[1];
    calls.push({ path, method: request.method, body: request.body ? JSON.parse(request.body) : null });
    if (failure) return Response.json({ success: false, errors: [{ code: 10000, message: 'SECRET_MUST_NOT_BE_LOGGED' }] }, { status: failure });
    let result;
    if (path === '/apps' && request.method === 'GET') result = [...additionalApps, ...(existing ? [ownerApp] : [])];
    else if (path === '/organizations') {
      if (!org && request.method === 'GET') return Response.json({ success: false, errors: [{ code: 9999, message: 'access.api.error.not_enabled: Access is not enabled.' }] }, { status: 403 });
      if (request.method === 'POST') assert.equal(calls.at(-1).body.auth_domain, 'insight-siddharth.cloudflareaccess.com');
      result = { auth_domain: 'insight-test.cloudflareaccess.com' };
    } else if (path === '/identity_providers') result = request.method === 'POST' ? { id: idpId, type: 'onetimepin' } : existing ? [{ id: idpId, type: 'onetimepin' }] : [];
    else if (path === '/apps' && request.method === 'POST') {
      assert.equal(calls.at(-1).body.policies.length, 1);
      assert.deepEqual(calls.at(-1).body.policies[0].include, policy.include);
      assert.deepEqual(calls.at(-1).body.destinations, ownerApp.destinations);
      result = ownerApp;
    } else if (path === '/apps/' + appId) result = ownerApp;
    else if (path === '/apps/' + appId + '/policies') result = [policy];
    else throw new Error('Unexpected API request: ' + path);
    return Response.json({ success: true, result, ...(Array.isArray(result) ? { result_info: { total_pages: 1 } } : {}) });
  };
  return { calls, fetchRemote };
}

test('setup creates only Access resources and returns only public identifiers', async () => {
  const mock = cloud({ org: false });
  const result = await setupOwnerAccess({ token: 'test-token', fetchRemote: mock.fetchRemote, log: () => {} });
  assert.deepEqual(Object.keys(result), ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'applicationId']);
  assert.deepEqual(mock.calls.filter(c => c.method === 'POST').map(c => c.path), ['/organizations', '/identity_providers', '/apps']);
});

test('reruns verify existing settings without changing them', async () => {
  const mock = cloud({ existing: true });
  await setupOwnerAccess({ token: 'test-token', fetchRemote: mock.fetchRemote, log: () => {} });
  assert.ok(mock.calls.every(c => c.method === 'GET'));
});

test('missing or insufficient permission never attempts a mutation or echoes API text', async () => {
  const mock = cloud({ failure: 403 });
  await assert.rejects(setupOwnerAccess({ fetchRemote: mock.fetchRemote }), /repository secret/);
  assert.equal(mock.calls.length, 0);
  await assert.rejects(setupOwnerAccess({ token: 'test-token', fetchRemote: mock.fetchRemote }), error => error.message.includes('HTTP 403') && !error.message.includes('SECRET_MUST_NOT_BE_LOGGED'));
  assert.ok(mock.calls.every(c => c.method === 'GET'));
});

test('conflicting access rules stop setup before any mutation', async () => {
  for (const domain of [HOST + '/admin/api', '*.siddharthpritam.com', HOST]) {
    const mock = cloud({ additionalApps: [{ id: 'unrelated', name: 'Existing application', domain }] });
    await assert.rejects(setupOwnerAccess({ token: 'test-token', fetchRemote: mock.fetchRemote }), /Another Access application/);
    assert.ok(mock.calls.every(c => c.method === 'GET'));
  }
});

test('public paths, bypasses, extra login methods and non-owner access fail verification', () => {
  checkApplication(ownerApp, [policy], idpId);
  assert.throws(() => checkApplication({ ...ownerApp, destinations: [{ type: 'public', uri: HOST }] }, [policy], idpId));
  assert.throws(() => checkApplication({ ...ownerApp, destinations: ownerApp.destinations.map(d => ({ ...d, overrides: [{ behavior: 'public', path_pattern: '*' }] })) }, [policy], idpId));
  assert.throws(() => checkApplication({ ...ownerApp, allowed_idps: [idpId, 'extra'] }, [policy], idpId));
  assert.throws(() => checkApplication(ownerApp, [policy, { decision: 'bypass', include: [{ everyone: {} }] }], idpId));
  assert.throws(() => checkApplication(ownerApp, [{ ...policy, include: [{ email: { email: 'someone-else@example.com' } }] }], idpId));
  assert.throws(() => checkApplication(ownerApp, [{ ...policy, include: [{ email_domain: { domain: 'gmail.com' } }] }], idpId));
});
