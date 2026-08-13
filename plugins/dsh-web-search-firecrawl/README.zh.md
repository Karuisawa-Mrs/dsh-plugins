# @dsh-plugs-dev/dsh-web-search-firecrawl

[English](README.md) | 中文

由 [Firecrawl](https://firecrawl.dev) 支持的 `WebSearchProvider`，用于 harness [web 能力 seam](../web/README.md)（`ctx.web`）。它调用本地部署的 Firecrawl API 的专用搜索端点（`POST {baseURL}/v1/search`），并把 Firecrawl 返回的结构化 `data[]` 数组映射为 seam 规范化的 `WebSearchResult`。

这是一个**实现**包：它向 `ctx.web` 注册提供方，通过可选的 `ctx.credentials` seam 为每次搜索解析凭据，且不注册面向模型的工具。与 `@deepseek-ai/dsh-web-search-deepseek` 一样，它是函数／命名空间插件（`inject: ['web']`）。Firecrawl 协议格式（wire format）是提供方私有细节，并**不**使该提供方依赖 `ctx.llm` 或任何 SDK。

## 端点

目标是本地 Firecrawl 部署。默认基址为 `http://localhost:3002`（随包自托管的默认端口），并在其后追加 `/v1/search`。该提供方面向本地实例设计；与之匹配的 `noAuth: true` 默认值可以避免强行向自托管部署索取 API 密钥。

```
POST {baseURL}/v1/search
Content-Type: application/json
Authorization: Bearer <apiKey>     # 仅当 noAuth 为 false 且 apiKey 解析成功时发送
```

## 协议格式（Wire shape）

**请求体：**

| 字段 | 类型 | 是否必填 | 含义 |
|---|---|---|---|
| `query` | `string` | 是 | 搜索查询。 |
| `limit` | `number` | 否 | 返回结果的最大数量。默认 `10`。 |
| `lang` | `string` | 否 | ISO 语言代码（如 `en`、`zh`）。 |
| `country` | `string` | 否 | ISO 国家／地区代码（小写，如 `us`、`cn`）。 |
| `tbs` | `string` | 否 | 基于时间的搜索过滤器（如 `qdr:d` 表示过去一天）。 |
| `scrapeOptions` | `object` | 否 | 可选的爬取格式选项，原样转发给 Firecrawl。 |

**响应体：**

```json
{
  "success": true,
  "data": [
    {
      "url": "https://example.com/article",
      "title": "文章标题",
      "description": "简短摘要...",
      "markdown": "完整 Markdown 内容...",
      "metadata": { "title": "...", "description": "...", "language": "en", "sourceURL": "...", "publishedAt": "2025-01-01T00:00:00Z" }
    }
  ]
}
```

该提供方只消费 `data[]`。`data[i].markdown` 仅作为备选摘录使用，绝不作为 `snippet` 主要来源。

## 鉴权

默认 `noAuth: true` 与本地 Firecrawl 实例匹配，本地实例不需要 `Authorization` 标头。若切换到需要密钥的托管 Firecrawl 部署，请将 `noAuth` 设为 `false` 并提供 `apiKey` 字面值或 `apiKeyEnv` 引用：

```yaml
- id: web-search-firecrawl
  name: '@dsh-plugs-dev/dsh-web-search-firecrawl'
  config:
    noAuth: false
    apiKeyEnv: FIRECRAWL_API_KEY
```

| 模式 | 发送的标头 |
|---|---|
| `noAuth: true`（默认） | 无 |
| `noAuth: false` + `apiKeyEnv` 解析成功 | `Authorization: Bearer <已解析密钥>` |
| `noAuth: false` + 字面 `apiKey` | `Authorization: Bearer <字面值>` |
| `noAuth: false` + 引用无法解析 | 调用以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败 |

已挂载的凭据服务具有权威性；没有该服务时，提供方会回退到启动进程的环境变量。每次搜索都会解析该引用，因此在 Web 的 Models 页中存储或轮换的密钥无需重启，即可用于下一次调用。

## 配置

| 配置键 | 默认值 | 类型 | 含义 |
|---|---|---|---|
| `apiKey` | 未设置 | `string` | Firecrawl API 密钥字面值。优先使用 `apiKeyEnv`，避免密钥进入配置；非空字面值优先。 |
| `apiKeyEnv` | `FIRECRAWL_API_KEY` | `string` | 每次搜索都会通过 `ctx.credentials` 解析该凭据引用；没有该 seam 时则从进程环境解析。`noAuth` 为 false 且值缺失时，调用以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。 |
| `noAuth` | `true` | `boolean` | 为 `true` 时不发送 `Authorization` 标头，匹配本地 Firecrawl 部署默认行为。设为 `false` 可对托管 Firecrawl 进行鉴权。 |
| `baseURL` | `http://localhost:3002` | `string` | Firecrawl 基址；追加 `/v1/search`。托管 Firecrawl 请使用 HTTPS URL。无法解析时提供方不可用。 |
| `limit` | `10` | `number` | 每次搜索请求返回的最大结果数。seam 通过事后截断 `sources[]` 并设置 `truncated` 来强制执行请求的 `maxResults` 上限。 |
| `lang` | 未设置 | `string` | ISO 语言代码，作为搜索通道转发给 Firecrawl。 |
| `country` | 未设置 | `string` | ISO 国家／地区代码（小写），转发给 Firecrawl。 |
| `tbs` | 未设置 | `string` | 基于时间的搜索过滤器（如 `qdr:d`、`qdr:w`、`qdr:m`），转发给 Firecrawl。 |
| `scrapeOptions` | 未设置 | `object` | Firecrawl 爬取格式选项，按原样转发。可用于控制 `markdown` 载荷大小。 |

```yaml
- id: web-search-firecrawl
  name: '@dsh-plugs-dev/dsh-web-search-firecrawl'
  config:
    baseURL: http://localhost:3002
    limit: 10
    noAuth: true
```

上面的条目是 `web-search-firecrawl` Settings 段的 base 层：叠加其上的用户层会作用于**下一次**搜索，因为提供方是按次投影该段，而不是在注册时固化它。因此端点或模型变化时，seam 的提供方选择不会闪断。`apiKey` 带有 `role('secret')`，所以它在任何一层都不会出现在 `describe()` 响应中——配置表层只能知道 credentials 领域是否为 `apiKeyEnv` 所命名的引用持有值，而无从知道某一层是否带着字面密钥。

## 映射

Firecrawl 直接返回 `data[]`，因此 `sources[]` 由各条目一对一构建：`url` ← `url`、`title` ← `title`、`snippet` ← `description`。当 `description` 缺失时，提供方会回退到 `markdown` 的前 280 个字符（去除前导空白），从而只要源包含正文内容，`snippet` 始终非空。`publishedAt` 仅在 Firecrawl 提供时（通常来自 `metadata.publishedAt`）才转发；提供方不会从 URL 或标题臆造日期。

结果按 URL 去重，因为 Firecrawl 可能在多次爬取变体中呈现同一页面。提供方不会丰富 `content`；Firecrawl 返回的提供方生成答案均不被该提供方信任为 `content`，因此 seam 结果中省略 `content`。

提供方失败变为 `WEB_PROVIDER_ERROR`；调用方取消变为 `WEB_ABORTED`。HTTP 重定向会在接触 `Location` 目标前被拒绝，并以 `WEB_PROVIDER_ERROR` 呈现。非 2xx 响应会在错误消息中呈现提供方的 HTTP 状态码与简短响应体。

## 安装

在插件目录下：

```sh
cd "D:/dsh workplace/dsh-plugs-dev/dsh-web-search-firecrawl"
dsh plugin --profile web add file:./
```

> **路径含空格的提示**。`dsh plugin add` 会把参数通过 `cmd.exe` 转发给
> pnpm，而 `cmd.exe` 在空格处分割参数，因此像
> `D:/dsh workplace/...` 这种绝对路径会被截断为 `D:/dsh`，并以
> `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND` 失败。变通方案：
>
> 1. 将工作区移至或重命名为路径中不含空格的目录。如果你控制位置，最简单。
> 2. 在无空格的位置建立 junction，然后从那里安装：
>    ```powershell
>    cmd /c mklink /J D:\dsh-plugins\dsh-web-search-firecrawl \
>        "D:\dsh workplace\dsh-plugs-dev\dsh-web-search-firecrawl"
>    cd D:\dsh-plugins
>    dsh plugin --profile web add file:./dsh-web-search-firecrawl
>    ```
>
> pnpm 未来的版本也许会修复此问题，但截至 `pnpm@11` 仍需要此变通方案。

选择由 `@deepseek-ai/dsh-base` 中 `web` 行的 `searchProvider` 字段驱动。默认本地 profile 可能不会自动选择该提供方——叠加一层 profile 级别的覆盖以锁定选择：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: firecrawl-local
```

提供方 id `firecrawl-local` 由插件以 `FIRECRAWL_PROVIDER_ID` 导出，是 seam 唯一识别的稳定字符串。

## 验证

查看组合后的 Cordis 树：

```sh
dsh --profile web --dump-config | grep -A4 'web-search-firecrawl'
dsh --profile web --dump-config | grep -A2 'id: web$'
```

独立于 DSH 的本地 Firecrawl API 快速 PowerShell 烟雾测试：

```powershell
$body = @{ query = 'deepseek harness'; limit = 3 } | ConvertTo-Json
Invoke-RestMethod -Method Post `
    -Uri 'http://localhost:3002/v1/search' `
    -ContentType 'application/json' `
    -Body $body |
  Select-Object -ExpandProperty data |
  Select-Object url, title
```

若返回的数组包含带 `url` 与 `title` 的对象，则本地 Firecrawl 部署可达；一旦该提供方被选中，其协议格式调用即可成功。

## 模型体验

### 辅助 Firecrawl 搜索请求

#### 模型看到的内容

当搜索在发起 agent 下运行时，会话模型**不会**接收到该辅助 Firecrawl 请求。提供方在发出请求前一刻，向相应会话追加仅用于日志的 `web/firecrawl-search-request` 会话事件，其中包含已解析端点、不含密钥的 JSON 请求体，不包含标头和凭据。会话模型只在 seam 规范化并去重完成后才看到搜索结果。

#### Token 影响

搜索请求本身不会直接产生会话 token。搜索结果 token 随返回的源与 snippet 增长，随后 seam 通过截断 `sources[]` 并设置 `truncated` 来强制执行请求的 `maxResults` 上限。

#### KV Cache 影响

与会话请求缓存相互独立。辅助 Firecrawl 请求永远不会进入会话的 KV 前缀；搜索查询或提供方配置的变化仅限于下次搜索，不会使会话的 KV Cache 失效。

### 间接的会话工具结果

#### 模型看到的内容

通过 [`dsh-tool-web`](../tool-web/README.md)，会话模型会看到规范化 `WebSearchResult` 中去重后的 URL、标题、日期与 snippet 摘录；提供方文本不会作为答案受到信任。该提供方的具体错误消息包括带有处理指引的凭据缺失消息、`Firecrawl search credential resolution failed: <error>`、`Firecrawl search aborted`、`Firecrawl search request failed: <error>`、`Firecrawl returned a non-2xx response: <status> <body>` 和 `Firecrawl returned an unprocessable response body: <error>`。错误包装属于消费方。

#### Token 影响

注册不会直接产生会话 token。结果 token 随返回源与 snippet 增长，随后 seam 会强制执行请求的源数量上限。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与暂缓事项

- **默认假设为本地部署**——默认基址为 `http://localhost:3002`、`noAuth: true`。托管 Firecrawl 需同时调整 `baseURL` 与 `noAuth`，并搭配 `apiKeyEnv` 或字面 `apiKey`。
- **没有 `content` 字段**——Firecrawl 的响应是爬取结果列表，而非生成的答案。提供方不会把任何单一结果的 `markdown` 作为 `content` 信任；会话模型只会收到规范化后的源。
- **动态凭据的可用性在操作内部解析**——同步的 `available()` 约定可以确认解析器存在，但无法查询异步凭据存储。因此选中已鉴权提供方会使搜索以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败；搜索 schema 仍保持注册。调用方取消在本地与该预检存在竞态，但无法强制任意凭据后端自行停止工作。
- **Markdown 兜底是预览片段，不是高质量摘录**——当 `description` 缺失时，提供方会取 `markdown` 的前 280 个字符作为 `snippet`。这只是预览，并非高质量摘录；Firecrawl 爬取输出受限的部署可能得到质量欠佳的 snippet。
- **超量返回的源仍消耗 token**——Firecrawl 公开 `limit` 但可能返回少于 seam 要求的 `maxResults`；seam 只能事后截断来强制执行 `maxResults`。
