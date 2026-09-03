#!/usr/bin/env node
/**
 * Keep the Instagram access token alive.
 *
 *   node scripts/refresh-token.mjs            refresh, and store the new token
 *   node scripts/refresh-token.mjs --check    report days remaining, change nothing
 *
 * WHY THIS EXISTS
 * An Instagram long-lived token lasts 60 days. Nothing was refreshing ours, so
 * the whole pipeline was going to stop dead in late October with no warning at
 * all: the publisher would fail, the queue would stall, and the only signal
 * would be a workflow-failure email nobody was watching for.
 *
 * A refresh returns a NEW token. That is the catch — refreshing is useless
 * unless the new value replaces the old one in the repo secret, and
 * GITHUB_TOKEN is not permitted to write secrets. So:
 *
 *   - With GH_PAT set, this stores the refreshed token and the token never
 *     expires as long as the weekly job keeps running.
 *   - Without it, this still tracks the real deadline in TOKEN-REFRESHED and
 *     fails the run once fewer than WARN_DAYS remain, so the warning arrives
 *     while there is still time to act.
 *
 * Refreshing does not invalidate the current token, so --check is safe to run
 * against production at any time.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const LIFETIME_DAYS = 60;
const WARN_DAYS = 14;
const STAMP = 'TOKEN-REFRESHED';
const check = process.argv.includes('--check');

const TOKEN = process.env.IG_ACCESS_TOKEN;
const PAT = process.env.GH_PAT;
const REPO = process.env.GITHUB_REPOSITORY;          // "owner/repo" inside Actions

if (!TOKEN) { console.error('IG_ACCESS_TOKEN is not set'); process.exit(2); }

// ── how much life is left, according to our own bookkeeping ──
// The Instagram endpoint will not tell us the CURRENT token's expiry, only the
// new one's, so the deadline is tracked here. A missing stamp means we have
// never recorded one; treat that as unknown rather than inventing a date.
function daysRemaining() {
  if (!existsSync(STAMP)) return null;
  const line = readFileSync(STAMP, 'utf8').split('\n')
    .map(l => l.trim()).find(l => l && !l.startsWith('#'));
  if (!line) return null;
  const [iso, secs] = line.split('\t');
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const life = Number(secs) > 0 ? Number(secs) * 1000 : LIFETIME_DAYS * 864e5;
  return Math.floor((at + life - Date.now()) / 864e5);
}

const summary = [];
const say = (line) => { console.log(line); summary.push(line); };

// ── refresh ──
const url = new URL('https://graph.instagram.com/refresh_access_token');
url.searchParams.set('grant_type', 'ig_refresh_token');
url.searchParams.set('access_token', TOKEN);

const res = await fetch(url);
const body = await res.json().catch(() => ({}));

if (!res.ok || body.error) {
  const msg = JSON.stringify(body.error ?? body);
  say(`REFRESH FAILED: ${msg}`);
  say('The token is probably already expired or was revoked. Generate a new');
  say('long-lived token and update the IG_ACCESS_TOKEN repo secret.');
  writeSummary(1);
  process.exit(1);
}

const expiresDays = Math.floor((body.expires_in ?? LIFETIME_DAYS * 86400) / 86400);
say(`Instagram accepted the refresh — new token is good for ${expiresDays} days.`);

if (check) {
  const left = daysRemaining();
  say(left === null
    ? 'No TOKEN-REFRESHED stamp yet, so the live token\'s deadline is unknown.'
    : `Stored token has about ${left} days left.`);
  writeSummary(0);
  process.exit(0);
}

// ── store it back into the repo secret ──
if (!PAT) {
  const left = daysRemaining();
  say('');
  say('GH_PAT is not set, so the refreshed token could NOT be saved and the');
  say('old one is still in use. Automatic renewal is off.');
  say('');
  say('To turn it on: create a fine-grained personal access token with');
  say('"Secrets: read and write" on this repository, then add it as a repo');
  say('secret named GH_PAT. This job will then renew the token every week.');
  if (left !== null && left <= WARN_DAYS) {
    say('');
    say(`ACT NOW: the live token expires in about ${left} days. When it does,`);
    say('every scheduled post stops silently.');
    writeSummary(1);
    process.exit(1);
  }
  if (left !== null) say(`Live token has roughly ${left} days left.`);
  writeSummary(0);
  process.exit(0);
}

if (!REPO) { console.error('GITHUB_REPOSITORY is not set — run this inside Actions'); process.exit(2); }

const gh = async (path, init = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

// GitHub takes secrets sealed against the repo's public key. crypto_box_seal is
// X25519 + XSalsa20-Poly1305, which node:crypto does not expose, hence libsodium.
const sodium = (await import('libsodium-wrappers')).default;
await sodium.ready;

const { key, key_id } = await gh('actions/secrets/public-key');
const sealed = sodium.crypto_box_seal(
  sodium.from_string(body.access_token),
  sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
);
await gh('actions/secrets/IG_ACCESS_TOKEN', {
  method: 'PUT',
  body: JSON.stringify({
    encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
    key_id,
  }),
});

writeFileSync(STAMP, `${new Date().toISOString()}\t${body.expires_in ?? ''}\tstored\n`);
say('Stored the refreshed token in the IG_ACCESS_TOKEN secret.');
say(`Next deadline: ${new Date(Date.now() + expiresDays * 864e5).toISOString().slice(0, 10)}.`);
writeSummary(0);

function writeSummary(bad) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const head = bad ? '## ⚠️ Instagram token needs attention' : '## Instagram token';
  try { writeFileSync(out, `${head}\n\n${summary.map(l => l || '').join('\n')}\n`, { flag: 'a' }); } catch {}
}
