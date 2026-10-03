import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml as e, readMarkdown, youtubeId, renderMarkdown } from './content.mjs';
import { validateDiscussion, renderDiscussion } from './discussion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const preview = args.includes('--drafts');
const outputName = args.find(arg => arg.startsWith('--output='))?.slice(9) ?? (preview ? 'preview' : 'dist');
if (!['dist', 'preview'].includes(outputName)) throw new Error('Output must be dist or preview.');
const output = path.join(root, outputName);
const site = JSON.parse(await fs.readFile(path.join(root, 'site.json'), 'utf8'));
validateDiscussion(site.discussion);
const routes = [];
const publishedDate = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const emailLink = `mailto:${site.email}`;
const privateEmailLink = `${emailLink}?subject=${encodeURIComponent('Private message — Insight')}`;
const groupLink = `${emailLink}?subject=${encodeURIComponent('Joining the Insight group')}&body=${encodeURIComponent('Hello Siddharth,\n\nI would like to join the Insight group for meditation and conversation. Please let me know how to take part.\n\nMy name: ' )}`;

async function readCollection(kind) {
  const entries = [];
  for (const filename of (await fs.readdir(path.join(root, 'content', kind))).filter(name => name.endsWith('.md')).sort()) {
    const slug = filename.replace(/\.md$/, '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${filename}: use a lowercase filename with hyphens.`);
    const item = readMarkdown(await fs.readFile(path.join(root, 'content', kind, filename), 'utf8'), filename);
    if (item.draft && !preview) continue;
    if (kind === 'videos') item.videoId = youtubeId(item.youtube);
    if (kind === 'writings' && !item.body) throw new Error(`${filename}: writing is empty.`);
    entries.push({...item, kind, slug, route:`/${kind}/${slug}/`});
  }
  return entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));
}
const writings = await readCollection('writings');
const videos = await readCollection('videos');

