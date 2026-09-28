const { redis } = require('../lib/redis');
const { fetchRuns } = require('../lib/intervals');

// Refresh from Intervals.icu at most this often; otherwise serve the cached list.
const MAX_AGE_S = 5 * 60;

// The Couch to 5K list can also live in the private C25K_RUNS environment variable, as
// [{date, start, distance_km, moving_time_s}, ...].
function c25kFromEnv() {
  try {
    const list = JSON.parse(process.env.C25K_RUNS || '[]');
    return list.map((r) => ({
      id: 'c25k-' + r.date,
      name: 'Watch to 5K',
      source: 'c25k',
      date: r.date,
      start: r.start,
      distance_km: Number(r.distance_km),
      moving_time_s: Number(r.moving_time_s),
    }));
  } catch (err) {
    console.error('C25K_RUNS is not valid JSON:', err);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  let runs = (await redis.get('runs')) || [];
  const syncedAt = (await redis.get('runs:synced_at')) || 0;
  const stale = Date.now() / 1000 - syncedAt > MAX_AGE_S;

  if (process.env.INTERVALS_API_KEY && stale && (await redis.set('runs:lock', 1, { nx: true, ex: 30 }))) {
    try {
      runs = await fetchRuns();
      await redis.set('runs', runs);
      await redis.set('runs:synced_at', Math.floor(Date.now() / 1000));
    } catch (err) {
      console.error('Intervals.icu sync:', err);
    } finally {
      await redis.del('runs:lock');
    }
  }

  // Couch to 5K runs (from Apple Health, before Suunto) come first.
  const c25k = (await redis.get('c25k')) || c25kFromEnv();

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(c25k.concat(runs));
};
