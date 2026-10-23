const { redis } = require('../lib/redis');

const EFFORTS = ['makkelijk', 'goed', 'zwaar'];

// How a run felt: effort and shin pain (0-10), one entry per run, saved from the start screen.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json((await redis.hgetall('feel')) || {});
  }

  if (req.method === 'POST') {
    const { id, effort, shin } = req.body || {};
    const runs = (await redis.get('runs')) || [];
    if (!runs.some((r) => r.id === id)) return res.status(404).send('Unknown run');
    if (!EFFORTS.includes(effort) || !Number.isInteger(shin) || shin < 0 || shin > 10) {
      return res.status(400).send('Invalid request');
    }
    const entry = { effort, shin, at: new Date().toISOString() };
    await redis.hset('feel', { [id]: entry });
    return res.status(200).json(entry);
  }

  return res.status(405).send('Method Not Allowed');
};
