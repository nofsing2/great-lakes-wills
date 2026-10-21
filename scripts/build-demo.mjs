// Bundles the browser demo (questionnaire + in-browser API + documents) into one HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const rootPaths = {
  name: 'site-root',
  setup(b) {
    b.onResolve({ filter: /^\// }, (args) => {
      if (args.path.startsWith(ROOT)) return { path: args.path };
      const p = join(ROOT, 'public', args.path);
      if (!existsSync(p)) return { errors: [{ text: `Missing ${p}` }] };
      return { path: p };
    });
  },
};
// Keep the demo's sample family in step with the test fixtures.
writeFileSync(join(ROOT, 'public/demo-sample.js'), readFileSync(join(ROOT, 'test/fixtures.js'), 'utf8'));
const out = await build({ entryPoints: [join(ROOT, 'public/demo.js')], bundle: true, format: 'esm', write: false, minify: true, target: 'es2022', plugins: [rootPaths] });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(ROOT, 'public/styles.css'), 'utf8');
let html = readFileSync(join(ROOT, 'public/demo.html'), 'utf8');
// Function replacers: a replacement string would turn "$$" in the code into "$".
html = html.replace('<link rel="stylesheet" href="/styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="/demo.js"></script>', () => `<script type="module">${js}</script>`)
  .replace('<a class="brand" href="/">', '<a class="brand" href="#/status">');
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/demo.html'), html);
// Fragment for hosting as a claude.ai Artifact (the host supplies doctype, head, and body).
const title = html.match(/<title>.*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
writeFileSync(join(ROOT, 'dist/demo-artifact.html'), `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${style}\n${body}`);
console.log(`dist/demo.html ${(html.length / 1024).toFixed(0)} KB`);
