const ASSET_PREFIX = '/vendor/';

/**
 * Main fetch event handler with timeout protection
 */
addEventListener('fetch', (event) => {
  event.respondWith(
    Promise.race([
      handleRequest(event.request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Worker timeout')), 25000),
      ),
    ]).catch((error) => {
      console.error('[Worker Error]', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: createCorsHeaders() },
      );
    }),
  );
});

/**
 * Handle incoming requests for ffmpeg assets
 */
async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    // Only handle /vendor/* requests
    if (!url.pathname.startsWith(ASSET_PREFIX)) {
      return await fetch(request);
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(),
      });
    }

    // Handle GET and HEAD only
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: createCorsHeaders(),
      });
    }

    const key = url.pathname.slice(ASSET_PREFIX.length);

    // Validate key format (prevent directory traversal)
    if (!key || key.includes('..') || key.includes('//')) {
      return new Response('Invalid request', { status: 400, headers: createCorsHeaders() });
    }

    // Fetch object from R2
    let object;
    try {
      object = await R2_ASSETS.get(key);
    } catch (err) {
      console.error(`[R2 Error] Failed to get key '${key}':`, err);
      return new Response(
        JSON.stringify({ error: `Failed to fetch asset: ${err.message}` }),
        { status: 500, headers: createCorsHeaders() },
      );
    }

    if (!object) {
      return new Response(
        JSON.stringify({ error: `Asset not found: ${key}` }),
        { status: 404, headers: createCorsHeaders() },
      );
    }

    // Determine content type
    const extension = key.split('.').pop()?.toLowerCase();
    const contentType = getContentType(extension);

    // Build response headers
    const headers = createCorsHeaders();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.set('Content-Length', object.size.toString());

    // Return response (omit body for HEAD requests)
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error('[Unexpected Error]', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: createCorsHeaders() },
    );
  }
}

/**
 * Determine MIME type based on file extension
 */
function getContentType(extension) {
  const typeMap = {
    wasm: 'application/wasm',
    js: 'application/javascript',
    json: 'application/json',
  };
  return typeMap[extension] || 'application/octet-stream';
}

/**
 * Create CORS headers for cross-origin requests
 */
function createCorsHeaders() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Range');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}
