// Run only with a temporary Cloudflare Access token, never a browser credential.
import { writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ACCOUNT_ID = '5d7123b51826502803733340e00d5669';
export const OWNER_EMAIL = 'pritam.siddharth@gmail.com';
export const HOST = 'questions.siddharthpritam.com';
export const APP_NAME = 'Insight owner';
const paths = [HOST + '/admin', HOST + '/admin/*'];
const uuid = /^[a-f0-9-]{36}$/i;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export function checkApplication(app, policies, idpId) {
  assert(app.name === APP_NAME && app.type === 'self_hosted' && app.domain === paths[0], 'Unexpected owner application. No existing application was changed.');
  const destinations = app.destinations || [];
  assert(destinations.length === 2 && paths.every(path => destinations.some(d => d.type === 'public' && d.uri === path && !d.overrides?.length)), 'The owner application must protect only /admin and /admin/*, without public overrides.');
  assert(app.allowed_idps?.length === 1 && app.allowed_idps[0] === idpId, 'The owner application has an unexpected login method.');
  assert(policies.length === 1, 'The owner application must have exactly one policy.');
  const policy = policies[0];
  assert(policy.decision === 'allow' && policy.include?.length === 1 && policy.include[0].email?.email === OWNER_EMAIL && Object.keys(policy.include[0]).length === 1 && !policy.exclude?.length && !policy.require?.length, 'The owner policy must allow only the configured owner email.');
  assert(/^[a-f0-9]{64}$/i.test(app.aud || ''), 'Cloudflare did not return a valid application audience.');
}

function touchesHost(app) {
  const destinations = app.destinations || [];
  if (destinations.some(d => d.type === 'all_workers' || (d.type === 'worker' && d.worker_id === 'insight-questions'))) return true;
  return [app.domain, ...(app.self_hosted_domains || []), ...destinations.map(d => d.uri)].filter(Boolean).some(uri => {
    const hostPattern = uri.replace(/^https?:\/\//, '').split('/')[0];
    const expression = hostPattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp('^' + expression + '$', 'i').test(HOST);
  });
}

export async function setupOwnerAccess({ token, fetchRemote = fetch, log = console.log } = {}) {
  assert(token && token.trim(), 'Add the CLOUDFLARE_ACCESS_SETUP_TOKEN repository secret before running setup.');
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/access';
  async function api(path, { method = 'GET', body, allowMissing = false } = {}) {
    const response = await fetchRemote(base + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Cloudflare returned a non-JSON response (HTTP ' + response.status + ').'); }
    if (allowMissing && path === '/organizations' && (response.status === 404 || (response.status === 403 && data.errors?.some(error => error.code === 9999 && error.message?.startsWith('access.api.error.not_enabled:'))))) return null;
    // Do not echo headers, secret values, or arbitrary API response text into logs.
    if (!response.ok || !data.success) {
      const codes = (data.errors || []).map(e => Number(e.code)).filter(Number.isFinite).join(',');
      throw new Error('Cloudflare rejected ' + method + ' ' + path.split('?')[0] + ' (HTTP ' + response.status + '; codes ' + codes + '). Check the token permissions and Zero Trust account setup.');
    }
    return data;
  }
  async function list(path) {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const data = await api(path + '?per_page=100&page=' + page);
      assert(Array.isArray(data.result), 'Unexpected Cloudflare list response.');
      items.push(...data.result);
      const info = data.result_info;
      if (info?.total_pages != null ? page >= info.total_pages : info?.total_count != null ? items.length >= info.total_count : data.result.length < 100) return items;
    }
    throw new Error('Cloudflare returned too many pages; setup stopped without changing existing resources.');
  }

  let organization = (await api('/organizations', { allowMissing: true }))?.result;
  if (!organization) {
    // The live API requires an explicit team hostname. No subscriptions or billing APIs.
    organization = (await api('/organizations', { method: 'POST', body: { name: 'Insight', auth_domain: 'insight-siddharth.cloudflareaccess.com' } })).result;
    log('Created the Insight Access organization.');
  }
  assert(/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(organization.auth_domain || ''), 'Cloudflare did not return a valid Access team hostname.');

  // Read existing apps before changing application or login-provider settings.
  const apps = await list('/apps');
  const matching = apps.filter(app => app.name === APP_NAME);
  assert(matching.length <= 1, 'More than one Insight owner application exists; review it before continuing.');
  const existing = matching[0];
  assert(!apps.some(app => app.id !== existing?.id && touchesHost(app)), 'Another Access application covers the questions hostname. Review it before continuing.');

  const providers = await list('/identity_providers');
  const otpProviders = providers.filter(provider => provider.type === 'onetimepin');
  let provider = existing ? otpProviders.find(p => existing.allowed_idps?.includes(p.id)) : otpProviders[0];
  if (!provider) {
    assert(!existing, 'The existing owner application does not use an available email-code login provider.');
    provider = (await api('/identity_providers', { method: 'POST', body: { name: 'Insight email code', type: 'onetimepin', config: {} } })).result;
    log('Added email-code sign-in.');
  }
  assert(uuid.test(provider.id || ''), 'Cloudflare did not return a valid login-provider ID.');

  let app = existing;
  if (!app) {
    app = (await api('/apps', { method: 'POST', body: {
      name: APP_NAME, type: 'self_hosted', domain: paths[0],
      destinations: paths.map(uri => ({ type: 'public', uri })),
      allowed_idps: [provider.id], auto_redirect_to_identity: true,
      app_launcher_visible: false, session_duration: '24h',
      http_only_cookie_attribute: true,
      policies: [{ name: 'Siddharth only', decision: 'allow', include: [{ email: { email: OWNER_EMAIL } }], exclude: [], require: [] }],
    } })).result;
    log('Created owner access for the two admin paths.');
  }
  assert(uuid.test(app.id || ''), 'Cloudflare did not return a valid application ID.');
  app = (await api('/apps/' + app.id)).result;
  const policies = await list('/apps/' + app.id + '/policies');
  checkApplication(app, policies, provider.id);
  log('Verified the owner email, login method, and protected paths.');
  return { ACCESS_TEAM_DOMAIN: 'https://' + organization.auth_domain, ACCESS_AUD: app.aud, applicationId: app.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await setupOwnerAccess({ token: process.env.CLOUDFLARE_ACCESS_SETUP_TOKEN });
    await writeFile('/tmp/insight-owner-access.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, 'Owner access configured and verified. Public configuration identifiers:\n\n```json\n' + JSON.stringify(result, null, 2) + '\n```\n\nThe website is still closed for posting until the Worker is connected and live login is checked. Revoke the temporary setup token after configuration is complete.\n');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
