const { redis } = require('../lib/redis');
const { writeWeekSummary } = require('../lib/coach');

// Week keys look like consol-w5, tussen-w2, build-w12 or final-w3.
const WEEK_KEY = /^(consol|tussen|build|final)-w\d{1,2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined;
}

function cleanSessions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 4).map((s) => ({
    label: clean(s && s.label),
    distance: clean(s && s.distance),
    description: clean(s && s.description),
    status: clean(s && s.status),
  }));
}

function pace(seconds, km) {
  const sec = Math.round(seconds / km);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + ' /km';
}

function between(runs, from, days) {
  const start = Date.parse(from + 'T00:00:00Z');
  return runs.filter((r) => {
    const t = Date.parse(r.date + 'T00:00:00Z');
    return t >= start && t < start + days * DAY;
  });
}

function totals(runs) {
  const km = runs.reduce((sum, r) => sum + r.distance_km, 0);
  const time = runs.reduce((sum, r) => sum + r.moving_time_s, 0);
  return { runs: runs.length, km: Math.round(km * 10) / 10, avg_pace: km ? pace(time, km) : null };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // GET: every weekly summary written so far, keyed by week.
  if (req.method === 'GET') {
    return res.status(200).json((await redis.hgetall('weeksummaries')) || {});
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body || {};
  if (!WEEK_KEY.test(body.key || '') || !DATE.test(body.start || '')) {
    return res.status(400).send('Invalid request');
  }

  const existing = await redis.hget('weeksummaries', body.key);
  if (existing) return res.status(200).json(existing);
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).send('Coach not configured');

  // Runs come from our own import, never from the request.
  const runs = (await redis.get('runs')) || [];
  const weekRuns = between(runs, body.start, 7);
  if (!weekRuns.length) return res.status(409).send('No runs in this week');

  if (!(await redis.set('weeksummary-lock:' + body.key, 1, { nx: true, ex: 120 }))) {
    return res.status(202).json({ pending: true });
  }

  try {
    const previous = [1, 2, 3].map((n) => {
      const start = new Date(Date.parse(body.start + 'T00:00:00Z') - n * 7 * DAY).toISOString().slice(0, 10);
      return { week_starting: start, ...totals(between(runs, start, 7)) };
    });
    const summary = await writeWeekSummary({
      week: { title: clean(body.title), focus: clean(body.focus), starts: body.start },
      planned_sessions: cleanSessions(body.sessions),
      runs: weekRuns.map((r) => ({
        date: r.date, name: r.name, distance_km: r.distance_km,
        moving_time_s: r.moving_time_s, pace: pace(r.moving_time_s, r.distance_km),
      })),
      week_totals: totals(weekRuns),
      previous_weeks: previous,
      next_week: body.next ? {
        title: clean(body.next.title),
        focus: clean(body.next.focus),
        sessions: cleanSessions(body.next.sessions),
      } : null,
    });
    const stored = { ...summary, created: new Date().toISOString() };
    await redis.hset('weeksummaries', { [body.key]: stored });
    return res.status(200).json(stored);
  } catch (err) {
    console.error('Week summary:', err);
    return res.status(502).send('Summary failed');
  } finally {
    await redis.del('weeksummary-lock:' + body.key);
  }
};
