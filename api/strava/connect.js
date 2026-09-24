// Starts the Strava login. Protected by STRAVA_CONNECT_KEY so nobody else can link their account.
module.exports = (req, res) => {
  if (!process.env.STRAVA_CONNECT_KEY || req.query.key !== process.env.STRAVA_CONNECT_KEY) {
    return res.status(403).send('Forbidden');
  }
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: `https://${req.headers.host}/api/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: req.query.key,
  });
  res.redirect(302, `https://www.strava.com/oauth/authorize?${params}`);
};
