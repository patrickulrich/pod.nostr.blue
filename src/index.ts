import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export interface Env {
  PODCAST_INDEX_KEY: string;
  PODCAST_INDEX_SECRET: string;
  NOSTR_AUTH_MODE?: string; // "open" | "whitelist", default "open"
  NOSTR_ALLOWED_PUBKEYS?: string; // comma-separated hex pubkeys
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

const PODCAST_INDEX_API = "https://api.podcastindex.org/api/1.0";
const PODCAST_INDEX_STATIC = "https://api.podcastindex.org";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Normalize URL for comparison - handles trailing &, query param order differences
function normalizeUrlForComparison(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    // Sort query params for consistent comparison
    const params = new URLSearchParams(url.search);
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    // Reconstruct URL with sorted params (this also removes trailing &)
    return `${url.origin}${url.pathname}${sortedParams.toString() ? '?' + sortedParams.toString() : ''}`;
  } catch {
    // If URL parsing fails, fall back to simple trailing & removal
    return urlStr.replace(/[&?]$/, '');
  }
}

// NIP-98 Auth validation
async function validateNip98Auth(
  request: Request,
  env: Env
): Promise<{ valid: boolean; error?: string; pubkey?: string }> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  // Parse "Nostr <base64>" format
  const match = authHeader.match(/^Nostr\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: "Invalid Authorization format. Expected: Nostr <base64-event>" };
  }

  let event: NostrEvent;
  try {
    const decoded = atob(match[1]);
    event = JSON.parse(decoded);
  } catch {
    return { valid: false, error: "Invalid base64 or JSON in Authorization header" };
  }

  // Validate kind
  if (event.kind !== 27235) {
    return { valid: false, error: `Invalid event kind. Expected 27235, got ${event.kind}` };
  }

  // Validate timestamp (within 60 seconds)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > 60) {
    return { valid: false, error: "Event timestamp expired (must be within 60 seconds)" };
  }

  // Validate URL tag (normalize both URLs to handle trailing & and other minor differences)
  const urlTag = event.tags.find((t) => t[0] === "u");
  const normalizedRequestUrl = normalizeUrlForComparison(request.url);
  const normalizedEventUrl = urlTag ? normalizeUrlForComparison(urlTag[1]) : null;
  if (!normalizedEventUrl || normalizedEventUrl !== normalizedRequestUrl) {
    return {
      valid: false,
      error: `URL mismatch. Expected: ${request.url}, got: ${urlTag?.[1] || "missing"}`,
    };
  }

  // Validate method tag
  const methodTag = event.tags.find((t) => t[0] === "method");
  if (!methodTag || methodTag[1].toUpperCase() !== request.method.toUpperCase()) {
    return {
      valid: false,
      error: `Method mismatch. Expected: ${request.method}, got: ${methodTag?.[1] || "missing"}`,
    };
  }

  // Verify event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  const hash = sha256(new TextEncoder().encode(serialized));
  const computedId = bytesToHex(hash);

  if (computedId !== event.id) {
    return { valid: false, error: "Event ID verification failed" };
  }

  // Verify schnorr signature
  try {
    const sigBytes = hexToBytes(event.sig);
    const pubkeyBytes = hexToBytes(event.pubkey);
    const valid = schnorr.verify(sigBytes, hash, pubkeyBytes);
    if (!valid) {
      return { valid: false, error: "Invalid signature" };
    }
  } catch {
    return { valid: false, error: "Signature verification failed" };
  }

  // Check whitelist mode
  const authMode = env.NOSTR_AUTH_MODE || "open";
  if (authMode === "whitelist") {
    const allowedPubkeys = (env.NOSTR_ALLOWED_PUBKEYS || "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0);

    if (!allowedPubkeys.includes(event.pubkey.toLowerCase())) {
      return { valid: false, error: "Pubkey not in whitelist" };
    }
  }

  return { valid: true, pubkey: event.pubkey };
}

// Helper to convert hex string to bytes
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Check if endpoint requires NIP-98 auth
function requiresNip98Auth(path: string): boolean {
  // Health and static endpoints don't require auth
  if (path === "/" || path === "/health" || path.startsWith("/static/")) {
    return false;
  }
  return true;
}

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
  // Apple Replacement (no auth required)
  "/search",
  "/lookup",

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
  "/recent/newvaluefeeds",
  "/recent/data",
  "/recent/soundbites",

  // Value (no auth required)
  "/value/byfeedid",
  "/value/byfeedurl",
  "/value/bypodcastguid",
  "/value/byepisodeguid",

  // Stats
  "/stats/current",

  // Categories
  "/categories/list",

  // Hub (no auth required)
  "/hub/pubnotify",

  // Static data (no auth required, different base URL)
  "/static/stats/daily_counts.json",
  "/static/stats/hourly_counts.json",
  "/static/stats/chart-data.json",
  "/static/stats/v4vmusic.json",
  "/static/stats/v4vmusic.opml",
  "/static/stats/v4vmusic.rss",
  "/static/tracking/current",
  "/static/tracking/feedValueBlocks",
  "/static/tracking/episodeValueBlocks",
  "/static/public/podcastindex_dead_feeds.csv",
  "/static/public/podcastindex_feeds.db.tgz",
];

// Endpoints that don't require authentication
const NO_AUTH_PREFIXES = [
  "/search",      // Apple replacement (but not /search/byterm etc which need auth)
  "/lookup",
  "/value/",
  "/hub/",
  "/static/",
];

// Specific search endpoints that DO require auth (exceptions to /search prefix)
const AUTH_REQUIRED_SEARCH = [
  "/search/byterm",
  "/search/bytitle",
  "/search/byperson",
  "/search/music/byterm",
];

function requiresAuth(path: string): boolean {
  // Check if it's a search endpoint that requires auth
  if (AUTH_REQUIRED_SEARCH.some(endpoint => path.startsWith(endpoint))) {
    return true;
  }
  // Check if it matches a no-auth prefix
  if (NO_AUTH_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return false;
  }
  // Default: require auth
  return true;
}

function isStaticEndpoint(path: string): boolean {
  return path.startsWith("/static/");
}

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
        auth: "NIP-98",
        endpoints: ALLOWED_ENDPOINTS
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NIP-98 Authentication check (skip for static endpoints)
    if (requiresNip98Auth(path)) {
      const authResult = await validateNip98Auth(request, env);
      if (!authResult.valid) {
        return new Response(JSON.stringify({
          error: "Unauthorized",
          details: authResult.error,
          hint: "Include 'Authorization: Nostr <base64-encoded-kind-27235-event>' header"
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Check for API credentials (only required for authenticated endpoints)
    const needsAuth = requiresAuth(path);
    if (needsAuth && (!env.PODCAST_INDEX_KEY || !env.PODCAST_INDEX_SECRET)) {
      return new Response(JSON.stringify({ error: "API credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Build headers - only include auth for endpoints that require it
      const headers: Record<string, string> = {
        "User-Agent": "nostr.blue/1.0",
      };

      if (needsAuth) {
        const authHeaders = await generateAuthHeaders(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
        Object.assign(headers, authHeaders);
      }

      // Build the PodcastIndex API URL
      // Static endpoints use a different base URL (no /api/1.0 prefix)
      const baseUrl = isStaticEndpoint(path) ? PODCAST_INDEX_STATIC : PODCAST_INDEX_API;
      const apiUrl = `${baseUrl}${path}${url.search}`;

      // Make request to PodcastIndex
      const response = await fetch(apiUrl, {
        method: "GET",
        headers,
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
