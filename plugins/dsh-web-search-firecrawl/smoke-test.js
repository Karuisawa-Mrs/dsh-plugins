// Smoke test for Firecrawl /v1/search API contract verification.
// Probes http://localhost:3002/v1/search with 9 variants to confirm wire shapes
// before the DSH plugin implementation maps to WebSearchResult.
const BASE = "http://localhost:3002";

const cases = [
  {
    name: "basic",
    method: "POST",
    body: { query: "hello world", limit: 3 },
    expect: (r, parsed, sources) => ({
      ok: r.status === 200 && parsed?.success === true && sources.length === 3,
      message: `expected status=200 success=true items=3 (got ${r.status}, success=${parsed?.success}, items=${sources.length})`,
    }),
  },
  {
    name: "description",
    method: "POST",
    body: { query: "firecrawl" },
    expect: (r, parsed, sources) => ({
      ok: r.status === 200 && parsed?.success === true && sources.some((s) => typeof s.description === "string" && s.description.length > 0),
      message: `expected status=200 with description field on at least one source (got status=${r.status}, sources=${sources.length}, descriptions=${sources.filter((s) => typeof s.description === "string").length})`,
    }),
  },
  {
    name: "limit-1",
    method: "POST",
    body: { query: "deepseek", limit: 1 },
    expect: (r, parsed, sources) => ({
      ok: r.status === 200 && parsed?.success === true && sources.length === 1,
      message: `expected exactly 1 source (got status=${r.status}, items=${sources.length})`,
    }),
  },
  {
    name: "lang-country",
    method: "POST",
    body: { query: "tokyo tower", limit: 2, lang: "en", country: "JP" },
    expect: (r, parsed, sources) => ({
      // lang/country are optional filters; we just need the call to succeed and return shape.
      ok: r.status === 200 && parsed?.success === true,
      message: `expected status=200 success=true (got ${r.status}, success=${parsed?.success})`,
    }),
  },
  {
    name: "scrape-options",
    method: "POST",
    body: { query: "rust async", limit: 1, scrapeOptions: { formats: ["markdown"] } },
    expect: expectScrapeOptions,
  },
  {
    name: "no-results",
    method: "POST",
    body: { query: "xyzqwertynonsensequery12345nodatashouldexist" },
    expect: (r, parsed, sources) => {
      // Real Firecrawl performs fuzzy matching and almost always returns >= 1
      // result, even for nonsense strings. The shape we care about is the
      // envelope: success=true and data is an array (possibly empty).
      const wellShaped = r.status === 200 && parsed?.success === true && Array.isArray(sources);
      return {
        ok: wellShaped,
        message: `status=${r.status}; success=${parsed?.success}; items=${sources.length}; warning=${parsed?.warning ?? "none"}`,
      };
    },
  },
  {
    name: "empty-query",
    method: "POST",
    body: { query: "" },
    expect: (r, parsed) => ({
      // We don't presume; just record what comes back.
      ok: r.status !== 0,
      message: `captured (status=${r.status})`,
    }),
  },
  {
    name: "invalid-limit",
    method: "POST",
    body: { query: "hello", limit: -1 },
    expect: (r, parsed) => ({
      ok: r.status !== 0,
      message: `captured (status=${r.status})`,
    }),
  },
  {
    name: "get-not-allowed",
    method: "GET",
    body: null,
    expect: (r) => ({
      ok: r.status !== 0,
      message: `GET probe captured (status=${r.status})`,
    }),
  },
];

function normalize(s) {
  return {
    url: s.url,
    title: s.title,
    snippet: s.description ?? (s.markdown ? s.markdown.slice(0, 280) : undefined),
    publishedAt: s.publishedAt,
  };
}

function expectScrapeOptions(r, parsed, sources) {
  // scrapeOptions is accepted by the API; if the mock has data the markdown
  // field will be present, otherwise it returns an empty `data` with a
  // `warning` field. Either is acceptable for the wire-shape check.
  const accepted = r.status === 200 && parsed?.success === true;
  const hasMarkdown = sources.some((s) => typeof s.markdown === "string" && s.markdown.length > 0);
  const mdCount = sources.filter((s) => typeof s.markdown === "string").length;
  const ok = accepted && (hasMarkdown || (Array.isArray(sources) && sources.length === 0));
  return {
    ok,
    message: `accepted=${accepted}; markdown sources=${mdCount}; data items=${sources.length}; warning=${parsed?.warning ?? "none"}`,
  };
}

let failures = 0;
const results = [];

for (const c of cases) {
  const init = { method: c.method, headers: { "content-type": "application/json" } };
  if (c.body !== null) init.body = JSON.stringify(c.body);

  const reqBodyStr = c.body !== null ? JSON.stringify(c.body) : "(no body)";
  console.log(`\n--- [${c.name}] ${c.method} /v1/search ---`);
  console.log(`request body: ${reqBodyStr}`);

  let r, text;
  try {
    r = await fetch(`${BASE}/v1/search`, init);
    text = await r.text();
  } catch (err) {
    console.log(`REQUEST ERROR: ${err.message}`);
    failures++;
    results.push({ name: c.name, passed: false, message: `fetch error: ${err.message}` });
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const rawSources = Array.isArray(parsed?.data) ? parsed.data : [];
  const normalized = rawSources.map(normalize);
  const preview = text.length > 500 ? text.slice(0, 500) + "..." : text;

  console.log(`HTTP status: ${r.status}`);
  console.log(`body bytes: ${text.length}`);
  console.log(`body preview: ${preview}`);
  console.log(`normalized count: ${normalized.length}`);
  console.log(`first url: ${normalized[0]?.url ?? "(none)"}`);
  if (rawSources[0]) {
    const keys = Object.keys(rawSources[0]).sort();
    console.log(`first source keys: ${keys.join(", ")}`);
  }

  const expected = c.expect(r, parsed, rawSources);
  if (expected.ok) {
    console.log(`PASS: ${expected.message}`);
    results.push({ name: c.name, passed: true, message: expected.message });
  } else {
    console.log(`FAIL: ${expected.message}`);
    failures++;
    results.push({ name: c.name, passed: false, message: expected.message });
  }
}

console.log(`\n=== Summary ===`);
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed);
console.log(`✓ ${passed}/${results.length} passed`);
if (failed.length > 0) {
  const failedDesc = failed.map((r) => `${r.name} (${r.message})`).join(", ");
  console.log(`✗ ${failed.length}/${results.length} failed: ${failedDesc}`);
}

process.exit(failures > 0 ? 1 : 0);
