const { redis } = require('../lib/redis');
const { fetchSplits } = require('../lib/splits');
const { writeSummary } = require('../lib/coach');

// Plan details come from the page; keep them short and plain.
function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined;
}

function cleanSession(s) {
  if (!s || typeof s !== 'object') return null;
  return { label: clean(s.label), distance: clean(s.distance), description: clean(s.description), week: clean(s.week) };
}

function pace(run) {
  const sec = Math.round(run.moving_time_s / run.distance_km);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + ' /km';
}

function describe(run) {
  return { date: run.date, start: run.start, name: run.name, distance_km: run.distance_km, moving_time_s: run.moving_time_s, pace: pace(run) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const runs = (await redis.get('runs')) || [];

  // GET: every summary written so far, keyed by run id.
  if (req.method === 'GET') {
    if (!runs.length) return res.status(200).json({});
    const values = await redis.mget(...runs.map((r) => 'summary:' + r.id));
    const out = {};
    runs.forEach((r, i) => { if (values[i]) out[r.id] = values[i]; });
    return res.status(200).json(out);
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // POST: write the summary for one run, once. Only runs we imported can be summarised.
  const { id, planned, next } = req.body || {};
  const index = runs.findIndex((r) => r.id === id);
  if (index === -1) return res.status(404).send('Unknown run');

  const key = 'summary:' + id;
  const existing = await redis.get(key);
  if (existing) return res.status(200).json(existing);
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).send('Coach not configured');
  if (!(await redis.set('summary-lock:' + id, 1, { nx: true, ex: 120 }))) {
    return res.status(202).json({ pending: true });
  }

  try {
    const run = runs[index];
    let splits = [];
    try {
      splits = await fetchSplits(run.id);
    } catch (err) {
      console.error('Splits:', err);
    }
    const summary = await writeSummary({
      run: describe(run),
      km_splits: splits.map((s) => ({
        km: s.km,
        time: Math.floor(s.seconds / 60) + ':' + String(s.seconds % 60).padStart(2, '0'),
        ...(s.partial_m ? { partial_m: s.partial_m } : {}),
      })),
      planned_session: cleanSession(planned),
      next_planned_session: cleanSession(next),
      recent_runs: runs.slice(Math.max(0, index - 6), index).map(describe),
    });
    const stored = { ...summary, created: new Date().toISOString() };
    await redis.set(key, stored);
    return res.status(200).json(stored);
  } catch (err) {
    console.error('Summary:', err);
    return res.status(502).send('Summary failed');
  } finally {
    await redis.del('summary-lock:' + id);
  }
};
