const { redis } = require('../lib/redis');

// Session ids look like consol-w2-r3, tussen-w1-r2, build-w12-r1 or final-w3-r3.
const SESSION_ID = /^(consol|tussen|build|final)-w\d{1,2}-r\d$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json((await redis.smembers('skips')) || []);
  }

  if (req.method === 'POST') {
    const { id, skipped } = req.body || {};
    if (typeof id !== 'string' || !SESSION_ID.test(id) || typeof skipped !== 'boolean') {
      return res.status(400).send('Invalid request');
    }
    if (skipped) await redis.sadd('skips', id);
    else await redis.srem('skips', id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).send('Method Not Allowed');
};
