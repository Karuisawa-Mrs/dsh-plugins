# @dsh-plugs-dev/dsh-web-search-firecrawl

English | [中文](README.zh.md)

A [Firecrawl](https://firecrawl.dev)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). It calls the locally-deployed Firecrawl API's dedicated search endpoint (`POST {baseURL}/v1/search`), and maps the structured `data[]` array Firecrawl returns into the seam's normalized `WebSearchResult`.

This is an **implementation** package: it registers a provider into `ctx.web`, resolves its credential for each search through the optional `ctx.credentials` seam, and does not register a model-facing tool. Like `@deepseek-ai/dsh-web-search-deepseek`, it is a function/namespace plugin (`inject: ['web']`). The Firecrawl wire shape is a provider-private detail — it does **not** make this provider depend on `ctx.llm` or any SDK.

## Endpoint

Targets a local Firecrawl deployment. The default base URL is `http://localhost:3002` (the bundled self-hosted port), and `/v1/search` is appended. The provider is designed for a local instance; the matching `noAuth: true` default avoids forcing an API key onto a self-hosted deployment.

```
POST {baseURL}/v1/search
Content-Type: application/json
Authorization: Bearer <apiKey>     # sent only when noAuth is false and an apiKey resolves
```

## Wire shape

**Request body:**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `query` | `string` | yes | The search query. |
| `limit` | `number` | no | Maximum number of results to return. Defaults to `10`. |
| `lang` | `string` | no | ISO language code (e.g. `en`, `zh`). |
| `country` | `string` | no | ISO country code (lowercase, e.g. `us`, `cn`). |
| `tbs` | `string` | no | Time-based search filter (e.g. `qdr:d` for past day). |
| `scrapeOptions` | `object` | no | Optional scrape-formatter settings forwarded to Firecrawl. Passes through unmodified when supplied. |

**Response body:**

```json
{
  "success": true,
  "data": [
    {
      "url": "https://example.com/article",
      "title": "Article title",
      "description": "Short summary...",
      "markdown": "Full markdown content...",
      "metadata": { "title": "...", "description": "...", "language": "en", "sourceURL": "...", "publishedAt": "2025-01-01T00:00:00Z" }
    }
  ]
}
```

The provider consumes `data[]` only. `data[i].markdown` is treated as a fallback excerpt, never as the primary `snippet`.

## Auth

The default `noAuth: true` matches the local Firecrawl instance, which does not require an Authorization header. To flip the provider to a hosted Firecrawl deployment that does require a key, set `noAuth: false` and provide either an `apiKey` literal or an `apiKeyEnv` reference:

```yaml
- id: web-search-firecrawl
  name: '@dsh-plugs-dev/dsh-web-search-firecrawl'
  config:
    noAuth: false
    apiKeyEnv: FIRECRAWL_API_KEY
```

| Mode | Header sent |
|---|---|
| `noAuth: true` (default) | none |
| `noAuth: false` + `apiKeyEnv` resolves | `Authorization: Bearer <resolved key>` |
| `noAuth: false` + literal `apiKey` | `Authorization: Bearer <literal>` |
| `noAuth: false` + reference cannot resolve | call fails as `WEB_PROVIDER_CREDENTIAL_MISSING` |

A mounted credentials service is authoritative; without one, the provider falls back to the launching process environment. The reference is resolved for each search, so a key stored or rotated by the Web Models page reaches the next call without a restart.

## Config

| Key | Default | Type | Meaning |
|---|---|---|---|
| `apiKey` | omitted | `string` | Literal Firecrawl API key. Prefer `apiKeyEnv` so no secret enters configuration; a non-empty literal wins. |
| `apiKeyEnv` | `FIRECRAWL_API_KEY` | `string` | Credential reference resolved for each search through `ctx.credentials`, or from the process environment when that seam is absent. A missing value fails the call as `WEB_PROVIDER_CREDENTIAL_MISSING` when `noAuth` is false. |
| `noAuth` | `true` | `boolean` | When `true`, no `Authorization` header is sent. Matches the default local Firecrawl deployment. Set to `false` to authenticate against a hosted Firecrawl. |
| `baseURL` | `http://localhost:3002` | `string` | Firecrawl base URL; `/v1/search` is appended. Use an HTTPS URL for hosted Firecrawl. An unparseable value makes the provider unavailable. |
| `limit` | `10` | `number` | Maximum number of results to request per search. The seam enforces the requested `maxResults` cap post-hoc by truncating `sources[]` and setting `truncated`. |
| `lang` | omitted | `string` | ISO language code forwarded to Firecrawl as the search lane. |
| `country` | omitted | `string` | ISO country code (lowercase) forwarded to Firecrawl. |
| `tbs` | omitted | `string` | Time-based search filter forwarded to Firecrawl (e.g. `qdr:d`, `qdr:w`, `qdr:m`). |
| `scrapeOptions` | omitted | `object` | Firecrawl scrape-formatter settings forwarded verbatim. Useful for controlling the `markdown` payload size. |

```yaml
- id: web-search-firecrawl
  name: '@dsh-plugs-dev/dsh-web-search-firecrawl'
  config:
    baseURL: http://localhost:3002
    limit: 10
    noAuth: true
```

The entry above is the base layer of the `web-search-firecrawl` Settings section: a user layer over it reaches the NEXT search, because the provider projects the section per call rather than capturing it at registration. The seam's provider selection therefore never flickers when an endpoint or model changes. `apiKey` carries `role('secret')`, so it never rides a `describe()` response in any layer — a configuration surface learns only whether the credentials domain holds a value for the reference `apiKeyEnv` names, never whether a layer carries a literal key.

## Mapping

Firecrawl returns `data[]` directly, so `sources[]` is built one-to-one from each item: `url` ← `url`, `title` ← `title`, and `snippet` ← `description`. When `description` is missing, the provider falls back to the first 280 characters of `markdown`, stripped of leading whitespace, so the snippet is always non-empty when the source has body content. `publishedAt` is forwarded only when Firecrawl supplies it (typically via `metadata.publishedAt`); the provider does not invent a date from the URL or title.

Results are deduplicated by URL because Firecrawl may surface the same page across multiple scrape variants. The provider does not enrich `content`; Firecrawl returns no provider-generated answer prose this provider trusts as `content`, so `content` is omitted from the seam result.

Provider failures become `WEB_PROVIDER_ERROR`; caller cancellation becomes `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`. A non-2xx response surfaces the provider's HTTP status code and short body in the error message.

## Install

From the plugin directory:

```sh
cd "D:/dsh workplace/dsh-plugs-dev/dsh-web-search-firecrawl"
dsh plugin --profile web add file:./
```

> **Heads-up — paths with spaces.** `dsh plugin add` forwards its argument
> to pnpm through `cmd.exe`, which splits arguments on whitespace, so an
> absolute path like `D:/dsh workplace/...` is truncated to `D:/dsh` and
> fails with `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND`. Workarounds:
>
> 1. Move or rename the workspace so no directory in the path contains a
>    space. Easiest if you control the location.
> 2. Create a junction at a space-free path and install from there:
>    ```powershell
>    cmd /c mklink /J D:\dsh-plugins\dsh-web-search-firecrawl \
>        "D:\dsh workplace\dsh-plugs-dev\dsh-web-search-firecrawl"
>    cd D:\dsh-plugins
>    dsh plugin --profile web add file:./dsh-web-search-firecrawl
>    ```
>
> Future pnpm versions may fix this, but as of `pnpm@11` the workaround
> is still required.

Selection is driven by the `searchProvider` field of the `web` row in `@deepseek-ai/dsh-base`. The default local profile may not pick this provider automatically — add a profile-layer override to pin selection:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: firecrawl-local
```

The provider id `firecrawl-local` is exported as `FIRECRAWL_PROVIDER_ID` from the plugin and is the only stable string the seam recognizes.

## Verify

Inspect the composed Cordis tree:

```sh
dsh --profile web --dump-config | grep -A4 'web-search-firecrawl'
dsh --profile web --dump-config | grep -A2 'id: web$'
```

A quick PowerShell smoke test against the local Firecrawl API, independent of DSH:

```powershell
$body = @{ query = 'deepseek harness'; limit = 3 } | ConvertTo-Json
Invoke-RestMethod -Method Post `
    -Uri 'http://localhost:3002/v1/search' `
    -ContentType 'application/json' `
    -Body $body |
  Select-Object -ExpandProperty data |
  Select-Object url, title
```

If this returns an array of objects with `url` and `title`, the Firecrawl deployment is reachable and the provider's wire shape will succeed once it is selected.

## Model Experience

### Auxiliary Firecrawl search request

#### What the model sees

When a search runs under an initiating Agent, the conversation model does **not** receive the auxiliary Firecrawl request. The provider appends a log-only `web/firecrawl-search-request` session event just before dispatch, carrying the resolved endpoint and the secret-free JSON body. Headers and credentials are excluded. The conversation model sees the search result only after the seam has normalized and deduplicated it.

#### Token effect

Zero direct conversation tokens from the search dispatch itself. Search-result tokens scale with returned sources and snippets, then the seam enforces the requested `maxResults` bound by truncating `sources[]` and setting `truncated`.

#### KV Cache effect

Independent of the conversation request cache. The auxiliary Firecrawl request never enters the conversation's KV prefix; any change to the search query or provider config is local to the next search and does not invalidate the conversation's KV cache.

### Conversation tool result, indirectly

#### What the model sees

Through [`dsh-tool-web`](../tool-web/README.md), the conversation model sees deduplicated URLs, titles, dates, and snippet excerpts from the normalized `WebSearchResult`. Provider prose is not trusted as an answer. This provider's exact failures include the actionable missing-credential message, `Firecrawl search credential resolution failed: <error>`, `Firecrawl search aborted`, `Firecrawl search request failed: <error>`, `Firecrawl returned a non-2xx response: <status> <body>`, and `Firecrawl returned an unprocessable response body: <error>`. The consumer owns the error wrapper.

#### Token effect

Zero direct conversation tokens from registration. Result tokens scale with returned sources and snippets, then the seam enforces the requested source bound.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Local deployment assumed** — the default base URL is `http://localhost:3002` and `noAuth: true`. Hosted Firecrawl requires flipping both `baseURL` and `noAuth` together with an `apiKeyEnv` or literal `apiKey`.
- **No `content` field** — Firecrawl's response is a list of scrape results, not a generated answer. The provider does not trust any single result's `markdown` as `content`; the conversation model receives only normalized sources.
- **Dynamic credential availability resolves inside the operation** — the synchronous `available()` contract can establish that a resolver exists but cannot query an asynchronous credential store. A selected authenticated provider therefore fails the search with `WEB_PROVIDER_CREDENTIAL_MISSING`; the search schema remains registered. Caller cancellation races this preflight locally, but cannot force an arbitrary credential backend itself to stop work.
- **Markdown fallback is a preview, not a snippet** — when `description` is missing, the provider emits the first 280 characters of `markdown` as the snippet. This is a preview, not a high-quality excerpt; hosts with limited Firecrawl scrape output may get poor snippets.
- **Over-returned sources still cost tokens** — Firecrawl exposes `limit` but may return fewer than the seam's `maxResults` cap; the seam enforces `maxResults` only post-hoc by truncation.
