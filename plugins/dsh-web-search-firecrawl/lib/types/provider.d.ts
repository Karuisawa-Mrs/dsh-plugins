/**
 * Firecrawl search through the `/v1/search` endpoint of a local Firecrawl
 * distribution. Defaults to `http://localhost:3002` with no Authorization
 * header because the verified local instance requires none. The wire format
 * and native `fetch` client are provider-private and do not use `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-firecrawl/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
/** Stable id this provider registers under. */
export declare const FIRECRAWL_PROVIDER_ID = "firecrawl-local";
/** Default Firecrawl root URL; `/v1/search` is appended. */
export declare const FIRECRAWL_DEFAULT_BASE_URL = "http://localhost:3002";
/** Default `limit` sent to Firecrawl when the request did not cap it. */
export declare const FIRECRAWL_DEFAULT_LIMIT = 10;
/** Upper bound on `limit`; mirrors Firecrawl /v1/search hard cap. */
export declare const FIRECRAWL_DEFAULT_LIMIT_CAP = 50;
/** Default auth posture for the verified local instance. */
export declare const FIRECRAWL_DEFAULT_NO_AUTH = true;
/** Default credential-ref name (resolved through the credentials service). */
export declare const DEFAULT_API_KEY_ENV = "FIRECRAWL_API_KEY";
/** Attribution header sent on every request; bump with the package version. */
export declare const USER_AGENT = "dsh-web-search-firecrawl/0.1.0";
/** Maximum length of a snippet fallback built from markdown content. */
export declare const SNIPPET_FALLBACK_LIMIT = 280;
/**
 * Exact secret-free Firecrawl search request recorded immediately before
 * dispatch. Recorded before the network call so a credential leak into the
 * body — never expected — would still be caught by redactSecrets before
 * reaching the persisted session log.
 */
export interface FirecrawlSearchRequest {
    /** Fully resolved `/v1/search` endpoint. */
    readonly endpoint: string;
    /**
     * Exact JSON body sent to Firecrawl. Only fields the user opted into
     * are present (no empty `lang: ""` echoes).
     */
    readonly body: {
        readonly query: string;
        readonly limit?: number;
        readonly lang?: string;
        readonly country?: string;
        readonly tbs?: string;
        readonly scrapeOptions?: {
            readonly formats: readonly string[];
        };
        readonly [key: string]: unknown;
    };
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * Secret-free Firecrawl /v1/search dispatch recorded immediately
         * before the network call.
         */
        'web/firecrawl-search-request': FirecrawlSearchRequest;
    }
}
/**
 * Resolved provider options (the plugin's `apply` supplies credential and
 * constant defaults).
 */
export interface FirecrawlSearchProviderOptions {
    /**
     * Literal Firecrawl API key; when present it wins over
     * {@link resolveApiKey} AND forces an Authorization header, even when
     * `noAuth === true`.
     */
    apiKey?: string;
    /** Resolve the current Firecrawl API key for one search operation. */
    resolveApiKey?: () => Promise<string | undefined>;
    /**
     * Skip the `Authorization: Bearer` header. Defaults to `true` because
     * the verified local instance at `http://localhost:3002` requires no
     * auth; users pointing this provider at hosted Firecrawl must set this
     * to `false` AND supply an `apiKey` / `apiKeyEnv`.
     */
    noAuth?: boolean;
    /** Credential reference named by missing-credential diagnostics. */
    apiKeyEnv?: CredentialRef;
    /** Firecrawl root URL; `/v1/search` is appended. */
    baseURL: string;
    /**
     * Maximum results requested from Firecrawl. Hard-clamped to
     * {@link FIRECRAWL_DEFAULT_LIMIT_CAP} (Firecrawl's cap).
     */
    limit: number;
    /** Optional language filter; missing/empty => not sent. */
    lang?: string;
    /** Optional ISO country filter; missing/empty => not sent. */
    country?: string;
    /** Optional time filter (`qdr:*`); missing/empty => not sent. */
    tbs?: string;
    /**
     * Optional scrape options forwarded verbatim. When omitted the wire
     * request omits the `scrapeOptions` key entirely.
     */
    scrapeOptions?: {
        readonly formats: readonly string[];
    };
    /**
     * Record the exact secret-free request immediately before dispatch.
     * A throw prevents dispatch so model-visible auxiliary input cannot
     * escape logging.
     */
    recordRequest?: (request: FirecrawlSearchRequest) => void;
}
/**
 * One row of the Firecrawl `/v1/search` `data[]` array. Local Firecrawl
 * returns at least `url`, optionally `title`, `description`, `markdown`,
 * and `publishedAt`. Only `url` is required.
 */
