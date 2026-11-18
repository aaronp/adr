// `make dev`: serves the built page at / and everything else from the repo, as on GitHub Pages (so ?src=examples/... works).
// Existing .md and .card.json files in the repo can be written back with PUT (File → Save), like the `adr` CLI.
// Loopback only: listens on 127.0.0.1 and ::1, and refuses any other Host (DNS rebinding).
import { rename } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const port = Number(process.env.PORT ?? 8000);
const root = resolve('.');
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
/** A repo file the viewer may overwrite: markdown or card settings, inside the repo, not the build output. */
const writable = (abs: string) => abs.startsWith(root + sep) && !abs.startsWith(resolve('dist') + sep) && /\.(md|card\.json)$/i.test(abs);

const fetch = async (req: Request): Promise<Response> => {
  if (!hosts.has(req.headers.get('host') ?? '')) return new Response('Forbidden host', { status: 403 });
  const p = decodeURIComponent(new URL(req.url).pathname);
  const rel = p.endsWith('/') ? p + 'index.html' : p;
  const abs = resolve('.' + rel);
  if (req.method === 'PUT') {
    // Cross-site pages cannot get here: a PUT needs a CORS preflight, which this server never answers.
    if (!writable(abs) || !(await Bun.file(abs).exists())) return new Response('Not writable', { status: 403 });
    const tmp = `${abs}.adr-tmp`;
    await Bun.write(tmp, await req.arrayBuffer());
    await rename(tmp, abs); // whole file or nothing
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const built = Bun.file('dist' + rel);
  if (await built.exists()) return new Response(built, { headers: { 'cache-control': 'no-store' } });
  const f = Bun.file(abs);
  // x-adr-writable tells the viewer it can offer File → Save (a PUT back to this URL).
  if (abs.startsWith(root + sep) && (await f.exists())) return new Response(f, { headers: { 'cache-control': 'no-store', ...(writable(abs) ? { 'x-adr-writable': '1' } : {}) } });
  return new Response('Not found', { status: 404 });
};

Bun.serve({ port, hostname: '127.0.0.1', fetch });
try {
  Bun.serve({ port, hostname: '::1', fetch });
} catch {
  // No IPv6 loopback: http://[::1]:port will not answer, the others still do.
}
console.log(`Serving on http://localhost:${port}/ (Ctrl-C to stop)`);
