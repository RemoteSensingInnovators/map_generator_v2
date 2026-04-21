export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(targetUrl);
    
    // Clone headers to pass them through
    const headers = new Headers(response.headers);
    // Force CORS headers
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: `Server xatosi: ${error.message}` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
