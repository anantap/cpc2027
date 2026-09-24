const { redis } = require('./redis');

const API = 'https://www.strava.com/api/v3';
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
// Only runs from the start of the consolidation phase onwards are relevant to the plan.
const PLAN_START = '2026-08-17';

async function tokenRequest(params) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status}`);
  return res.json();
}

async function saveTokens(t) {
  const tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at,
    athlete_id: t.athlete ? t.athlete.id : undefined,
  };
  const previous = (await redis.get('strava:tokens')) || {};
  const merged = { ...previous, ...tokens };
  if (merged.athlete_id === undefined) merged.athlete_id = previous.athlete_id;
  await redis.set('strava:tokens', merged);
  return merged;
}

async function exchangeCode(code) {
  return saveTokens(await tokenRequest({ code, grant_type: 'authorization_code' }));
}

async function getAccessToken() {
  let tokens = await redis.get('strava:tokens');
  if (!tokens) throw new Error('Strava is not connected');
  if (tokens.expires_at - 60 < Date.now() / 1000) {
    tokens = await saveTokens(
      await tokenRequest({ refresh_token: tokens.refresh_token, grant_type: 'refresh_token' })
    );
  }
  return tokens.access_token;
}

async function stravaGet(path) {
  const token = await getAccessToken();
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Strava GET ${path} failed: ${res.status}`);
  return res.json();
}

// Keep only what the page needs: no GPS track, no location.
function summarize(a) {
  return {
    id: a.id,
    name: a.name,
    date: a.start_date_local.slice(0, 10),
    start: a.start_date_local,
    distance_km: Math.round(a.distance / 10) / 100,
    moving_time_s: a.moving_time,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
  };
}

function isPlanRun(a) {
  return RUN_TYPES.includes(a.sport_type || a.type) && a.start_date_local.slice(0, 10) >= PLAN_START;
}

async function storeActivity(id) {
  const a = await stravaGet(`/activities/${id}`);
  if (isPlanRun(a)) {
    await redis.hset('runs', { [a.id]: summarize(a) });
  } else {
    await redis.hdel('runs', String(a.id));
  }
}

async function backfill() {
  const after = Math.floor(new Date(PLAN_START + 'T00:00:00Z').getTime() / 1000);
  for (let page = 1; page <= 5; page++) {
    const list = await stravaGet(`/athlete/activities?after=${after}&per_page=100&page=${page}`);
    const runs = list.filter(isPlanRun);
    if (runs.length) {
      await redis.hset('runs', Object.fromEntries(runs.map((a) => [a.id, summarize(a)])));
    }
    if (list.length < 100) break;
  }
}

// Strava allows one webhook subscription per app; create it if it doesn't exist yet.
async function ensureSubscription(callbackUrl) {
  const qs = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
  });
  const existing = await (await fetch(`${API}/push_subscriptions?${qs}`)).json();
  if (Array.isArray(existing) && existing.some((s) => s.callback_url === callbackUrl)) return;
  const res = await fetch(`${API}/push_subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: process.env.STRAVA_VERIFY_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Strava subscription failed: ${res.status} ${await res.text()}`);
}

module.exports = { exchangeCode, storeActivity, backfill, ensureSubscription };
