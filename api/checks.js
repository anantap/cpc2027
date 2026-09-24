const { redis } = require('../lib/redis');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const data = await redis.get('checks');
    return res.status(200).json(data || {});
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).send('Invalid JSON');
    }
    await redis.set('checks', body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).send('Method Not Allowed');
};
