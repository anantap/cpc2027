const { redis } = require('../lib/redis');
const { fetchRuns } = require('../lib/intervals');

// Refresh from Intervals.icu at most this often; otherwise serve the cached list.
const MAX_AGE_S = 5 * 60;

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

  // Couch to 5K runs from the one-off Apple Health import come first.
  const c25k = (await redis.get('c25k')) || [];

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(c25k.concat(runs));
};
