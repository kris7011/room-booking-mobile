// Builds the web app for the E2E run and serves it. Started (and stopped) by
// Playwright's webServer, see e2e/playwright.config.ts.
//
//   node e2e/scripts/serve-web.mjs --port 8181 --api-url http://localhost:5103 --out-dir e2e/.output/web
//
// A static export instead of `expo start`: the bundle is built once before any
// test runs, there is no file watcher, and EXPO_PUBLIC_API_URL is fixed in it.
// `expo serve` is not used because it always serves ./dist, which could
// overwrite a developer's own export.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    'api-url': { type: 'string' },
    'out-dir': { type: 'string' },
  },
});
const port = Number(values.port);
const apiUrl = values['api-url'];
const outDir = resolve(values['out-dir'] ?? '');
if (!port || !apiUrl || !values['out-dir']) {
  throw new Error('Usage: serve-web.mjs --port <port> --api-url <url> --out-dir <dir>');
}

// 1. Export. EXPO_NO_DOTENV stops Expo from reading .env.local, so a
// developer's own API address can never end up in the test bundle. Metro
// still uses metro.config.js, so maxWorkers = 1 applies here too.
const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
const exported = spawnSync(
  process.execPath,
  [expoCli, 'export', '--platform', 'web', '--output-dir', outDir],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_URL: apiUrl,
      EXPO_NO_TELEMETRY: '1',
      CI: '1',
    },
  },
);
if (exported.status !== 0) process.exit(exported.status ?? 1);

// 2. Make sure the bundle really talks to the E2E API and not to whatever
// address was in the environment or a stale cache.
const jsDir = join(outDir, '_expo', 'static', 'js', 'web');
const bundles = existsSync(jsDir) ? readdirSync(jsDir).filter((file) => file.endsWith('.js')) : [];
if (!bundles.some((file) => readFileSync(join(jsDir, file), 'utf8').includes(apiUrl))) {
  console.error(`The exported web bundle in ${jsDir} does not contain ${apiUrl}. Refusing to serve it.`);
  process.exit(1);
}

// 3. Serve the files. Unknown paths get index.html, like a single-page host.
/** @type {Record<string, string>} */
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/** @type {import('node:http').RequestListener} */
function serveFile(request, response) {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  let file = normalize(join(outDir, pathname));
  if (!file.startsWith(outDir + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(outDir, 'index.html');
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(readFileSync(file));
}

// "localhost" may resolve to either loopback address depending on the OS, so
// listen on both. Neither is reachable from other machines.
for (const host of ['127.0.0.1', '::1']) {
  createServer(serveFile)
    .on('error', (/** @type {NodeJS.ErrnoException} */ error) => {
      // A machine without IPv6 still works over 127.0.0.1.
      if (host === '::1' && error.code === 'EADDRNOTAVAIL') return;
      throw error;
    })
    .listen(port, host);
}
console.log(`Serving ${outDir} on http://localhost:${port} (API: ${apiUrl})`);
