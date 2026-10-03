import { createRemoteJWKSet, jwtVerify } from 'jose';
import { adminHtml, adminScript } from './admin.mjs';

const keys = new Map();
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8'}});
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const columns = 'id, name, question, answer, created_at AS createdAt, answered_at AS answeredAt, hidden';

async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') fail(415,'Use JSON.');
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); fail(413,'This message is too long.'); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail(400,'The request could not be read.'); }
}
function fields(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400,'Unexpected request field.');
}
function text(value, min, max, label) {
  if (typeof value !== 'string') fail(400,`${label} is required.`);
  const clean=value.trim();
  if (clean.length < min || clean.length > max) fail(400,`${label} must be between ${min} and ${max} characters.`);
  return clean;
}
function config(env) {
  let site;
  try { site = new URL(env.SITE_ORIGIN); } catch { fail(503,'The question board is not configured.'); }
  if (site.protocol !== 'https:' || site.origin !== env.SITE_ORIGIN || !env.DB) fail(503,'The question board is not configured.');
  return site;
}

export async function requireOwner(request, env, resolveKeys) {
  const issuer=env.ACCESS_TEAM_DOMAIN;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') || !env.ACCESS_AUD || !env.OWNER_EMAIL) fail(503,'Owner sign-in is not configured.');
  const token=request.headers.get('cf-access-jwt-assertion');
  if (!token) fail(401,'Sign in as the site owner.');
  try {
    let keySet;
    if (resolveKeys) keySet=resolveKeys(issuer);
    else {
      if (!keys.has(issuer)) keys.set(issuer,createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
      keySet=keys.get(issuer);
    }
    const {payload}=await jwtVerify(token,keySet,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
    if (payload.type !== 'app' || typeof payload.email !== 'string' || payload.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) fail(403,'Only the site owner can answer questions.');
    return payload;
  } catch(error) {
    if(error.status===403) throw error;
    fail(401,'Your owner sign-in could not be verified. Sign in again.');
  }
}

async function list(env,url,admin=false) {
  const cursor=url.searchParams.get('cursor') || '';
  if(cursor.length>100) fail(400,'Invalid page cursor.');
  const filter=admin ? '' : 'hidden = 0 AND ';
  const {results}=await env.DB.prepare(`SELECT ${columns} FROM questions WHERE ${filter}(?1 = '' OR created_at || ':' || id < ?1) ORDER BY created_at DESC, id DESC LIMIT 21`).bind(cursor).all();
  const items=results.slice(0,20);
  if(!admin) items.forEach(item=>delete item.hidden);
  const last=items.at(-1);
  return json({questions:items,nextCursor:results.length>20 ? `${last.createdAt}:${last.id}` : null});
}

export function createWorker({fetchRemote=fetch, resolveKeys, now=()=>new Date().toISOString(), newId=()=>crypto.randomUUID()}={}) {
  return {async fetch(request,env) {
    const url=new URL(request.url);
    const origin=request.headers.get('origin');
    let response;
    try {
      const site=config(env);
      const admin=url.pathname==='/admin' || url.pathname.startsWith('/admin/');
      if(admin) {
        await requireOwner(request,env,resolveKeys);
        if(request.method!=='GET' && (origin!==url.origin || request.headers.get('x-insight-admin')!=='1')) fail(403,'Invalid owner request origin.');
        if(request.method==='GET' && ['/admin','/admin/'].includes(url.pathname)) response=new Response(adminHtml,{headers:{'Content-Type':'text/html; charset=utf-8'}});
        else if(request.method==='GET' && url.pathname==='/admin/app.js') response=new Response(adminScript,{headers:{'Content-Type':'text/javascript; charset=utf-8'}});
        else if(request.method==='GET' && url.pathname==='/admin/api/questions') response=await list(env,url,true);
        else {
          const match=/^\/admin\/api\/questions\/([a-f0-9-]{36})$/.exec(url.pathname);
          if(!match || request.method!=='POST') fail(404,'Page not found.');
          const body=await readJson(request);
          fields(body,['operation','answer']);
          let result;
          if(body.operation==='answer') {
            const answer=text(body.answer,1,12000,'Answer');
            result=await env.DB.prepare('UPDATE questions SET answer = ?1, answered_at = ?2 WHERE id = ?3').bind(answer,now(),match[1]).run();
          } else if(body.operation==='hide' || body.operation==='show') {
            result=await env.DB.prepare('UPDATE questions SET hidden = ?1 WHERE id = ?2').bind(body.operation==='hide'?1:0,match[1]).run();
          } else fail(400,'Unknown owner action.');
          if(!result.meta.changes) fail(404,'Question not found.');
          response=json({ok:true});
        }
      } else if(url.pathname==='/questions') {
        if(origin && origin!==site.origin) fail(403,'This request came from another website.');
        if(request.method==='OPTIONS') {
          if(origin!==site.origin) fail(403,'Invalid request origin.');
          response=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
        } else if(request.method==='GET') response=await list(env,url);
        else if(request.method==='POST') {
          if(origin!==site.origin) fail(403,'Invalid request origin.');
          if(!env.TURNSTILE_SECRET_KEY) fail(503,'Question posting is not configured.');
          const body=await readJson(request);
          fields(body,['name','question','consent','turnstileToken']);
          const name=text(body.name ?? '',0,80,'Name');
          const question=text(body.question,10,3000,'Question');
          if(body.consent!==true) fail(400,'Please confirm that your question may be public.');
          const token=text(body.turnstileToken,1,2048,'Verification');
          const form=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token});
          const ip=request.headers.get('cf-connecting-ip');
          if(ip) form.set('remoteip',ip);
          let verification;
          try {
            const result=await fetchRemote('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(8000)});
            if(!result.ok) throw new Error();
            verification=await result.json();
          } catch { fail(503,'Verification is unavailable. Please try again later.'); }
          if(!verification.success || verification.hostname!==site.hostname || verification.action!=='question') fail(400,'Please complete the verification again.');
          const id=newId();
          await env.DB.prepare('INSERT INTO questions(id, name, question, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id,name,question,now()).run();
          response=json({id,message:'Your question is now public.'},201);
        } else fail(405,'Method not allowed.');
      } else fail(404,'Page not found.');
    } catch(error) {
      response=json({error:error.status ? error.message : 'The question board is temporarily unavailable.'},error.status || 503);
    }
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','no-store');
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','same-origin');
    if(url.pathname==='/questions' && origin===env.SITE_ORIGIN) {
      headers.set('Access-Control-Allow-Origin',origin);
      headers.set('Vary','Origin');
    }
    if(url.pathname==='/admin' || url.pathname.startsWith('/admin/')) {
      headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      headers.set('X-Frame-Options','DENY');
    }
    return new Response(response.body,{status:response.status,headers});
  }};
}
export default createWorker();
