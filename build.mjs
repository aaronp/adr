// Bundles the app into ONE self-contained HTML file: dist/decision-ledger.html (and a copy as dist/index.html)
// (script and styles inlined; the only network use is optional Google Fonts, with system fallbacks).
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.md': 'text' },
  legalComments: 'none',
  logLevel: 'warning'
});
const output = result.outputFiles[0];
if (output === undefined) throw new Error('bug: esbuild produced no output');
// Keep "</script" out of the inlined bundle so it cannot close the tag early.
const js = output.text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/ui/styles.css', 'utf8');

const html = `<!doctype html>
<html lang="en" data-theme="paper">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decision Ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>Decision Ledger needs JavaScript to run.</noscript>
<script>
${js}
</script>
</body>
</html>
`;
await mkdir('dist', { recursive: true });
// decision-ledger.html is the standalone file to keep or share; index.html is the same page for GitHub Pages.
await writeFile('dist/decision-ledger.html', html);
await writeFile('dist/index.html', html);
console.log(`dist/decision-ledger.html, dist/index.html  ${(html.length / 1024).toFixed(1)} KB`);
