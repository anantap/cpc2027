const API = 'https://intervals.icu/api/v1';

function authHeader() {
  return 'Basic ' + Buffer.from('API_KEY:' + process.env.INTERVALS_API_KEY).toString('base64');
}

// Per-kilometre times from the activity's time and distance streams. Like the watch's laps,
// these are moving time: standing still (a traffic light, a pause) doesn't count.
// A final partial km of 200 m+ is included.
// Returns both: moving splits, and elapsed splits (stops included, how they were measured before).
async function fetchSplits(activityId) {
  const { time, distance } = await fetchStreams(activityId);
  if (!time) return { moving: [], elapsed: [] };
  return { moving: splitsFromStreams(time, distance), elapsed: splitsFromStreams(time, distance, true) };
}

async function fetchStreams(activityId) {
  const res = await fetch(`${API}/activity/${encodeURIComponent(activityId)}/streams.json?types=time,distance`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Intervals.icu streams failed: ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : Object.entries(body).map(([type, data]) => ({ type, data }));
  const stream = (type) => (list.find((s) => s.type === type) || {}).data;
  const time = stream('time');
  const distance = stream('distance');
  if (!Array.isArray(time) || !Array.isArray(distance) || time.length !== distance.length) return {};
  return { time, distance };
}

// Slower than this (m/s) counts as standing still, if it lasts at least MIN_STOP seconds.
// The watch stops recording during a pause, which shows up as a gap in the samples. Shorter
// still moments are just the GPS distance updating in steps.
const STOPPED = 0.5;
const MIN_STOP = 5;

// Time with the stops taken out, per sample.
function movingClock(time, distance) {
  const n = time.length;
  const still = [false];
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1];
    still.push(!(dt > 0 && (distance[i] - distance[i - 1]) / dt >= STOPPED));
  }
  // Steps in a still stretch of MIN_STOP seconds or more don't count.
  const counts = still.map((s) => !s);
  for (let i = 1; i < n; ) {
    if (!still[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && still[j + 1]) j++;
    if (time[j] - time[i - 1] < MIN_STOP) for (let k = i; k <= j; k++) counts[k] = true;
    i = j + 1;
  }
  const clock = [0];
  for (let i = 1; i < n; i++) clock.push(clock[i - 1] + (counts[i] ? time[i] - time[i - 1] : 0));
  return clock;
}

// Missing distance samples carry the last known distance.
function fillGaps(distance) {
  let last = 0;
  return distance.map((d) => (typeof d === 'number' ? (last = d) : last));
}

function splitsFromStreams(clock, rawDistance, elapsed = false) {
  const distance = fillGaps(rawDistance);
  const time = elapsed ? clock : movingClock(clock, distance);
  const splits = [];
  let next = 1000;
  let lastTime = time[0];
  let lastDistance = 0;
  for (let i = 1; i < distance.length; i++) {
    while (distance[i] >= next) {
      // Interpolate the moment the kilometre mark was passed.
      const f = (next - distance[i - 1]) / (distance[i] - distance[i - 1] || 1);
      const t = time[i - 1] + f * (time[i] - time[i - 1]);
      splits.push({ km: next / 1000, seconds: Math.round(t - lastTime) });
      lastTime = t;
      lastDistance = next;
      next += 1000;
    }
  }
  const rest = distance[distance.length - 1] - lastDistance;
  if (rest >= 200) {
    const seconds = time[time.length - 1] - lastTime;
    splits.push({ km: Math.round(distance[distance.length - 1] / 10) / 100, seconds: Math.round(seconds), partial_m: Math.round(rest) });
  }
  return splits;
}

module.exports = { fetchSplits, splitsFromStreams };
