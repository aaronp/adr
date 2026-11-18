// The app itself. Its decisions live in adr/decisions.md.
const server = Bun.serve({ port: 3000, fetch: () => new Response('Hello from bun-app') });
console.log(`Listening on ${server.url}`);
