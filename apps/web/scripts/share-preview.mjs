/*
 * Link-preview check for share links (the Phase 6 ✅): serves two shared simulations on a public
 * tunnel URL, so a link debugger (Facebook, LinkedIn...) can read their cards.
 *
 *   cloudflared tunnel --url http://localhost:3200                      # terminal 1: copy its URL
 *   pnpm build                                                          # once (the API's dist)
 *   pnpm --filter @futuria/web share:preview https://<name>.trycloudflare.com   # terminal 2
 *
 * It runs a sealed stack, safe to expose for a few minutes:
 * - the built API on :4200 with fixture AI (no Claude cost), dev auth and the inline pipeline, on
 *   a throwaway `futuria_test_share_preview` database (MONGODB_TEST_URI or local MongoDB), never
 *   your `futuria` data; the database is dropped when you stop the script (Ctrl+C);
 * - the web app on :3200, rebuilt with NEXT_PUBLIC_SITE_URL = the tunnel URL (og:image needs an
 *   absolute URL), without Clerk (a Clerk development instance answers cookieless visitors,
 *   link-preview bots included, with a redirect to its handshake) and without analytics.
 *
 * It shares Sara's simulation as a Free user (watermark, amounts hidden) and as a Pro user (no
 * watermark; amounts on the page, never on the card), checks both pages and cards through the tunnel the way a bot sees
 * them, and prints the links. The build replaces .next: run `pnpm --filter @futuria/web build`
 * (or `build:e2e`) afterwards. `--skip-build` reuses the last build (same tunnel URL only);
 * `--once` stops after the checks (e.g. `share:preview http://localhost:3200 --once`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { SARA_MODEL } from '@futuria/shared';

const WEB_PORT = 3200;
const API_PORT = 4200;
const DATABASE = 'futuria_test_share_preview';
const DECISION = 'What if I quit my job to become a freelance UX designer?';
const TITLE = 'Freelance or stay?';
const BOT_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const apiEntry = fileURLToPath(new URL('../../api/dist/main.js', import.meta.url));
const isWindows = process.platform === 'win32';

function fail(message) {
  console.error(`\n✖ ${message}`);
  return cleanup(1);
}

// ---- Arguments ----------------------------------------------------------------------------

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const once = args.includes('--once');
const siteArg = args.find((a) => !a.startsWith('--'));
let site;
try {
  site = new URL(siteArg ?? '');
} catch {
  console.error(
    'Usage: pnpm --filter @futuria/web share:preview <public URL> [--skip-build]\n' +
      `  e.g. the URL printed by: cloudflared tunnel --url http://localhost:${WEB_PORT}`,
  );
  process.exit(1);
}
const local = site.hostname === 'localhost' || site.hostname === '127.0.0.1';
if (site.protocol !== 'https:' && !local) {
  console.error('The public URL must be https (link debuggers fetch over https).');
  process.exit(1);
}
const SITE = site.origin;
if (!existsSync(apiEntry)) {
  console.error('No API build found. Run `pnpm build` from the repo root first.');
  process.exit(1);
}

// ---- Throwaway database -------------------------------------------------------------------

function mongoUri() {
  const url = new URL(process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017');
  url.pathname = `/${DATABASE}`;
  return url.toString();
}

async function withDb(fn) {
  const client = new MongoClient(mongoUri(), { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    return await fn(client.db(DATABASE));
  } finally {
    await client.close();
  }
}

const dropDatabase = () => withDb((db) => db.dropDatabase());

// ---- Child processes ----------------------------------------------------------------------

const children = [];

/** pnpm is a .cmd shim on Windows, so it needs a shell there (the arguments are constants). */
function pnpm(args) {
  return isWindows
    ? { command: `pnpm ${args.join(' ')}`, args: [], shell: true }
    : { command: 'pnpm', args, shell: false };
}

