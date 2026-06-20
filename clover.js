exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' })
    };
  }

  let merchantId, token;
  try {
    const body = JSON.parse(event.body || '{}');
    merchantId = body.merchantId;
    token = body.token;
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body.' })
    };
  }

  if (!merchantId || !token) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing merchantId or token.' })
    };
  }

  try {
    const url = `https://api.clover.com/v3/merchants/${merchantId}/items?expand=itemStock&limit=500`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await resp.json();

    if (!resp.ok) {
      let msg = data.message || `Clover error ${resp.status}`;
      if (resp.status === 401) msg = 'Invalid token — check your Clover API token.';
      if (resp.status === 404) msg = 'Merchant not found — check your Merchant ID.';
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: msg })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not reach Clover. Check your internet connection and credentials.' })
    };
  }
};
