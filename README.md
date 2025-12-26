# PodcastIndex API Proxy

A Cloudflare Worker that proxies requests to the [PodcastIndex API](https://podcastindex-org.github.io/docs-api/) for nostr.blue.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get PodcastIndex API credentials

Sign up at https://api.podcastindex.org/signup to get your API key and secret.

### 3. Configure secrets

```bash
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET
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

## Usage

The proxy exposes PodcastIndex endpoints with the same paths:

```
GET /search/byterm?q=podcast+name
GET /podcasts/byfeedid?id=123456
GET /episodes/byfeedid?id=123456
GET /podcasts/trending
```

### Available Endpoints

- **Search**: `/search/byterm`, `/search/bytitle`, `/search/byperson`, `/search/music/byterm`
- **Podcasts**: `/podcasts/byfeedid`, `/podcasts/byfeedurl`, `/podcasts/byitunesid`, `/podcasts/byguid`, `/podcasts/bytag`, `/podcasts/bymedium`, `/podcasts/trending`, `/podcasts/dead`
- **Episodes**: `/episodes/byfeedid`, `/episodes/byfeedurl`, `/episodes/byitunesid`, `/episodes/byguid`, `/episodes/byid`, `/episodes/bypodcastguid`, `/episodes/live`, `/episodes/random`
- **Recent**: `/recent/episodes`, `/recent/feeds`, `/recent/newfeeds`, `/recent/soundbites`
- **Value**: `/value/byfeedid`, `/value/byfeedurl`, `/value/bypodcastguid`
- **Stats**: `/stats/current`
- **Categories**: `/categories/list`
- **Hub**: `/hub/pubnotify`

### Example

```javascript
// From your nostr.blue frontend
const response = await fetch('https://your-worker.workers.dev/search/byterm?q=bitcoin');
const data = await response.json();
```

## Custom Domain

To use a custom domain like `api.nostr.blue`, uncomment and configure the routes in `wrangler.toml`:

```toml
routes = [
  { pattern = "api.nostr.blue/*", zone_name = "nostr.blue" }
]
```

## License

MIT
