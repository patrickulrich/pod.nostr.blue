# PodcastIndex API Proxy for Nostr

A Cloudflare Worker that proxies requests to the [PodcastIndex API](https://podcastindex-org.github.io/docs-api/) with [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) authentication for nostr.blue.

## Features

- Full PodcastIndex API coverage (45 endpoints)
- NIP-98 Nostr authentication
- Configurable access control (open or whitelist mode)
- CORS enabled for browser requests
- 5-minute response caching

## Authentication

This API uses [NIP-98 HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md). All API endpoints require authentication except `/`, `/health`, and `/static/*`.

### How NIP-98 Works

1. Create a kind `27235` nostr event with the request URL and method
2. Sign it with your nostr private key
3. Base64 encode the event
4. Send it in the `Authorization: Nostr <base64-event>` header

### Auth Event Structure

```json
{
  "kind": 27235,
  "created_at": <current-unix-timestamp>,
  "tags": [
    ["u", "https://api.nostr.blue/search/byterm?q=bitcoin"],
    ["method", "GET"]
  ],
  "content": "",
  "pubkey": "<your-pubkey>",
  "id": "<event-id>",
  "sig": "<schnorr-signature>"
}
```

### Validation Rules

- `kind` must be `27235`
- `created_at` must be within 60 seconds of current time
- `u` tag must match the exact request URL
- `method` tag must match the HTTP method
- Event signature must be valid

### JavaScript Example

```javascript
import { getPublicKey, getEventHash, signEvent } from 'nostr-tools';

async function fetchWithNostrAuth(url, privateKey) {
  const pubkey = getPublicKey(privateKey);

  const event = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', 'GET']
    ],
    content: '',
    pubkey
  };

  event.id = getEventHash(event);
  event.sig = signEvent(event, privateKey);

  const authHeader = 'Nostr ' + btoa(JSON.stringify(event));

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader
    }
  });

  return response.json();
}

// Usage
const data = await fetchWithNostrAuth(
  'https://api.nostr.blue/search/byterm?q=bitcoin',
  'your-private-key-hex'
);
```

### Error Responses

```json
{
  "error": "Unauthorized",
  "details": "Event timestamp expired (must be within 60 seconds)",
  "hint": "Include 'Authorization: Nostr <base64-encoded-kind-27235-event>' header"
}
```

## API Endpoints

### Search

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /search/byterm` | Search podcasts by keyword | `q` (required) |
| `GET /search/bytitle` | Search by podcast title | `q` (required) |
| `GET /search/byperson` | Search by person/host | `q` (required) |
| `GET /search/music/byterm` | Search music podcasts | `q` (required) |

### Apple Replacement (No PodcastIndex Auth)

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /search` | Apple-compatible search | `term` (required) |
| `GET /lookup` | Apple-compatible lookup | `id` (required) |

### Podcasts

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /podcasts/byfeedid` | Get podcast by feed ID | `id` (required) |
| `GET /podcasts/byfeedurl` | Get podcast by feed URL | `url` (required) |
| `GET /podcasts/byitunesid` | Get podcast by iTunes ID | `id` (required) |
| `GET /podcasts/byguid` | Get podcast by GUID | `guid` (required) |
| `GET /podcasts/bytag` | Get podcasts by tag | `tag` (required) |
| `GET /podcasts/bymedium` | Get podcasts by medium | `medium` (required) |
| `GET /podcasts/trending` | Get trending podcasts | `max`, `since`, `lang`, `cat` |
| `GET /podcasts/dead` | Get dead/inactive podcasts | — |

### Episodes

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /episodes/byfeedid` | Get episodes by feed ID | `id` (required) |
| `GET /episodes/byfeedurl` | Get episodes by feed URL | `url` (required) |
| `GET /episodes/byitunesid` | Get episodes by iTunes ID | `id` (required) |
| `GET /episodes/byguid` | Get episode by GUID | `guid` (required) |
| `GET /episodes/byid` | Get episode by ID | `id` (required) |
| `GET /episodes/bypodcastguid` | Get episodes by podcast GUID | `guid` (required) |
| `GET /episodes/live` | Get live episodes | `max` |
| `GET /episodes/random` | Get random episodes | `max`, `lang`, `cat` |

### Recent

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /recent/episodes` | Recently published episodes | `max`, `since` |
| `GET /recent/feeds` | Recently updated feeds | `max`, `since` |
| `GET /recent/newfeeds` | Recently added feeds | `max`, `since` |
| `GET /recent/newvaluefeeds` | Recently added value feeds | `max`, `since` |
| `GET /recent/data` | Recent data changes | `max`, `since` |
| `GET /recent/soundbites` | Recent soundbites | `max` |

### Value (No PodcastIndex Auth)

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /value/byfeedid` | Get value info by feed ID | `id` (required) |
| `GET /value/byfeedurl` | Get value info by feed URL | `url` (required) |
| `GET /value/bypodcastguid` | Get value by podcast GUID | `guid` (required) |
| `GET /value/byepisodeguid` | Get value by episode GUID | `guid` (required) |

### Stats & Categories

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /stats/current` | Get current API stats | — |
| `GET /categories/list` | List all categories | — |

### Hub

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /hub/pubnotify` | WebSub hub notification | `url` (required) |

### Static Data (No Auth Required)

| Endpoint | Description |
|----------|-------------|
| `GET /static/stats/daily_counts.json` | Daily statistics |
| `GET /static/stats/hourly_counts.json` | Hourly statistics |
| `GET /static/stats/chart-data.json` | Chart data |
| `GET /static/stats/v4vmusic.json` | Value4Value music data |
| `GET /static/stats/v4vmusic.opml` | V4V music OPML |
| `GET /static/stats/v4vmusic.rss` | V4V music RSS |
| `GET /static/tracking/current` | Current tracking data |
| `GET /static/tracking/feedValueBlocks` | Feed value blocks |
| `GET /static/tracking/episodeValueBlocks` | Episode value blocks |
| `GET /static/public/podcastindex_dead_feeds.csv` | Dead feeds CSV |
| `GET /static/public/podcastindex_feeds.db.tgz` | Full database download |

### Health Check (No Auth Required)

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /health` | Health check |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PODCAST_INDEX_KEY` | Yes | PodcastIndex API key |
| `PODCAST_INDEX_SECRET` | Yes | PodcastIndex API secret |
| `NOSTR_AUTH_MODE` | No | `open` (default) or `whitelist` |
| `NOSTR_ALLOWED_PUBKEYS` | No | Comma-separated pubkeys (whitelist mode only) |

### Auth Modes

- **open** (default): Any valid NIP-98 signature is accepted
- **whitelist**: Only pubkeys in `NOSTR_ALLOWED_PUBKEYS` are allowed

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get PodcastIndex API credentials

Sign up at https://api.podcastindex.org/signup

### 3. Configure secrets

```bash
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET

# Optional: for whitelist mode
npx wrangler secret put NOSTR_AUTH_MODE  # Enter: whitelist
npx wrangler secret put NOSTR_ALLOWED_PUBKEYS  # Enter: pubkey1,pubkey2,...
```

### 4. Deploy

```bash
npm run deploy
```

## Development

Run locally:

```bash
npm run dev
```

View logs:

```bash
npm run tail
```

## Custom Domain

To use a custom domain like `api.nostr.blue`, configure routes in `wrangler.toml`:

```toml
routes = [
  { pattern = "api.nostr.blue/*", zone_name = "nostr.blue" }
]
```

## License

MIT
