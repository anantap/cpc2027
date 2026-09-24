const { waitUntil } = require('@vercel/functions');
const { redis } = require('../../lib/redis');
const { storeActivity } = require('../../lib/strava');

module.exports = async (req, res) => {
  // Subscription handshake: echo the challenge if the verify token matches.
  if (req.method === 'GET') {
    if (req.query['hub.verify_token'] !== process.env.STRAVA_VERIFY_TOKEN) {
      return res.status(403).send('Forbidden');
    }
    return res.status(200).json({ 'hub.challenge': req.query['hub.challenge'] });
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const event = req.body || {};
  if (event.object_type === 'activity') {
    // Strava expects a reply within 2 seconds, so do the work after responding.
    waitUntil(
      (async () => {
        const tokens = await redis.get('strava:tokens');
        if (!tokens || String(event.owner_id) !== String(tokens.athlete_id)) return;
        if (event.aspect_type === 'delete') {
          await redis.hdel('runs', String(event.object_id));
        } else {
          await storeActivity(event.object_id);
        }
      })().catch((err) => console.error('Strava webhook:', err))
    );
  }
  return res.status(200).json({ ok: true });
};
