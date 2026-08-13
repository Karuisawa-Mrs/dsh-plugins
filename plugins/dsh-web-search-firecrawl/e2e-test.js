// End-to-end verification. Run this from the profile directory so it can
// resolve `@dsh-plugs-dev/dsh-web-search-firecrawl` and its transitive deps.
import { FirecrawlSearchProvider, mapFirecrawlResponse, FIRECRAWL_PROVIDER_ID } from "@dsh-plugs-dev/dsh-web-search-firecrawl";

console.log(`FIRECRAWL_PROVIDER_ID = ${FIRECRAWL_PROVIDER_ID}`);

const provider = new FirecrawlSearchProvider(() => ({
  noAuth: true,
  baseURL: "http://localhost:3002",
  limit: 5,
  resolveApiKey: async () => undefined,
  recordRequest: (req) => console.log(`  [session-log] endpoint=${req.endpoint} body=${JSON.stringify(req.body)}`),
}));

console.log(`provider.id = ${provider.id}`);
console.log(`provider.available() = ${provider.available()}`);

if (!provider.available()) {
  console.error("FAIL: provider reports unavailable");
  process.exit(1);
}

console.log("\n--- search 1: 'TypeScript tutorial' (limit 3) ---");
const r1 = await provider.search({ query: "TypeScript tutorial", maxResults: 3 });
console.log(`truncated=${r1.truncated} sources=${r1.sources.length}`);
for (const s of r1.sources.slice(0, 3)) {
  console.log(`  - ${s.title ?? "(no title)"}`);
  console.log(`    url: ${s.url}`);
  console.log(`    snippet: ${s.snippet ? s.snippet.slice(0, 80) + "..." : "(none)"}`);
}

console.log("\n--- search 2: empty result probe ---");
const r2 = await provider.search({ query: "xyzqwertynonsensequery12345", maxResults: 5 });
console.log(`truncated=${r2.truncated} sources=${r2.sources.length}`);

console.log("\n--- search 3: abort handling ---");
const controller = new AbortController();
const aborted = provider.search({ query: "hello", maxResults: 3 }, controller.signal).catch((e) => e);
controller.abort();
const abortResult = await aborted;
console.log(`abort result: name=${abortResult.name} code=${abortResult.code} message=${abortResult.message}`);

console.log("\n--- mapFirecrawlResponse direct probe ---");
const mapped = mapFirecrawlResponse({ success: true, data: [{ url: "https://x.test/", title: "x", description: "d" }] });
console.log(`mapped: ${JSON.stringify(mapped)}`);

try {
  mapFirecrawlResponse({ success: false, error: "synthetic" });
  console.log("FAIL: should have thrown");
} catch (e) {
  console.log(`error path: name=${e.name} code=${e.code} message=${e.message}`);
}

console.log("\nOK");