function start(name, { command, args: commandArgs, shell }, env) {
  const child = spawn(command, commandArgs, {
    cwd: webDir,
    env: { ...process.env, ...env },
    shell,
    detached: !isWindows,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors = (errors + chunk).slice(-4000);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n${name} stopped (exit ${code}).\n${errors}`);
      void cleanup(1);
    }
  });
  children.push(child);
  return child;
}

function stop(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (isWindows)
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

let stopping = false;
async function cleanup(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) stop(child);
  try {
    await dropDatabase();
    console.log(`\nDropped the ${DATABASE} database.`);
  } catch (err) {
    console.error(`Could not drop ${DATABASE}: ${err.message}`);
  }
  console.log('Run `pnpm --filter @futuria/web build` to get your normal web build back.');
  process.exit(code);
}

process.on('SIGINT', () => void cleanup(0));
process.on('SIGTERM', () => void cleanup(0));

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not start (${url})`);
}

// ---- API calls (straight to the local API as a dev user) ----------------------------------

async function api(user, method, path, body) {
  const res = await fetch(`http://localhost:${API_PORT}${path}`, {
    method,
    headers: { 'x-dev-user': user, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} as ${user}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function sharedSimulation(user, plan, showNumbers) {
  await api(user, 'GET', '/me'); // creates the user
  if (plan !== 'free') {
    await withDb((db) =>
      db.collection('users').updateOne({ externalId: `dev:${user}` }, { $set: { plan } }),
    );
  }
  const { id } = await api(user, 'POST', '/simulations', {
    decisionText: DECISION,
    title: TITLE,
    model: SARA_MODEL,
  });
  await api(user, 'POST', `/simulations/${id}/run`);
  const deadline = Date.now() + 60_000;
  for (;;) {
    const { status } = await api(user, 'GET', `/simulations/${id}`);
    if (status === 'ready') break;
    if (status === 'failed') throw new Error(`The run for ${user} failed`);
    if (Date.now() > deadline) throw new Error(`The run for ${user} took too long (${status})`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const share = await api(user, 'POST', `/simulations/${id}/share`, {
    isPublic: true,
    showNumbers,
  });
  return `${SITE}/share/${share.slug}`;
}

// ---- What a link-preview bot sees ---------------------------------------------------------

function metaContent(html, property) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]*>`))?.[0];
  return tag?.match(/content="([^"]*)"/)?.[1]?.replaceAll('&amp;', '&') ?? null;
}

async function checkAsBot(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'user-agent': BOT_UA }, redirect: 'manual' });
  } catch {
    return 'not reachable';
  }
  if (res.status !== 200) return `page answered ${res.status}`;
  const html = await res.text();
  const image = metaContent(html, 'og:image');
  if (!image) return 'no og:image tag';
  if (!image.startsWith(`${SITE}/`)) {
    return `og:image is on another site (${image}); rebuild for this URL (no --skip-build)`;
  }
  if (metaContent(html, 'twitter:card') !== 'summary_large_image') return 'no large twitter:card';
  const img = await fetch(image, { headers: { 'user-agent': BOT_UA }, redirect: 'manual' });
  const type = img.headers.get('content-type');
  if (img.status !== 200 || type !== 'image/png') return `card answered ${img.status} ${type}`;
  return { title: metaContent(html, 'og:title'), image };
}

// ---- Main ---------------------------------------------------------------------------------

try {
  if (!skipBuild) {
    console.log(`Building the web app for ${SITE} (Clerk and analytics off)...`);
    const build = pnpm(['exec', 'next', 'build']);
    const built = spawnSync(build.command, build.args, {
      cwd: webDir,
      stdio: 'inherit',
      shell: build.shell,
      env: {
        ...process.env,
        NEXT_PUBLIC_SITE_URL: SITE,
        NEXT_PUBLIC_CLERK_DISABLED: '1',
        NEXT_PUBLIC_POSTHOG_KEY: '',
      },
    });
    if (built.status !== 0) throw new Error('The web build failed');
  }

  await dropDatabase(); // a previous run may have stopped half-way
  console.log(
    `Starting the API (:${API_PORT}, fixture AI, ${DATABASE}) and the web app (:${WEB_PORT})...`,
  );
  start(
    'The API',
    { command: process.execPath, args: [apiEntry], shell: false },
    {
      NODE_ENV: 'test',
      PORT: String(API_PORT),
      MONGODB_URI: mongoUri(),
      WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      AUTH_MODE: 'dev',
      AI_MODE: 'fixture',
      PIPELINE_MODE: 'inline',
    },
  );
  start('The web app', pnpm(['exec', 'next', 'start', '--port', String(WEB_PORT)]), {
    API_URL: `http://localhost:${API_PORT}`,
  });
  await waitFor(`http://localhost:${API_PORT}/health`, 'The API');
  await waitFor(`http://localhost:${WEB_PORT}/robots.txt`, 'The web app');

  console.log('Sharing Sara’s simulation as a Free and a Pro user...');
  const shares = [
    {
      label: 'Free: watermark, amounts hidden',
      url: await sharedSimulation('share-free', 'free', false),
    },
    {
      label: 'Pro: no watermark on the card, amounts on the page',
      url: await sharedSimulation('share-pro', 'pro', true),
    },
  ];

  console.log(`Checking both links through ${SITE}, as a link-preview bot...`);
  for (const share of shares) {
    const result = await checkAsBot(share.url);
    if (typeof result === 'string') {
      throw new Error(
        `${share.url}: ${result}.` +
          (local ? '' : ` Is the tunnel running and pointing at http://localhost:${WEB_PORT}?`),
      );
    }
    share.image = result.image;
    share.title = result.title;
  }

  console.log('\n✔ Both share pages serve a card. Paste a link into a link debugger:\n');
  for (const share of shares) {
    console.log(`  ${share.label}`);
    console.log(`    page: ${share.url}`);
    console.log(`    card: ${share.image}`);
    console.log(`    title: ${share.title}\n`);
  }
  console.log('  Facebook:  https://developers.facebook.com/tools/debug/');
  console.log('  LinkedIn:  https://www.linkedin.com/post-inspector/');
  console.log('  Or post the link in a private chat (Slack, Discord, WhatsApp...).');
  if (once) await cleanup(0);
  else console.log('\nPress Ctrl+C to stop and drop the preview database.');
} catch (err) {
  await fail(err.message);
}
