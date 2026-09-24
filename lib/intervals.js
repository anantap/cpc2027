const API = 'https://intervals.icu/api/v1';
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
// Only runs from the start of the consolidation phase onwards are relevant to the plan.
const PLAN_START = '2026-08-17';

// Keep only what the page needs: no GPS track, no location.
function summarize(a) {
  return {
    id: a.id,
    name: a.name,
    date: a.start_date_local.slice(0, 10),
    start: a.start_date_local,
    distance_km: Math.round(a.distance / 10) / 100,
    moving_time_s: a.moving_time,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
  };
}

async function fetchRuns() {
  const athlete = process.env.INTERVALS_ATHLETE_ID || '0';
  const today = new Date().toISOString().slice(0, 10);
  const auth = Buffer.from('API_KEY:' + process.env.INTERVALS_API_KEY).toString('base64');
  const res = await fetch(`${API}/athlete/${athlete}/activities?oldest=${PLAN_START}&newest=${today}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Intervals.icu activities failed: ${res.status}`);
  const list = await res.json();
  return list
    .filter((a) => RUN_TYPES.includes(a.type) && a.start_date_local && a.distance > 0 && a.moving_time > 0)
    .map(summarize)
    .sort((a, b) => a.start.localeCompare(b.start));
}

module.exports = { fetchRuns };
