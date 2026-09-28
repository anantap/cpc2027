const { redis } = require('../lib/redis');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// One-off import of the Couch to 5K runs (recorded before Suunto), kept in Redis rather
// than in the public repo. The first import needs no password; replacing an existing import
// needs the Intervals.icu athlete ID.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { athlete, runs } = req.body || {};
  const existing = await redis.get('c25k');
  const authorised = process.env.INTERVALS_ATHLETE_ID && String(athlete || '').trim() === process.env.INTERVALS_ATHLETE_ID;
  if (existing && existing.length && !authorised) {
    return res.status(403).send('Er zijn al runs geïmporteerd; vul je athlete ID in om ze te vervangen');
  }
  if (!Array.isArray(runs) || !runs.length || runs.length > 100) {
    return res.status(400).send('Geen geldige lijst met runs');
  }

  const clean = [];
  for (const r of runs) {
    const distance = Number(r && r.distance_km);
    const time = Number(r && r.moving_time_s);
    if (!DATE.test(r && r.date) || !START.test(r && r.start) || !(distance > 0 && distance < 50) || !(time > 0 && time < 20000)) {
      return res.status(400).send('Ongeldige run: ' + JSON.stringify(r).slice(0, 120));
    }
    clean.push({
      id: 'c25k-' + r.date,
      name: 'Watch to 5K',
      source: 'c25k',
      date: r.date,
      start: r.start,
      distance_km: Math.round(distance * 100) / 100,
      moving_time_s: Math.round(time),
    });
  }

  await redis.set('c25k', clean);
  return res.status(200).json({ ok: true, runs: clean.length });
};
