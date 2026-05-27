const ASSET_PREFIX = '/vendor/';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(ASSET_PREFIX)) {
    return fetch(request);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: createCorsHeaders(),
    });
  }

  const key = url.pathname.slice(ASSET_PREFIX.length);
  if (!key) {
    return new Response('Not found', { status: 404, headers: createCorsHeaders() });
  }

  const object = await R2_ASSETS.get(key);
  if (!object) {
    return new Response('Not found', { status: 404, headers: createCorsHeaders() });
  }

  const extension = key.split('.').pop()?.toLowerCase();
  const contentType = extension === 'wasm'
    ? 'application/wasm'
    : extension === 'js'
      ? 'application/javascript'
      : 'application/octet-stream';

  const headers = createCorsHeaders();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(object.body, { headers });
}

function createCorsHeaders() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}
