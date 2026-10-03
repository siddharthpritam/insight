import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { youtubeId, readMarkdown } from './content.mjs';
import { validateDiscussion, renderDiscussion } from './discussion.mjs';

const id='M7lc1UVf-VE'; // Google IFrame API documentation example; fixtures only.
test('YouTube URL forms normalize to the same video', () => {
  for (const url of [`https://www.youtube.com/watch?v=${id}&t=12`,`https://youtu.be/${id}?si=example`,`https://www.youtube.com/shorts/${id}`,`https://www.youtube.com/live/${id}`,`https://www.youtube-nocookie.com/embed/${id}`]) assert.equal(youtubeId(url),id);
  for (const url of [`https://youtube.com.example.org/watch?v=${id}`,`https://example.org/${id}`,'https://www.youtube.com/@channel','https://youtu.be/not-valid']) assert.throws(()=>youtubeId(url));
});

const doc=(meta,body='A short **reflection**.')=>'---\n'+JSON.stringify(meta)+'\n---\n\n'+body;
test('Public entries require a real date and an explicit draft flag', () => {
  const meta={title:'Sample',summary:'Description',date:'2026-10-03',draft:false};
  assert.equal(readMarkdown(doc(meta),'sample.md').draft,false);
  assert.throws(()=>readMarkdown(doc({...meta,date:'2026-02-30'}),'sample.md'));
  assert.throws(()=>readMarkdown(doc({...meta,draft:'false'}),'sample.md'));
});

test('Discussion stays inactive without complete configuration and never posts from previews', () => {
  const email='author@example.org';
  const offline=renderDiscussion({enabled:false},email);
  assert.ok(offline.includes('Public posting is not open yet.'));
  assert.ok(offline.includes('<fieldset disabled>'));
  assert.ok(!offline.includes('data-qa-api'));
  assert.throws(()=>validateDiscussion({enabled:true}),/owner-qa/);
  const configured={enabled:true,provider:'owner-qa',apiUrl:'https://questions.example.org',turnstileSiteKey:'fixture-public-key'};
  for(const apiUrl of ['http://questions.example.org','https://questions.example.org/anything','https://secret@questions.example.org']) {
    assert.throws(()=>validateDiscussion({...configured,apiUrl}),/HTTPS origin/);
  }
  assert.throws(()=>validateDiscussion({...configured,turnstileSiteKey:''}),/turnstileSiteKey/);
  const live=renderDiscussion(configured,email);
  assert.ok(live.includes('data-qa-live="true"'));
  assert.ok(live.includes('data-qa-api="https://questions.example.org"'));
  assert.ok(live.includes('name="consent" required'));
  assert.ok(!live.includes('name="answer"'));
  assert.ok(!live.includes('disabled'));
  const preview=renderDiscussion(configured,email,true);
  assert.ok(preview.includes('Preview — questions cannot be posted from this file.'));
  assert.ok(preview.includes('<fieldset disabled>'));
  assert.ok(!preview.includes('data-qa-api'));
});

test('Production excludes drafts and renders a video with a working fallback', async () => {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'insight-check-'));
  try {
    for (const part of ['scripts','vendor','public','site.json']) await fs.cp(path.join(source,part),path.join(temporary,part),{recursive:true});
    await fs.mkdir(path.join(temporary,'content/writings'),{recursive:true});
    await fs.mkdir(path.join(temporary,'content/videos'),{recursive:true});
    const meta={title:'An article',summary:'A summary',date:'2026-10-03',draft:false};
    await fs.writeFile(path.join(temporary,'content/writings/public-piece.md'),doc(meta));
    await fs.writeFile(path.join(temporary,'content/writings/private-draft.md'),doc({...meta,title:'Excluded draft',date:null,draft:true}));
    await fs.writeFile(path.join(temporary,'content/videos/sample-video.md'),doc({...meta,title:'A video',creator:'A visiting speaker',youtube:`https://youtu.be/${id}`}));
    const run=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:temporary,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const home=await fs.readFile(path.join(temporary,'dist/index.html'),'utf8');
    assert.ok(home.includes('An article'));
    assert.ok(home.includes('A video'));
    assert.ok(home.includes('A visiting speaker'));
    assert.ok(!home.includes('Excluded draft'));
    await assert.rejects(fs.access(path.join(temporary,'dist/writings/private-draft/index.html')));
    const video=await fs.readFile(path.join(temporary,'dist/videos/sample-video/index.html'),'utf8');
    assert.ok(video.includes(`data-youtube-id="${id}"`));
    assert.ok(video.includes(`https://www.youtube.com/watch?v=${id}`));
    assert.ok(video.includes('A visiting speaker'));
    assert.ok(video.includes('Added <time datetime="2026-10-03">'));
    assert.ok(!video.includes('<iframe'));
    const discussion=await fs.readFile(path.join(temporary,'dist/discussion/index.html'),'utf8');
    assert.ok(discussion.includes('Only Siddharth Pritam can publish answers.'));
    assert.ok(discussion.includes('Private%20message%20%E2%80%94%20Insight'));
    assert.ok(discussion.includes('Email messages are separate from the public board'));
    const links=spawnSync(process.execPath,['scripts/check.mjs'],{cwd:temporary,encoding:'utf8'});
    assert.equal(links.status,0,links.stderr);
  } finally { await fs.rm(temporary,{recursive:true,force:true}); }
});
