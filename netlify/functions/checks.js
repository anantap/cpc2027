const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const store = getStore('cpc10k-checks');

  if (event.httpMethod === 'GET') {
    const data = await store.get('state', { type: 'json' });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
    await store.setJSON('state', body);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
