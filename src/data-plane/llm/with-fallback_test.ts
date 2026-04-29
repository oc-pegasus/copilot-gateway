import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { initRepo } from "../../repo/index.ts";
import { InMemoryRepo } from "../../repo/memory.ts";
import { withAccountFallback } from "./with-fallback.ts";
import { clearCooldown, isCoolingDown } from "../../lib/account-cooldown.ts";
import type { ExecuteResult } from "./shared/errors/result.ts";

function setupRepo() {
  const repo = new InMemoryRepo();
  initRepo(repo);
  return repo;
}

async function addAccount(repo: InMemoryRepo, id: number, login: string, active = false) {
  await repo.github.saveAccount(id, {
    token: `token-${id}`,
    accountType: "individual",
    user: { id, login, name: login, avatar_url: "" },
  });
  if (active) await repo.github.setActiveId(id);
}

const ctx = { endpoint: "/v1/messages", model: "test-model" };

Deno.test("withAccountFallback returns result directly on success", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  clearCooldown(1);

  const { result, cred } = await withAccountFallback(
    undefined,
    async () => ({ type: "events", events: (async function* () {})() } as ExecuteResult<unknown>),
    ctx,
  );

  assertEquals(result.type, "events");
  assertEquals(cred.accountId, 1);
});

Deno.test("withAccountFallback retries on 429 with different account", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  clearCooldown(1);
  clearCooldown(2);

  let callCount = 0;
  const { result, cred } = await withAccountFallback(
    undefined,
    async (c) => {
      callCount++;
      if (c.accountId === 1) {
        return {
          type: "upstream-error",
          status: 429,
          headers: new Headers(),
          body: new Uint8Array(),
        } as ExecuteResult<unknown>;
      }
      return { type: "events", events: (async function* () {})() } as ExecuteResult<unknown>;
    },
    ctx,
  );

  assertEquals(callCount, 2);
  assertEquals(cred.accountId, 2);
  assertEquals(result.type, "events");
  assertEquals(isCoolingDown(1), true);
  clearCooldown(1);
});

Deno.test("withAccountFallback does not retry on non-429 error", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  clearCooldown(1);
  clearCooldown(2);

  let callCount = 0;
  const { result } = await withAccountFallback(
    undefined,
    async () => {
      callCount++;
      return {
        type: "upstream-error",
        status: 500,
        headers: new Headers(),
        body: new Uint8Array(),
      } as ExecuteResult<unknown>;
    },
    ctx,
  );

  assertEquals(callCount, 1);
  assertEquals(result.type, "upstream-error");
});

Deno.test("withAccountFallback does not retry when same account returned", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  clearCooldown(1);

  let callCount = 0;
  const { result } = await withAccountFallback(
    undefined,
    async () => {
      callCount++;
      return {
        type: "upstream-error",
        status: 429,
        headers: new Headers(),
        body: new Uint8Array(),
      } as ExecuteResult<unknown>;
    },
    ctx,
  );

  assertEquals(callCount, 1);
  assertEquals(result.type, "upstream-error");
  clearCooldown(1);
});

Deno.test("withAccountFallback logs errors to repo", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  clearCooldown(1);

  await withAccountFallback(
    undefined,
    async () => ({
      type: "upstream-error",
      status: 500,
      headers: new Headers(),
      body: new TextEncoder().encode("server error"),
    } as ExecuteResult<unknown>),
    { endpoint: "/v1/messages", model: "test", apiKeyId: "key1" },
  );

  const entries = await repo.errorLog.query({ start: "2000-01-01", end: "2099-01-01" });
  assertEquals(entries.length, 1);
  assertEquals(entries[0].statusCode, 500);
  assertEquals(entries[0].endpoint, "/v1/messages");
  assertEquals(entries[0].wasFallback, false);
});
