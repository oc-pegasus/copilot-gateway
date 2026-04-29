# CG-004 Backend Fallback — 技术设计

日期：2026-04-29 | 状态：Draft | 作者：飞马

## 1. 概述

当 GitHub Copilot API 返回 429（限流）时，自动切换到其他已连接的 GitHub 账号重试请求。被限流的账号进入 cooldown 状态，默认 30 分钟后恢复。同时记录所有 4xx/5xx 上游错误，在 Dashboard 展示。

## 2. 当前架构

请求链路：
```
Client → serve.ts → getGithubCredentials(accountId?) → emitTo*(token) → copilotFetch() → Copilot API
```

- `getGithubCredentials()` 根据 per-key 绑定或 active account 返回 token
- `emitTo*()` 返回 `ExecuteResult` = `events | upstream-error | internal-error`
- `upstream-error` 包含 status, headers, body

涉及 5 个入口：chat-completions, messages, responses, models, embeddings

## 3. 设计方案

### 3.1 Account Cooldown 管理

新增 `src/lib/account-cooldown.ts`：

```typescript
interface CooldownEntry {
  until: number;  // timestamp ms
}

// 内存 Map，per-isolate 有效
const cooldowns = new Map<number, CooldownEntry>();

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export function markCooldown(accountId: number, durationMs = DEFAULT_COOLDOWN_MS): void {
  cooldowns.set(accountId, { until: Date.now() + durationMs });
}

export function isCoolingDown(accountId: number): boolean {
  const entry = cooldowns.get(accountId);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    cooldowns.delete(accountId);
    return false;
  }
  return true;
}

export function clearCooldown(accountId: number): void {
  cooldowns.delete(accountId);
}
```

**关于 Cloudflare Workers 无状态**：每个 isolate 有自己的内存 Map。同一 isolate 内的请求共享 cooldown 状态，不同 isolate 可能重复触发一次 429 然后各自学会。这是可接受的——"尽力而为"足够，不需要全局一致性。

### 3.2 Credential Selection with Fallback

修改 `src/lib/github.ts`，新增函数：

```typescript
export interface CredentialResult {
  token: string;
  accountType: string;
  accountId: number;
}

export async function getGithubCredentialsWithFallback(
  preferredAccountId?: number
): Promise<CredentialResult> {
  const accounts = await listGithubAccounts();
  if (accounts.length === 0) {
    throw new Error("No GitHub account connected");
  }

  // 1. Try preferred account (per-key binding or active)
  const preferredId = preferredAccountId ?? (await getRepo().github.getActiveId());
  if (preferredId != null) {
    const preferred = accounts.find(a => a.user.id === preferredId);
    if (preferred && !isCoolingDown(preferredId)) {
      return { token: preferred.token, accountType: preferred.accountType, accountId: preferredId };
    }
  }

  // 2. Fallback: first available account not in cooldown
  for (const account of accounts) {
    if (!isCoolingDown(account.user.id)) {
      return { token: account.token, accountType: account.accountType, accountId: account.user.id };
    }
  }

  // 3. All accounts in cooldown — use preferred anyway (will likely 429)
  const fallback = preferredId != null
    ? accounts.find(a => a.user.id === preferredId) ?? accounts[0]
    : accounts[0];
  return { token: fallback.token, accountType: fallback.accountType, accountId: fallback.user.id };
}
```

### 3.3 Retry Wrapper

新增 `src/data-plane/llm/with-fallback.ts`：

```typescript
import type { ExecuteResult } from "./shared/errors/result.ts";
import { markCooldown } from "../../lib/account-cooldown.ts";
import { getGithubCredentialsWithFallback, type CredentialResult } from "../../lib/github.ts";

export async function withAccountFallback<T>(
  preferredAccountId: number | undefined,
  execute: (cred: CredentialResult) => Promise<ExecuteResult<T>>,
): Promise<{ result: ExecuteResult<T>; cred: CredentialResult }> {
  const cred = await getGithubCredentialsWithFallback(preferredAccountId);
  const result = await execute(cred);

  // If 429, mark cooldown and retry with different account
  if (result.type === "upstream-error" && result.status === 429) {
    markCooldown(cred.accountId);
    const fallbackCred = await getGithubCredentialsWithFallback(preferredAccountId);

    // Only retry if we got a different account
    if (fallbackCred.accountId !== cred.accountId) {
      const retryResult = await execute(fallbackCred);
      return { result: retryResult, cred: fallbackCred };
    }
  }

  return { result, cred };
}
```

### 3.4 Serve.ts 改动

以 `chat-completions/serve.ts` 为例（messages 和 responses 同理）：

