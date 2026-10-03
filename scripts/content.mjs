import { marked } from '../vendor/marked.esm.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function readMarkdown(source, filename) {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: begin with a JSON metadata block between --- lines. Copy a file in templates/.`);
  let meta;
  try { meta = JSON.parse(match[1]); }
  catch { throw new Error(`${filename}: invalid JSON metadata. Check quotation marks and commas.`); }
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') throw new Error(`${filename}: metadata must be an object.`);
  for (const key of ['title', 'summary']) if (typeof meta[key] !== 'string' || !meta[key].trim()) throw new Error(`${filename}: ${key} is required.`);
  if (typeof meta.draft !== 'boolean') throw new Error(`${filename}: draft must be true or false.`);
  if (!meta.draft) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '') || new Date(`${meta.date}T00:00:00Z`).toISOString().slice(0, 10) !== meta.date) throw new Error(`${filename}: a valid publication date YYYY-MM-DD is required.`);
  }
  if (meta.topic != null && typeof meta.topic !== 'string') throw new Error(`${filename}: topic must be text.`);
  if (meta.creator != null && typeof meta.creator !== 'string') throw new Error(`${filename}: creator must be text.`);
  return { ...meta, body: match[2].trim() };
}

export function youtubeId(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use a complete YouTube video URL.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an https YouTube URL.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? '')) throw new Error('Use a YouTube watch, share, Shorts, live, or embed URL for a specific video.');
  return id;
}

export function renderMarkdown(body) {
  return marked.parse(body, { gfm: true });
}