export interface FirecrawlSearchResultItem {
    readonly url: string;
    readonly title?: string;
    /** Pre-rendered description; first choice for the citation snippet. */
    readonly description?: string;
    /**
     * Full markdown body when `scrapeOptions.formats` includes
     * `"markdown"`; second choice for the citation snippet.
     */
    readonly markdown?: string;
    /**
     * Provider-supplied publication / crawl timestamp, forwarded to
     * `WebSearchSource.publishedAt` verbatim when present.
     */
    readonly publishedAt?: string;
    /**
     * Loose escape hatch for unknown keys Firecrawl may add in future
     * revisions without breaking the adapter.
     */
    readonly [key: string]: unknown;
}
/** Error envelope Firecrawl returns alongside `success: false`. */
export interface FirecrawlError {
    readonly error?: string;
    readonly [key: string]: unknown;
}
/** Parsed Firecrawl `/v1/search` envelope. */
export interface FirecrawlResponse {
    /** Whether Firecrawl considered the call successful. */
    readonly success?: boolean;
    /** Result rows (always defined on `success: true`, possibly empty). */
    readonly data?: readonly FirecrawlSearchResultItem[];
    /** Server-side error text (always defined on `success: false`). */
    readonly error?: string;
    /** Server-side request id; opaque, used for diagnostics. */
    readonly id?: string;
    /**
     * Loose escape hatch for unknown keys Firecrawl may add in future
     * revisions without breaking the adapter.
     */
    readonly [key: string]: unknown;
}
/**
 * Map one parsed Firecrawl `/v1/search` envelope to the seam's normalized
 * `WebSearchResult`. `description` wins as the snippet; otherwise the first
 * 280 chars of `markdown` stand in. `publishedAt` is forwarded only when
 * Firecrawl supplied one — the seam never invents fields. `success: false`
 * is a hard error (the upstream caller asked for a search, not a "no
 * results" tap); `data` missing or empty is a valid zero-row response (no
 * throw, just an empty list).
 *
 * @param response - the parsed Firecrawl response body.
 * @returns the normalized result; `truncated` is always `false` here
 *   because `ctx.web` owns the final cap to `request.maxResults`.
 * @throws `WebError` `WEB_PROVIDER_ERROR` when Firecrawl returned
 *   `success: false`.
 */
export declare function mapFirecrawlResponse(response: FirecrawlResponse): WebSearchResult;
/**
 * The Firecrawl-backed search provider; HTTP redirects fail as
 * `WEB_PROVIDER_ERROR`.
 */
export declare class FirecrawlSearchProvider implements WebSearchProvider {
    private readonly resolveOptions;
    readonly id = FIRECRAWL_PROVIDER_ID;
    /**
     * @param resolveOptions - options for the NEXT operation, snapshotted
     *   once at each operation's entry so one search never mixes two
     *   sections. A thunk rather than a value because the plugin's
     *   settings section can change between searches, and re-registering
     *   the provider to carry a new endpoint would make the seam's
     *   selection observable to the user as a flicker.
     */
    constructor(resolveOptions: () => FirecrawlSearchProviderOptions);
    /** Cheap local usability check; must not make network calls. */
    available(): boolean;
    /** Run one search; honors `signal` for cancellation. */
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /**
     * Resolve one operation's credential without retaining it on the
     * provider. Returns `undefined` when `noAuth === true`.
     *
     * @param options - the caller's snapshot, so the key and the endpoint
     *   it is sent to come from one section.
     * @param signal - abort signal for the surrounding search.
     * @returns the resolved key, or `undefined` when auth is disabled.
     * @throws `WebError` `WEB_PROVIDER_CREDENTIAL_MISSING` when a key is
     *   required but cannot be resolved.
     */
    private apiKey;
}
/** Shape returned from {@link mapFirecrawlResponse} for one row. */
export declare type FirecrawlSearchSource = WebSearchSource;
//# sourceMappingURL=provider.d.ts.map
