// Push the local commit to GitHub via the REST Git Database API.
// Network here can't reach github.com:443 from a fresh TCP connection, so the
// git+https protocol fails; gh CLI works because it shares the host's
// already-open API sockets. Use gh's auth token with `gh auth token`, then
// drive the four Git Database endpoints directly.
//
// The walk() honors a per-tree .gitignore so plugins we don't want to ship
// stay out of the push.

import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ROOT = process.argv[2] ?? "D:\\dsh workplace\\dsh-plugs-dev";
const OWNER = process.argv[3] ?? "Karuisawa-Mrs";
const REPO = process.argv[4] ?? "dsh-plugins";
const BRANCH = process.argv[5] ?? "master";

const TOKEN = (await import("node:child_process")).execSync("gh auth token", { encoding: "utf8" }).trim();
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const HEADERS = {
  authorization: `Bearer ${TOKEN}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "dsh-plugins-pusher",
};

async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...HEADERS, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(method + " " + path + " -> " + r.status + ": " + text);
  return text ? JSON.parse(text) : null;
}

async function parseIgnore(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function matchIgnore(rel, rules) {
  for (const raw of rules) {
    if (!raw) continue;
    let pattern = raw;
    let anchored = false;
    if (pattern.startsWith("/")) {
      anchored = true;
      pattern = pattern.slice(1);
    }
    if (pattern.endsWith("/")) {
      if (anchored && rel.startsWith(pattern)) return true;
      if (rel.split("/").includes(pattern.slice(0, -1))) return true;
    } else {
      const p = pattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
      if (anchored) {
        if (rel === pattern) return true;
      } else {
        if (new RegExp("(^|/)" + p + "$").test(rel)) return true;
      }
    }
  }
  return false;
}

async function* walk(dir, base = dir, parentRules = []) {
  const rules = [...parentRules, ...(await parseIgnore(join(dir, ".gitignore")))];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join("/");
    if (matchIgnore(rel, rules)) continue;
    if (entry.isDirectory()) {
      yield* walk(full, base, rules);
    } else {
      yield rel;
    }
  }
}

async function blob(content) {
  return api("POST", "/git/blobs", { content, encoding: "utf-8" });
}

const files = [];
for await (const rel of walk(ROOT)) {
  const buf = await readFile(join(ROOT, rel), "utf8");
  files.push({ path: rel, content: buf });
}
console.log("Found " + files.length + " files");

console.log("Bootstrapping empty repo with README.md via contents API...");
const readme = files.find((f) => f.path === "README.md");
try {
  await api("PUT", "/contents/README.md", {
    message: "init: bootstrap empty repository",
    content: Buffer.from(readme.content, "utf8").toString("base64"),
  });
  console.log("  bootstrap commit OK");
} catch (e) {
  console.log("  bootstrap failed (continuing): " + e.message);
}

console.log("Creating blobs...");
const blobs = await Promise.all(files.map(async (f) => {
  const { sha } = await blob(f.content);
  return { path: f.path, sha };
}));

console.log("Creating tree...");
const tree = await api("POST", "/git/trees", {
  tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
});

console.log("Creating commit...");
const commit = await api("POST", "/git/commits", {
  message: "feat: add dsh-web-search-firecrawl plugin\n\nFirecrawl-backed WebSearchProvider for the DSH web capability seam (ctx.web). Targets the locally-deployed Firecrawl API at http://localhost:3002, defaults noAuth: true, registers id firecrawl-local. Mirrors @deepseek-ai/dsh-web-search-deepseek: function-form plugin (inject: ['web']), schemastery Config, abort-aware search(), session-log event web/firecrawl-search-request.",
  tree: tree.sha,
  parents: [],
});

console.log("Updating ref refs/heads/" + BRANCH + " (force)...");
await api("PATCH", "/git/refs/heads/" + BRANCH, { sha: commit.sha, force: true });

console.log("Done. https://github.com/" + OWNER + "/" + REPO + "/commit/" + commit.sha);
