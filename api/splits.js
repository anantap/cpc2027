const { redis } = require('../lib/redis');
const { fetchStreams, splitsFromStreams, STOPPED } = require('../lib/splits');

// Diagnostics for one run's splits: /api/splits?id=<run id>, or ?id=latest.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  res.setHeader('Cache-Control', 'no-store');
  const runs = (await redis.get('runs')) || [];
  const run = req.query.id === 'latest' ? runs[runs.length - 1] : runs.find((r) => r.id === req.query.id);
  if (!run) return res.status(404).send('Unknown run');

  const { time, distance } = await fetchStreams(run.id);
  const summary = await redis.get('summary:' + run.id);
  if (!time) return res.status(200).json({ run, streams: 'missing', summary });

  const fmt = (s) => ({ km: s.km, time: Math.floor(s.seconds / 60) + ':' + String(s.seconds % 60).padStart(2, '0') });
  // Every sample slower than walking pace: [elapsed s, seconds since previous sample, metres since previous sample].
  const slow = [];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const dd = distance[i] - distance[i - 1];
    if (dt > 0 && dd / dt < 1.5) slow.push([time[i], dt, Math.round(dd * 10) / 10]);
  }
  return res.status(200).json({
    run,
    samples: time.length,
    elapsed_s: time[time.length - 1] - time[0],
    stopped_below_ms: STOPPED,
    moving: splitsFromStreams(time, distance).map(fmt),
    elapsed: splitsFromStreams(time, distance, true).map(fmt),
    summary_splits: summary ? summary.splits || null : null,
    summary_created: summary ? summary.created : null,
    slow_samples: slow.slice(0, 200),
  });
};
