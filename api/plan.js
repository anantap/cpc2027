const { redis } = require('../lib/redis');

const SESSION_ID = /^(consol|tussen|build|final)-w\d{1,2}-r\d$/;

// Changes to the plan that you approved from a coach suggestion. Nothing changes without a tap:
// the coach only proposes (stored with its run summary), and only shorter or skipped sessions.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const [overrides, answers] = await Promise.all([redis.hgetall('overrides'), redis.hgetall('suggestion-answers')]);
    return res.status(200).json({ overrides: overrides || {}, answers: answers || {} });
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { action, run_id: runId, session_id: sessionId } = req.body || {};

  // Put a changed session back as planned.
  if (action === 'reset') {
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return res.status(400).send('Invalid request');
    await redis.hdel('overrides', sessionId);
    return res.status(200).json({ ok: true });
  }

  if (action !== 'accept' && action !== 'decline') return res.status(400).send('Invalid request');
  const summary = typeof runId === 'string' ? await redis.get('summary:' + runId) : null;
  const suggestion = summary && summary.voorstel;
  if (!suggestion || suggestion.soort === 'geen') return res.status(404).send('No suggestion');

  if (action === 'accept') {
    if (suggestion.soort === 'overslaan') {
      await redis.sadd('skips', suggestion.sessie_id);
    } else {
      await redis.hset('overrides', { [suggestion.sessie_id]: { km: suggestion.km, reden: suggestion.reden, run_id: runId } });
    }
  }
  await redis.hset('suggestion-answers', { [runId]: action === 'accept' ? 'accepted' : 'declined' });
  return res.status(200).json({ ok: true, suggestion });
};
