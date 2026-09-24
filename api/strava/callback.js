const { exchangeCode, backfill, ensureSubscription } = require('../../lib/strava');

module.exports = async (req, res) => {
  if (!process.env.STRAVA_CONNECT_KEY || req.query.state !== process.env.STRAVA_CONNECT_KEY) {
    return res.status(403).send('Forbidden');
  }
  if (req.query.error || !req.query.code) {
    return res.status(400).send('Strava-koppeling geannuleerd.');
  }
  if (!String(req.query.scope || '').includes('activity:read')) {
    return res.status(400).send('Geef toegang tot je activiteiten om te koppelen.');
  }

  await exchangeCode(req.query.code);
  await backfill();
  await ensureSubscription(`https://${req.headers.host}/api/strava/webhook`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<p>Strava gekoppeld. Je runs verschijnen nu in het trainingsplan.</p><p><a href="/">Terug naar het plan</a></p>');
};
