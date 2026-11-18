#!/usr/bin/env node
// adr <file.md>: serves the bundled viewer and that file on localhost, then opens it in the browser.
// The file is re-read on every request, so reloading the page shows your latest edits.
// adr badge <decisions.md> [out-dir]: writes badge.svg (out-dir defaults to the file's folder).
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

if (process.argv[2] === 'badge') {
  const [md, out = dirname(md ?? '')] = process.argv.slice(3);
  if (!md) { console.error('Usage: adr badge <decisions.md> [out-dir]'); process.exit(1); }
  const { badge } = await import('../dist/badge.mjs');
  try {
    const target = join(out, 'badge.svg');
    await writeFile(target, badge(await readFile(md, 'utf8'), new Date().toLocaleDateString('en-CA')));
    console.log(`Wrote ${target}`);
  } catch (e) {
    console.error(`adr: ${md}: ${e.message}`);
    process.exit(1);
  }
  process.exit(0);
}

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  console.error('Usage: adr <decisions.md>   (PORT=8000 to pick the port, NO_OPEN=1 to skip opening a browser)');
  console.error('       adr badge <decisions.md> [out-dir]   (writes badge.svg)');
  process.exit(file ? 0 : 1);
}
const path = resolve(file);
await readFile(path).catch((e) => { console.error(`adr: cannot read ${file}: ${e.message}`); process.exit(1); });

const viewer = new URL('../dist/decision-ledger.html', import.meta.url);
const route = '/' + encodeURIComponent(basename(path));
const server = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  // Only two routes, so nothing else on disk is reachable.
  const [target, type] = p === '/' ? [viewer, 'text/html'] : p === route ? [path, 'text/markdown'] : [];
  if (!target) return res.writeHead(404).end('Not found');
  try {
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(await readFile(target));
  } catch (e) {
    res.writeHead(500).end(e.message);
  }
});

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?src=${route}`;
  console.log(`Serving ${file} at ${url}  (Ctrl-C to stop)`);
  if (process.env.NO_OPEN) return;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
