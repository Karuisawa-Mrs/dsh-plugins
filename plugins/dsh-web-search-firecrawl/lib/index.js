import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
//#region lib/types/provider.js
/**
 * Firecrawl-backed web search through the local Firecrawl API at
 * `http://localhost:3002` by default. Posts to `/v1/search`, normalizes
 * each Firecrawl `data` row into a {@link WebSearchSource}, and lets
 * `ctx.web` enforce the request's `maxResults` on the way back. The wire
 * format and native `fetch` client are provider-private and do not use
 * `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-firecrawl/provider
 */
/** Stable id this provider registers under. */
const FIRECRAWL_PROVIDER_ID = "firecrawl-local";
/**
 * Default endpoint. `/v1/search` is appended. The local Firecrawl
 * distribution requires no Authorization by default, so `noAuth` defaults
 * to `true`; users point this at a hosted Firecrawl by overriding
 * `baseURL` and clearing `noAuth` while supplying an API key.
 */
const FIRECRAWL_DEFAULT_BASE_URL = "http://localhost:3002";
/** Default page count; matches Firecrawl's expected cap of 50. */
const FIRECRAWL_DEFAULT_LIMIT = 10;
/** Default upper bound applied when the user did not pick a `limit`. */
const FIRECRAWL_DEFAULT_LIMIT_CAP = 50;
/**
 * Default auth posture: the user's verified local Firecrawl instance at
 * `http://localhost:3002` does not require an Authorization header. Users
 * pointing this provider at a hosted Firecrawl must set `noAuth: false` AND
 * supply `apiKey` / `apiKeyEnv`.
 */
const FIRECRAWL_DEFAULT_NO_AUTH = true;
/** Default credential-ref name (resolved through the credentials service). */
const DEFAULT_API_KEY_ENV = "FIRECRAWL_API_KEY";
/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = "dsh-web-search-firecrawl/0.1.0";
/** Maximum length of a snippet fallback built from markdown content. */
const SNIPPET_FALLBACK_LIMIT = 280;
/**
 * Map one parsed Firecrawl `/v1/search` envelope to the seam's
 * {@link WebSearchResult}. `description` wins for the snippet when present;
 * otherwise the first 280 chars of the markdown body stand in. `publishedAt`
 * is forwarded only when Firecrawl returned one — the seam never invents
 * fields. `success === false` is a hard error (the upstream caller asked for
 * a search, not a "no results" tap), and `data` missing or empty is a valid
 * zero-row response (no throw, just an empty list).
 *
 * @param parsed - the parsed Firecrawl response body.
 * @returns the normalized result; `truncated` is always `false` here
 *   because `ctx.web` owns the final cap to `request.maxResults`.
 * @throws {@link WebError} when Firecrawl returned `success: false`.
 */
