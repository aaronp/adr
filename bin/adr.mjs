#!/usr/bin/env node
// adr <file.md>: serves the bundled viewer and that file on localhost, then opens it in the browser.
// The file is re-read on every request, so reloading the page shows your latest edits; File → Save writes it back (PUT).
// adr card <decisions.md> [out-dir]: writes card.json, the ledger as a dashboard card (out-dir defaults to the file's folder).
// adr badge <decisions.md> [out-dir]: writes badge.svg, drawn from the same card.
// Both read the optional sidecar <name>.card.json beside the markdown (titles, legend labels, colours).
// The card's links open the viewer at ADR_HOST (default https://aaronp.github.io/adr/) with ?src=ADR_SRC,
// where ADR_SRC is where the published markdown lives (default: the path given, relative to ADR_HOST).
import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

/** decisions.md → decisions.card.json (or "<name>.card.json" appended when there is no .md). */
const sidecarOf = (md) => md.replace(/\.md$/i, '') + '.card.json';

const cmd = process.argv[2];
if (cmd === 'card' || cmd === 'badge') {
  const [md, out = dirname(md ?? '')] = process.argv.slice(3);
  if (!md) { console.error(`Usage: adr ${cmd} <decisions.md> [out-dir]`); process.exit(1); }
  const { parseLedger, parsePrefs, card, badgeSvg } = await import('../dist/card.mjs');
  const fail = (where, e) => { console.error(`adr: ${where}: ${e.message ?? e}`); process.exit(1); };
  const sidecar = sidecarOf(md);
  let prefs = {};
  try {
    const { prefs: p, warnings } = parsePrefs(JSON.parse(await readFile(sidecar, 'utf8')));
    if (warnings.length > 0) fail(sidecar, warnings.join('; '));
    prefs = p;
  } catch (e) {
    if (e.code !== 'ENOENT') fail(sidecar, e);
  }
  try {
    const c = card(parseLedger(await readFile(md, 'utf8')), prefs, new Date().toLocaleDateString('en-CA'), { label: md, src: process.env.ADR_SRC || md }, process.env.ADR_HOST || undefined);
    const [name, body] = cmd === 'card' ? ['card.json', JSON.stringify(c, null, 2) + '\n'] : ['badge.svg', badgeSvg(c)];
    await writeFile(join(out, name), body);
    console.log(`Wrote ${join(out, name)}`);
  } catch (e) {
    fail(md, e);
  }
  process.exit(0);
}

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  console.error('Usage: adr <decisions.md>   (PORT=8000 to pick the port, NO_OPEN=1 to skip opening a browser)');
  console.error('       adr card <decisions.md> [out-dir]    (writes card.json)');
  console.error('       adr badge <decisions.md> [out-dir]   (writes badge.svg)');
  process.exit(file ? 0 : 1);
}
const path = resolve(file);
await readFile(path).catch((e) => { console.error(`adr: cannot read ${file}: ${e.message}`); process.exit(1); });

const viewer = new URL('../dist/decision-ledger.html', import.meta.url);
const route = '/' + encodeURIComponent(basename(path));
const sidecar = sidecarOf(path);
const sidecarRoute = '/' + encodeURIComponent(basename(sidecar));
// Loopback names a browser may use for this server. Anything else in Host means DNS rebinding, so it is refused.
const hosts = (port) => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
const handler = async (req, res) => {
  if (!hosts(server.address().port).has(req.headers.host)) return res.writeHead(403).end('Forbidden host');
  const p = new URL(req.url, 'http://x').pathname;
  // Only these routes, so nothing else on disk is reachable.
  const [target, type] = p === '/' ? [viewer, 'text/html'] : p === route ? [path, 'text/markdown'] : p === sidecarRoute ? [sidecar, 'application/json'] : [];
  if (!target) return res.writeHead(404).end('Not found');
  if (req.method === 'PUT' && target !== viewer) {
    // Cross-site pages cannot get here: a PUT needs a CORS preflight, which this server never answers.
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const tmp = `${target}.adr-tmp`;
      await writeFile(tmp, Buffer.concat(chunks));
      await rename(tmp, target); // whole file or nothing, never half-written
      return res.writeHead(204).end();
    } catch (e) {
      return res.writeHead(500).end(e.message);
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end('Method not allowed');
  try {
    const body = await readFile(target);
    // x-adr-writable tells the viewer it can offer File → Save (a PUT back to this URL).
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', ...(target === viewer ? {} : { 'x-adr-writable': '1' }) }).end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(e.message);
  }
};
const server = createServer(handler);

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const { port } = server.address();
  // Also answer on ::1 so http://localhost:<port> and http://[::1]:<port> work; skipped if IPv6 loopback is unavailable.
  createServer(handler).on('error', () => {}).listen(port, '::1');
  const url = `http://127.0.0.1:${port}/?src=${route}`;
  console.log(`Serving ${file} at ${url}  (Ctrl-C to stop)`);
  if (process.env.NO_OPEN) return;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