```diff
- const { token: githubToken, accountType } = await getGithubCredentials(...);
- const capabilities = await getModelCapabilities(payload.model, githubToken, accountType);
- const plan = planChatRequest(payload, capabilities);
- ...
- const result = await emitToMessages({ githubToken, accountType, ... });

+ const { result, cred } = await withAccountFallback(
+   c.get("githubAccountId") as number | undefined,
+   async (cred) => {
+     const capabilities = await getModelCapabilities(payload.model, cred.token, cred.accountType);
+     const plan = planChatRequest(payload, capabilities);
+     // ... build and emit based on plan ...
+     return await emitTo*(/* using cred.token, cred.accountType */);
+   }
+ );
```

**注意**：retry 会重新执行整个 plan + emit 流程（包括 capabilities 查询），因为不同 account 可能有不同的 model 权限。

### 3.5 Error Logging

#### 3.5.1 数据模型

新增 D1 migration `0005_add_error_log.sql`：

```sql
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  account_id INTEGER,
  api_key_id TEXT,
  model TEXT,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  error_body TEXT,
  was_fallback INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_error_log_timestamp ON error_log(timestamp);
```

#### 3.5.2 Repo 接口

```typescript
// src/repo/types.ts
export interface ErrorLogEntry {
  timestamp: string;
  accountId: number | null;
  apiKeyId: string | null;
  model: string | null;
  endpoint: string;
  statusCode: number;
  errorBody: string | null;
  wasFallback: boolean;
}

export interface ErrorLogRepo {
  log(entry: Omit<ErrorLogEntry, 'timestamp'>): Promise<void>;
  query(opts: { start: string; end: string; limit?: number }): Promise<ErrorLogEntry[]>;
}
```

#### 3.5.3 记录时机

在 `withAccountFallback` 中，当 result 是 upstream-error 且 status >= 400 时记录。

#### 3.5.4 Dashboard

在 Dashboard 新增 "Errors" tab（或 sub-section of Usage tab），展示：
- 错误时间线图（按小时/天聚合）
- 错误列表（时间、account、model、status code）
- Fallback 事件标记

## 4. 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/lib/account-cooldown.ts` | **新增** cooldown 管理 |
| `src/lib/github.ts` | 新增 `getGithubCredentialsWithFallback()` |
| `src/data-plane/llm/with-fallback.ts` | **新增** retry wrapper |
| `src/data-plane/llm/sources/chat-completions/serve.ts` | 使用 withAccountFallback |
| `src/data-plane/llm/sources/messages/serve.ts` | 同上 |
| `src/data-plane/llm/sources/responses/serve.ts` | 同上 |
| `src/data-plane/models/serve.ts` | 同上（或简化版，models 不太会 429） |
| `src/data-plane/embeddings/serve.ts` | 同上 |
| `migrations/0005_add_error_log.sql` | **新增** error_log 表 |
| `src/repo/types.ts` | 新增 ErrorLogRepo 接口 |
| `src/repo/d1.ts` | 实现 ErrorLogRepo |
| `src/repo/deno.ts` | 实现 ErrorLogRepo（内存版） |
| `src/repo/memory.ts` | 实现 ErrorLogRepo（内存版） |
| `src/control-plane/error-log/routes.ts` | **新增** 查询 API |
| `src/control-plane/routes.ts` | 挂载 error-log routes |
| `src/ui/dashboard/client.tsx` | 新增错误展示逻辑 |
| `src/ui/dashboard/tabs.tsx` | 新增 Errors tab 模板 |

## 5. 测试策略

- **单元测试**：account-cooldown.ts（cooldown/恢复/全部冷却）
- **单元测试**：getGithubCredentialsWithFallback（首选/fallback/全部冷却）
- **单元测试**：withAccountFallback（429 重试/非 429 直接返回/相同 account 不重试）
- **集成测试**：mock copilotFetch 返回 429，验证 fallback 行为
- **E2E**：Dashboard 错误日志展示

## 6. 风险与注意事项

1. **Workers 无状态**：cooldown 是 per-isolate 的，不同 isolate 可能重复触发 429。可接受。
2. **Retry 成本**：429 后重试意味着同一请求可能执行两次。但 429 本身就失败了，重试的成本 < 用户重新发请求的成本。
3. **Capabilities 差异**：不同 account 的 model 权限可能不同。retry 时重新查 capabilities 确保兼容。
4. **流式请求**：429 通常在连接建立前返回（HTTP status），不会在流中途出现，所以 retry 逻辑不涉及 partial stream 处理。

## 7. 备选方案

- **D1/KV 存 cooldown**：全局一致但增加延迟和 D1 读写成本。当前场景不值得。
- **指数退避**：增加复杂性。先固定 30 分钟，不够再加。
- **Retry-After header**：可以未来作为增强，用 header 值替代默认 30 分钟。
