#!/usr/bin/env node
// adr <file.md>: serves the bundled viewer and that file on localhost, then opens it in the browser.
// The file is re-read on every request, so reloading the page shows your latest edits.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  console.error('Usage: adr <decisions.md>   (PORT=8000 to pick the port, NO_OPEN=1 to skip opening a browser)');
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
