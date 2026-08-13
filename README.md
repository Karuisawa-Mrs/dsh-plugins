# dsh-plugins

A monorepo of community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — `@deepseek-ai/dsh`.

Each `plugins/<name>/` directory is an independent, shippable plugin package you can install into a DSH profile with one command:

```sh
dsh plugin --profile <profile> add file:./plugins/<name>
```

> **Path-with-spaces workaround.** `dsh plugin add` forwards its argument to
> pnpm through `cmd.exe`, which splits arguments on whitespace, so an absolute
> path like `D:/dsh workplace/...` is truncated to `D:/dsh`. From a space-free
> working directory, run `dsh plugin --profile <profile> add file:./plugins/<name>`
> directly.

## Plugins

| Plugin | Description | Install |
|---|---|---|
| [`dsh-web-search-firecrawl`](plugins/dsh-web-search-firecrawl) | Local [Firecrawl](https://firecrawl.dev) `/v1/search` as a `WebSearchProvider` for `ctx.web`. | `dsh plugin --profile web add file:./plugins/dsh-web-search-firecrawl` |

See each plugin's README for configuration, env vars, and per-profile setup.

## Repository conventions

- Each `plugins/<name>/` is its own npm package (`<scope>/dsh-<name>` or `@dsh-plugs-dev/<name>`); plugins declare `dsh.bundle.patch` in their own `package.json`.
- A plugin's `cordis.patch.yml` uses the `insert` form (bundle-layer add) — id-targeted replace patches are reserved for user/profile layers that override an existing row.
- A user-layer override at `~/.dsh/profiles/<name>/cordis.patch.yml` pins provider selection (e.g. `searchProvider: firecrawl-local`).
- Plugins follow the [`dsh-plugin-dev` skill](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-plugin-dev/SKILL.md) conventions: function-form plugins, `inject: ['web']` (or the relevant seam), `Config` schema via `@deepseek-ai/schemastery`, `!!js` not `!js` in YAML.

## Adding a new plugin

1. Create `plugins/<your-plugin>/` with `package.json`, `cordis.patch.yml`, `lib/index.js`, `lib/types/`, `README.md`.
2. Mirror the shape of an existing plugin — see `plugins/dsh-web-search-firecrawl/` for the canonical layout.
3. Open a PR. The repo carries the [`dsh-plugin`](https://github.com/topics/dsh-plugin) GitHub topic so the DSH community can discover it.
