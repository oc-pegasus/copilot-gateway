# Backend Fallback（429 限流自动切换） - PRD

日期：2026-04-29 | 状态：Approved | 任务编号：CG-004

## 背景

当用户高频使用 Copilot Gateway 时，单个 GitHub 账号可能触发 Copilot API 的 429 限流。目前系统没有自动降级机制，限流后请求直接失败，影响用户体验。

## 目标用户

所有通过 Copilot Gateway 使用 LLM API 的用户（包括 Claude Code、OpenClaw 等客户端）。

## 核心需求

### 需求 1：Account 级别自动 Fallback

- **用户故事**：作为 API 用户，当我绑定的 GitHub 账号被限流时，我希望系统自动切换到备用账号继续服务，这样我的工作不会中断。
- **验收标准**：
  - [ ] 429 响应触发当前 account 进入 cooldown 状态
  - [ ] 系统自动选择其他可用 account 重试当前请求
  - [ ] 所有 account 都在 cooldown 时，返回 429 给客户端
  - [ ] 与 per-key backend 配置互补：per-key 指定首选 account，fallback 在首选不可用时降级

### 需求 2：可配置的冷却时间

- **用户故事**：作为管理员，我希望能配置 cooldown 时长，这样可以根据实际限流情况调整。
- **验收标准**：
  - [ ] 默认冷却时间 30 分钟
  - [ ] 支持通过配置修改冷却时长
  - [ ] 冷却到期后 account 自动恢复可用

### 需求 3：错误日志 Dashboard

- **用户故事**：作为管理员，我希望在 Dashboard 上看到 4xx/5xx 错误记录，这样能了解服务的健康状况和限流频率。
- **验收标准**：
  - [ ] 记录所有 4xx 和 5xx 上游错误
  - [ ] Dashboard 展示错误日志（时间、account、错误码、模型）
  - [ ] 能看到 fallback 切换事件

## 不在 v1 范围

- 其他 LLM provider 作为 backup（如直连 Anthropic API）
- 指数退避策略
- 基于 Retry-After header 的动态冷却时间
- 自动通知（Discord/邮件告警）

## 成功指标

- 429 限流时用户请求成功率 > 95%（有可用备用 account 时）
- Fallback 切换对用户透明，无需手动干预

## 开放问题

（无，需求已在频道确认）
