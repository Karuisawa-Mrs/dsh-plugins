/**
 * Cordis plugin entry types for the Firecrawl-backed web search provider.
 * The runtime source is `lib/index.js`; these declarations let a TypeScript
 * consumer reference the plugin shape directly while Cordis loads the JS.
 * @module @deepseek-ai/dsh-web-search-firecrawl/types
 */
import type { Context } from '@deepseek-ai/cordis';
import type { z } from '@deepseek-ai/schemastery';
import type { WebSearchProvider, WebSearchResult } from '@deepseek-ai/dsh-web';
import type {
    FirecrawlSearchProvider,
    FirecrawlSearchProviderOptions,
} from './provider.ts';
/** Stable id this provider registers under. */
export declare const FIRECRAWL_PROVIDER_ID = "firecrawl-local";
/** Default Firecrawl endpoint; `/v1/search` is appended. */
export declare const FIRECRAWL_DEFAULT_BASE_URL = "http://localhost:3002";
/** Default page count sent to Firecrawl when `limit` is unset. */
export declare const FIRECRAWL_DEFAULT_LIMIT = 10;
/** Default upper bound on `limit`; matches Firecrawls hard cap. */
export declare const FIRECRAWL_DEFAULT_LIMIT_CAP = 50;
/**
 * Default auth posture: the verified local Firecrawl instance
 * (`http://localhost:3002`) requires no Authorization header.
 */
export declare const FIRECRAWL_DEFAULT_NO_AUTH = true;
/** Settings namespace for the editable configuration section. */
export declare const WEB_SEARCH_FIRECRAWL_SETTINGS_NAMESPACE: unique symbol;
/**
 * Runtime-facing configuration section. Settings UI and composition
 * files speak this shape; the runtime merges missing/empty optional
 * fields with provider defaults before each search.
 */
export interface FirecrawlRuntimeConfig {
    /**
     * Literal Firecrawl API key. When present it wins over the credential
     * service AND overrides `noAuth: true` (i.e. supplying a key forces an
     * `Authorization` header). Marked `secret` so it is redacted from logs.
     */
    apiKey?: string;
    /** Credential reference name resolved through the credentials service. */
    apiKeyEnv?: string;
    /**
     * Skip the `Authorization: Bearer` header entirely. Defaults to
     * `true` because the verified local instance rejects nothing for auth;
     * users pointing this provider at hosted Firecrawl must set this to
     * `false` AND supply an API key.
     */
    noAuth?: boolean;
    /**
     * Firecrawl root URL. `/v1/search` is appended at call time. The
     * environment variable `$FIRECRAWL_BASE_URL` is consulted when this
     * field is empty.
     */
    baseURL?: string;
    /**
     * Maximum results requested from Firecrawl. Always <= 50 because that
     * is Firecrawls hard cap; `ctx.web` enforces `request.maxResults`
     * regardless, so this is a cost / latency lever.
     */
    limit?: number;
    /** Optional language filter (e.g. `"en"`). */
    lang?: string;
    /** Optional ISO country filter (e.g. `"US"`). */
    country?: string;
    /** Optional time filter (e.g. `"qdr:d"`). */
    tbs?: string;
    /** Optional scrape options forwarded verbatim to Firecrawl. */
    scrapeOptions?: {
        readonly formats: readonly string[];
    };
}
/** Schemastery shape applied to user config in the settings UI. */
export declare const Config: z<FirecrawlRuntimeConfig>;
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-firecrawl";
/** The web seam this provider registers into. */
export declare const inject: readonly ["web"];
/**
 * Install the Firecrawl-backed `WebSearchProvider` on `ctx.web`. Safe to
 * call once during plugin setup; re-running `apply` replaces the
 * registered provider.
 */
export declare function apply(ctx: Context, config: FirecrawlRuntimeConfig): void;
/** Re-export the provider class so callers can typecheck or instantiate it. */
export { FirecrawlSearchProvider, default } from './provider.ts';
/**
 * Map one parsed Firecrawl response envelope to a normalized search
 * result. Exposed for unit tests and inline consumers that already
 * have a parsed payload in hand.
 */
export declare function mapFirecrawlResponse(parsed: unknown): WebSearchResult;
/** Loose-typed options snapshot the runtime merges for each search. */
export interface FirecrawlResolvedOptions extends Partial<FirecrawlSearchProviderOptions> {
}
/**
 * Project one resolved section into the options for a single search.
 * Exposed primarily for unit tests; the runtime uses it internally.
 */
export declare function resolveOptions(
    ctx: Context,
    config: FirecrawlRuntimeConfig
): FirecrawlResolvedOptions;