function relative(current, destination) {
  if (!destination.startsWith('/')) return destination;
  const result = path.posix.relative(current, destination) || '.';
  return result + (destination.endsWith('/') ? (result === '.' ? '/index.html' : '/index.html') : '');
}
function card(item, current) {
  const date = item.draft ? 'Draft' : `${item.kind === 'videos' ? 'Added ' : ''}${publishedDate(item.date)}`;
  const meta = [item.creator, date, item.topic].filter(Boolean).map(e).join('<span aria-hidden="true"> · </span>');
  return `<article class="entry"><h3><a href="${relative(current, item.route)}">${e(item.title)}</a></h3><p class="entry-summary">${e(item.summary)}</p><p class="entry-meta">${meta}</p></article>`;
}
function list(items, current, kind) {
  return items.length ? `<div class="entries">${items.map(item => card(item, current)).join('')}</div>` : `<div class="empty-state"><p>${kind === 'videos' ? 'A video will appear here.' : 'A reflection will appear here.'}</p></div>`;
}
function shell(route, title, description, body, active = '') {
  const fullTitle = title === site.title ? `${site.title} — Inquiry into ourselves` : `${title} — ${site.title}`;
  const isHome = route === '/' && title === site.title;
  const nav = [['about','About'],['writings','Writings'],['videos','Videos'],['discussion','Discussion'],['connect','Connect']].map(([key,label]) => `<a href="${relative(route, `/${key}/`)}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(fullTitle)}</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#ffffff">
${preview ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${e(site.url + route)}">`}
<meta property="og:type" content="website"><meta property="og:site_name" content="${e(site.title)}"><meta property="og:title" content="${e(fullTitle)}"><meta property="og:description" content="${e(description)}">
${preview ? '' : `<meta property="og:url" content="${e(site.url + route)}"><meta property="og:image" content="${e(site.url)}/assets/social-preview.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="A wide misty forest with layers of blue-grey evergreen trees"><meta name="twitter:card" content="summary_large_image">`}
<link rel="icon" type="image/svg+xml" href="${relative(route,'/assets/favicon.svg')}"><link rel="stylesheet" href="${relative(route,'/assets/site.css')}">
</head><body>
<a class="skip-link" href="#main">Skip to content</a>
${preview ? `<div class="preview-note">Preview${[...writings,...videos].some(item=>item.draft) ? ' · Includes unpublished drafts.' : ''}</div>` : ''}
<header class="site-header wrap"><div><${isHome ? 'h1' : 'div'} class="site-title"><a href="${relative(route,'/')}" aria-label="Insight home">Insight</a></${isHome ? 'h1' : 'div'}><p class="site-description">${e(site.tagline)}</p></div><img class="prajna-emblem" src="${relative(route,'/assets/blue-lotus.svg')}" width="104" height="104" alt="Prajna blue lotus emblem"></header>
<nav class="site-nav wrap" aria-label="Main navigation">${nav}</nav>
<main id="main">${body}</main>
<footer class="site-footer wrap"><p class="site-note">Independent of any religion or tradition.<br>Open to every background.</p><div class="footer-contact"><p>${e(site.author)}</p><a href="${e(emailLink)}">${e(site.email)}</a></div></footer>
<script src="${relative(route,'/assets/video.js')}" defer></script>
${active === 'discussion' ? `<script src="${relative(route,'/assets/discussion.js')}" defer></script>` : ''}
</body></html>`;
}
async function writePage(route, title, description, body, active) {
  const destination = path.join(output, route, 'index.html');
  await fs.mkdir(path.dirname(destination), {recursive:true});
  await fs.writeFile(destination, shell(route,title,description,body,active));
  routes.push(route);
}

await fs.rm(output, {recursive:true, force:true});
await fs.mkdir(output, {recursive:true});
await fs.cp(path.join(root,'public'), output, {recursive:true});

await writePage('/', site.title, site.description, `
<figure class="header-image wrap"><img src="${relative('/','/assets/forest-panorama.webp')}" width="2128" height="739" fetchpriority="high" alt="A wide misty forest with layers of blue-grey evergreen trees"></figure>
<div class="introduction wrap"><p>This space is for inquiring together, as friends, into the nature of our psychological structure, so that we may have insight into ourselves and eradicate all forms of mental suffering.</p><p>Insight is <em>in</em> + <em>sight</em>: a seeing that sees the inner workings. Such an insight shows the whole structure of what is seen in an instant, a simple yet profound perception that brings about a complete transformation of the human psyche. To have such an insight, we need a still mind.</p></div>
<div class="home-grid wrap">
<section class="panel" aria-labelledby="writings-title"><h2 id="writings-title">Writings</h2><p class="section-intro">Reflections to read slowly and return to.</p>${list(writings.slice(0,1),'/', 'writings')}${writings.length > 1 ? `<p class="more-link"><a href="${relative('/','/writings/')}">All writings</a></p>` : ''}</section>
<section class="panel" aria-labelledby="videos-title"><h2 id="videos-title">Videos</h2><p class="section-intro">Talks, meditations, and selected conversations.</p>${list(videos.slice(0,1),'/', 'videos')}${videos.length > 1 ? `<p class="more-link"><a href="${relative('/','/videos/')}">All videos</a></p>` : ''}</section>
<section class="panel" aria-labelledby="discussion-title"><h2 id="discussion-title">Discussion</h2><p class="section-intro">Public questions, with answers from Siddharth Pritam. Everyone is welcome to ask and read.</p><p class="panel-note">A question about a writing or video, an experience in meditation, or something you are noticing in everyday life can open an inquiry.</p><p class="more-link"><a href="${relative('/','/discussion/')}">Questions and answers</a></p></section>
<section class="panel connect-section" aria-labelledby="connect-title"><h2 id="connect-title">Connect</h2><p class="section-intro">There is room here for a conversation, and for exploring together.</p><div class="connect-options"><div><h3>Write privately</h3><p>Share a personal question or reflection by email.</p><a class="email-address" href="${e(privateEmailLink)}">${e(site.email)}</a></div><div><h3>Join the group</h3><p>Interested in meditation and conversation with others? Send me a note to ask about joining.</p><a href="${e(groupLink)}">Email to join the group <span aria-hidden="true">↗</span></a></div></div></section>
</div>`);

for (const [kind, title, intro, items] of [['writings','Writings','Reflections on attention, thought, and the experience of everyday life.',writings],['videos','Videos','Talks, meditations, and conversations. Watch here, or continue on YouTube.',videos]]) {
  const route=`/${kind}/`;
  await writePage(route,title,intro,`<header class="page-heading wrap"><h1>${title}</h1><p>${intro}</p></header><section class="reading-list wrap" aria-label="${title}">${list(items,route,kind)}</section>`,kind);
  for (const item of items) {
    const id = item.videoId;
    const player = kind === 'videos' ? `<div class="video-player" data-youtube-id="${id}" data-video-title="${e(item.title)}"><button class="video-load" type="button"><span class="play-symbol" aria-hidden="true">▶</span><span>Play video</span><span class="video-consent">Loads the YouTube player</span></button></div><p class="video-external"><a href="https://www.youtube.com/watch?v=${id}">Watch on YouTube</a></p><noscript><p>Use the YouTube link above to watch this video.</p></noscript>` : '';
    await writePage(item.route,item.title,item.summary,`<article class="article wrap"><a class="back-link" href="${relative(item.route,route)}">All ${kind}</a><header><p class="eyebrow">${e(item.topic || title)}${item.draft ? ' · Draft' : ''}</p><h1>${e(item.title)}</h1>${item.creator ? `<p class="article-creator">${e(item.creator)}</p>` : ''}${item.draft ? '' : `<p class="article-date">${kind === 'videos' ? 'Added ' : ''}<time datetime="${e(item.date)}">${publishedDate(item.date)}</time></p>`}</header>${player}<div class="prose">${renderMarkdown(item.body)}</div></article>`,kind);
  }
}
await writePage('/discussion/','Discussion','Public questions, with answers from Siddharth Pritam, and an option to write privately.',`<article class="article wrap discussion-page"><header><h1>Discussion</h1><p class="page-lead">Questions are welcome. Answers are shared for everyone to read.</p></header><div class="prose"><p>A question about a writing or video, an experience in meditation, or something you are noticing in everyday life can open an inquiry. This is a public question-and-answer space, with answers from Siddharth Pritam.</p></div><section class="discussion-panel" aria-labelledby="questions-title"><h2 id="questions-title">Public questions and answers</h2>${renderDiscussion(site.discussion, site.email, preview)}</section><section class="private-contact" aria-labelledby="private-title"><h2 id="private-title">Write privately</h2><p>For a personal conversation, email Siddharth directly. Email messages are separate from the public board and are not posted here automatically.</p><p><a class="email-address" href="${e(privateEmailLink)}">${e(site.email)}</a></p></section></article>`,'discussion');
await writePage('/about/','About Insight','About Insight: a space to inquire together into the nature of our psychological structure, with writings, videos, and conversation.',`<article class="article wrap about-page"><header><h1>About Insight</h1></header><div class="prose"><p>Insight is a space to inquire together, as friends, into the nature of our psychological structure. It brings together writings and videos by Siddharth Pritam, alongside selected talks and conversations that invite reflection.</p><p>The invitation is to look closely at ordinary experience: the movement of thought, our responses to one another, and the possibility of meeting life with attention. These are questions we can explore for ourselves and in conversation.</p><p>You are welcome to read, listen, question, and see what holds true in your own experience. If something here speaks to you, <a href="${relative('/about/','/connect/')}">get in touch or ask about joining the group</a>.</p></div></article>`,'about');
await writePage('/connect/','Connect','Get in touch with Siddharth Pritam or ask about joining the Insight group.',`<article class="article wrap connect-page"><header><h1>Connect</h1><p class="page-lead">A question, a reflection, or an interest in exploring together—you're welcome to write.</p></header><div class="prose"><h2>Write privately</h2><p>For a personal question, a reflection you would like to share, or simply to say hello. These messages come by email and are not posted on the public board automatically.</p><p><a class="email-address" href="${e(privateEmailLink)}">${e(site.email)}</a></p><h2>Join the group</h2><p>If you would like to join the group for meditation and conversation, send me a short note. You can introduce yourself and share what interests you, though no previous experience is needed.</p><p><a class="join-link" href="${e(groupLink)}">Email to join the group <span aria-hidden="true">↗</span></a></p><p class="contact-note">This opens an email addressed to me with the subject filled in. You can edit it before sending, or write directly to the address above.</p><p>Everyone is welcome, whatever their background, beliefs, or experience.</p></div></article>`,'connect');

const notFound = shell('/','Page not found','This page could not be found.',`<section class="page-heading wrap"><p class="eyebrow">404</p><h1>A different direction.</h1><p>This page is not here. You can return to <a href="${e(site.url)}/">Insight</a>.</p></section>`)
  .replace(/(href|src)="(?![a-z][a-z0-9+.-]*:|#)([^\"]+)"/gi, (_, attr, value) => `${attr}="/${value.replace(/^\.\//,'')}"`)
  .replace(/<link rel="canonical"[^>]+>/, '<meta name="robots" content="noindex">');
await fs.writeFile(path.join(output,'404.html'), notFound);
await fs.writeFile(path.join(output,'.nojekyll'), '');
await fs.writeFile(path.join(output,'robots.txt'), preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
await fs.writeFile(path.join(output,'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>${e(site.url+route)}</loc></url>`).join('')}</urlset>`);
console.log(`Built ${routes.length} pages in ${outputName}/: ${writings.length} writings, ${videos.length} videos. ${preview ? 'Draft preview only.' : 'Drafts excluded.'}`);
