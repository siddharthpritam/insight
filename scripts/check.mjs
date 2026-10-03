import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] || 'dist');
let pages = 0;
let links = 0;
async function walk(dir) {
  for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
    const filename=path.join(dir,entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (entry.name.endsWith('.html')) {
      const html=await fs.readFile(filename,'utf8');
      pages++;
      if ((html.match(/<h1\b/g)||[]).length !== 1) throw new Error(`${filename}: expected exactly one h1.`);
      if (!html.includes('name="description"')) throw new Error(`${filename}: description missing.`);
      const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
      if (new Set(ids).size !== ids.length) throw new Error(`${filename}: duplicate IDs.`);
      for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const link=match[1];
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
        const [raw,hash]=link.split('#');
        if (!raw) { if (hash && !ids.includes(hash)) throw new Error(`${filename}: missing #${hash}.`); continue; }
        let target = raw.startsWith('/') ? path.join(root,raw) : path.resolve(path.dirname(filename),raw);
        if (!target.startsWith(root + path.sep) && target !== root) throw new Error(`${filename}: path escapes the built site.`);
        let stat;
        try { stat=await fs.stat(target); } catch { throw new Error(`${filename}: missing ${link}.`); }
        if (stat.isDirectory()) await fs.access(path.join(target,'index.html'));
        links++;
      }
      for (const img of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="[^"]+"/.test(img[0])) throw new Error(`${filename}: image needs alt text.`);
    }
  }
}
await walk(root);
console.log(`Checked ${pages} HTML pages and ${links} internal links/assets. All targets exist.`);
