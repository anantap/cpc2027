const { redis } = require('../lib/redis');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  const runs = Object.values((await redis.hgetall('runs')) || {});
  runs.sort((a, b) => a.date.localeCompare(b.date));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(runs);
};
