export interface Env {
  PODCAST_INDEX_KEY: string;
  PODCAST_INDEX_SECRET: string;
}

const PODCAST_INDEX_API = "https://api.podcastindex.org/api/1.0";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Generate PodcastIndex auth headers
async function generateAuthHeaders(apiKey: string, apiSecret: string): Promise<Record<string, string>> {
  const authDate = Math.floor(Date.now() / 1000);
  const authString = apiKey + apiSecret + authDate;

  // Create SHA1 hash using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(authString);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const authHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return {
    "User-Agent": "nostr.blue/1.0",
    "X-Auth-Key": apiKey,
    "X-Auth-Date": authDate.toString(),
    "Authorization": authHash,
  };
}

// Available PodcastIndex endpoints to proxy
const ALLOWED_ENDPOINTS = [
  // Search
  "/search/byterm",
  "/search/bytitle",
  "/search/byperson",
  "/search/music/byterm",

  // Podcasts
  "/podcasts/byfeedid",
  "/podcasts/byfeedurl",
  "/podcasts/byitunesid",
  "/podcasts/byguid",
  "/podcasts/bytag",
  "/podcasts/bymedium",
  "/podcasts/trending",
  "/podcasts/dead",

  // Episodes
  "/episodes/byfeedid",
  "/episodes/byfeedurl",
  "/episodes/byitunesid",
  "/episodes/byguid",
  "/episodes/byid",
  "/episodes/bypodcastguid",
  "/episodes/live",
  "/episodes/random",

  // Recent
  "/recent/episodes",
  "/recent/feeds",
  "/recent/newfeeds",
  "/recent/soundbites",

  // Value
  "/value/byfeedid",
  "/value/byfeedurl",
  "/value/bypodcastguid",

  // Stats
  "/stats/current",

  // Categories
  "/categories/list",

  // Hub
  "/hub/pubnotify",
];

function isAllowedEndpoint(path: string): boolean {
  return ALLOWED_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow GET requests
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check endpoint
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "podcastindex-proxy",
        endpoints: ALLOWED_ENDPOINTS
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate endpoint
    if (!isAllowedEndpoint(path)) {
      return new Response(JSON.stringify({
        error: "Endpoint not allowed",
        allowed: ALLOWED_ENDPOINTS
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for API credentials
    if (!env.PODCAST_INDEX_KEY || !env.PODCAST_INDEX_SECRET) {
      return new Response(JSON.stringify({ error: "API credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Generate auth headers
      const authHeaders = await generateAuthHeaders(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);

      // Build the PodcastIndex API URL
      const apiUrl = `${PODCAST_INDEX_API}${path}${url.search}`;

      // Make request to PodcastIndex
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: authHeaders,
      });

      // Get response body
      const body = await response.text();

      // Return response with CORS headers
      return new Response(body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          "Content-Type": response.headers.get("Content-Type") || "application/json",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: "Proxy error", details: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