function mapFirecrawlResponse(parsed) {
	if (parsed?.success === false) {
		const detail = typeof parsed.error === "string" && parsed.error.length > 0
			? parsed.error
			: "Firecrawl returned success=false";
		throw new WebError(detail, "WEB_PROVIDER_ERROR");
	}
	const items = Array.isArray(parsed?.data) ? parsed.data : [];
	const sources = [];
	for (const item of items) {
		if (item === null || typeof item !== "object") continue;
		const url = typeof item.url === "string" && item.url.length > 0 ? item.url : "";
		if (url.length === 0) continue;
		const title = typeof item.title === "string" && item.title.length > 0 ? item.title : undefined;
		const description = typeof item.description === "string" && item.description.length > 0
			? item.description
			: undefined;
		const markdown = typeof item.markdown === "string" && item.markdown.length > 0
			? item.markdown
			: undefined;
		const snippet = description ?? (markdown !== undefined ? markdown.slice(0, SNIPPET_FALLBACK_LIMIT) : undefined);
		const publishedAtRaw = typeof item.publishedAt === "string" && item.publishedAt.length > 0
			? item.publishedAt
			: undefined;
		sources.push({
			url,
			...(title !== undefined ? { title } : {}),
			...(snippet !== undefined ? { snippet } : {}),
			...(publishedAtRaw !== undefined ? { publishedAt: publishedAtRaw } : {})
		});
	}
	return {
		sources,
		truncated: false
	};
}
/** The Firecrawl-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var FirecrawlSearchProvider = class {
	resolveOptions;
	id = FIRECRAWL_PROVIDER_ID;
	/**
	 * @param resolveOptions - options for the NEXT operation, snapshotted once
	 *   at each operation's entry so one search never mixes two sections. A thunk
	 *   rather than a value because the plugin's settings section can change
	 *   between searches, and re-registering the provider to carry a new
	 *   endpoint would make the seam's selection observable to the user as a
	 *   flicker.
	 */
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		const options = this.resolveOptions();
		const authOk = options.noAuth === true
			|| (typeof options.apiKey === "string" && options.apiKey.length > 0)
			|| typeof options.resolveApiKey === "function";
		return authOk && URL.canParse(options.baseURL) && Number.isInteger(options.limit) && options.limit >= 1;
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		throwIfSearchAborted(signal);
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		const endpoint = `${options.baseURL}/v1/search`;
		const body = {
			query: request.query,
			...(typeof request.maxResults === "number" && Number.isInteger(request.maxResults) && request.maxResults >= 1
				? { limit: Math.min(request.maxResults, FIRECRAWL_DEFAULT_LIMIT_CAP) }
				: {}),
			...(options.lang !== undefined && options.lang.length > 0 ? { lang: options.lang } : {}),
			...(options.country !== undefined && options.country.length > 0 ? { country: options.country } : {}),
			...(options.tbs !== undefined && options.tbs.length > 0 ? { tbs: options.tbs } : {}),
			...(options.scrapeOptions !== undefined ? { scrapeOptions: options.scrapeOptions } : {})
		};
		const headers = {
			"content-type": "application/json",
			"accept": "application/json",
			"user-agent": USER_AGENT,
			...(apiKey !== undefined ? { authorization: `Bearer ${apiKey}` } : {})
		};
		options.recordRequest?.({
			endpoint,
			body
		});
		throwIfSearchAborted(signal);
		let response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				redirect: "error",
				headers,
				body: JSON.stringify(body),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Firecrawl search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `Firecrawl API error (HTTP ${response.status})`;
			try {
				const parsed = await response.json();
				const detail = typeof parsed?.error === "string" && parsed.error.length > 0
					? parsed.error
					: typeof parsed?.error?.message === "string" && parsed.error.message.length > 0
						? parsed.error.message
						: typeof parsed?.message === "string" && parsed.message.length > 0
							? parsed.message
							: undefined;
				if (detail !== undefined) message = detail;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}
		try {
			return mapFirecrawlResponse(await response.json());
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`Firecrawl returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	 * Resolve one operation's credential without retaining it on the provider.
	 * `noAuth: true` short-circuits the lookup entirely: local Firecrawl
	 * requires no Authorization, and this prevents a user from accidentally
	 * sending a stray `Authorization` header sourced from an unrelated
	 * credential reference that happens to share a name.
	 * @param options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
	 * @param signal - abort signal for the surrounding search.
	 * @returns the resolved key, or `undefined` when auth is disabled.
	 */
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.noAuth === true) return undefined;
		if (typeof options.apiKey === "string" && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Firecrawl search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (typeof resolved === "string" && resolved.length > 0) return resolved;
		throw new WebError(
			`Firecrawl search has no API key for "${options.apiKeyEnv ?? DEFAULT_API_KEY_ENV}"; store it through the credentials service, export it in the launching environment, set a literal "apiKey" in the web-search-firecrawl config, or set noAuth: true if your Firecrawl instance does not require auth`,
			"WEB_PROVIDER_CREDENTIAL_MISSING"
		);
	}
};
/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(searchAborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
		});
	});
}
/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}
/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
	return new WebError("Firecrawl search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}
/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
//#endregion
//#region lib/types/index.js
/**
 * Register a Firecrawl-backed provider in `ctx.web`. Calls the local Firecrawl
 * API at `http://localhost:3002/v1/search` (overridable via `baseURL`), with
 * auth optional because the verified local instance requires none. The provider
 * reuses `$FIRECRAWL_API_KEY` as its default credential reference.
 * @module @deepseek-ai/dsh-web-search-firecrawl
 */
/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-firecrawl";
/** The web seam this provider registers into. */
const inject = ["web"];
/**
 * Environment variable naming this provider's endpoint. Deliberately distinct
 * from any chat-completions `$FIRECRAWL_BASE_URL` Firecrawl tooling may one
 * day define so one variable cannot serve both.
 */
const SEARCH_BASE_URL_ENV = "FIRECRAWL_BASE_URL";
const Config = z.object({
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	noAuth: z.boolean().default(FIRECRAWL_DEFAULT_NO_AUTH),
	baseURL: z.string().default(FIRECRAWL_DEFAULT_BASE_URL),
	limit: z.number().step(1).min(1).max(FIRECRAWL_DEFAULT_LIMIT_CAP).default(FIRECRAWL_DEFAULT_LIMIT),
	lang: z.string(),
	country: z.string(),
	tbs: z.string(),
	scrapeOptions: z.object({ formats: z.array(z.string()) })
});
/** Settings namespace carrying this provider's endpoint, auth, and key reference. */
const WEB_SEARCH_FIRECRAWL_SETTINGS_NAMESPACE = settingsNamespace("web-search-firecrawl");
/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallback for `baseURL` lives here (so the provider
 * stays purely about one HTTP call), and every value the provider reads is
 * already fully defaulted.
 *
 * @param ctx - plugin context supplying the credential, settings, and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx, config) {
	const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : undefined;
	return {
		...(literalApiKey === undefined ? {} : { apiKey: literalApiKey }),
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== undefined) {
				const resolved = await credentials.resolve(apiKeyEnv);
				if (resolved !== undefined && resolved.value.length > 0) return resolved.value;
			}
			const ambient = launchEnvironmentOf(ctx).get(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
			return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
		},
		apiKeyEnv,
		noAuth: config.noAuth ?? FIRECRAWL_DEFAULT_NO_AUTH,
		baseURL: (typeof config.baseURL === "string" && config.baseURL.length > 0
			? config.baseURL
			: launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value
		) ?? FIRECRAWL_DEFAULT_BASE_URL,
		limit: config.limit ?? FIRECRAWL_DEFAULT_LIMIT,
		lang: typeof config.lang === "string" && config.lang.length > 0 ? config.lang : undefined,
		country: typeof config.country === "string" && config.country.length > 0 ? config.country : undefined,
		tbs: typeof config.tbs === "string" && config.tbs.length > 0 ? config.tbs : undefined,
		scrapeOptions: config.scrapeOptions,
		recordRequest: (request) => {
			ctx.get("agents")?.currentInitiator()?.session.append("web/firecrawl-search-request", request);
		}
	};
}
/** Register the Firecrawl search provider with `ctx.web`. */
function apply(ctx, config) {
	let current = () => config;
	try {
		installSettingsSection(ctx, WEB_SEARCH_FIRECRAWL_SETTINGS_NAMESPACE, Config, config, {
			setSource: (source) => {
				current = source;
			},
			onChange: () => {}
		});
	} catch (error) {
		// Settings service is optional; the plugin still works without an editable section.
		current = () => config;
	}
	ctx.web.registerSearchProvider(new FirecrawlSearchProvider(() => resolveOptions(ctx, current())));
}
//#endregion
export {
	Config,
FIRECRAWL_DEFAULT_BASE_URL,
FIRECRAWL_DEFAULT_LIMIT,
FIRECRAWL_DEFAULT_LIMIT_CAP,
FIRECRAWL_DEFAULT_NO_AUTH,
FIRECRAWL_PROVIDER_ID,
FirecrawlSearchProvider,
WEB_SEARCH_FIRECRAWL_SETTINGS_NAMESPACE,
apply,
inject,
mapFirecrawlResponse,
name
};
