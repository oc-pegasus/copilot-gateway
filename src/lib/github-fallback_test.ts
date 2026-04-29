import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { initRepo } from "../repo/index.ts";
import { InMemoryRepo } from "../repo/memory.ts";
import { getGithubCredentialsWithFallback } from "./github.ts";
import { markCooldown, clearCooldown } from "./account-cooldown.ts";

function setupRepo() {
  const repo = new InMemoryRepo();
  initRepo(repo);
  return repo;
}

async function addAccount(repo: InMemoryRepo, id: number, login: string, active = false) {
  const github = repo.github;
  await github.saveAccount(id, {
    token: `token-${id}`,
    accountType: "individual",
    user: { id, login, name: login, avatar_url: "" },
  });
  if (active) await github.setActiveId(id);
}

Deno.test("getGithubCredentialsWithFallback returns preferred account when not cooling down", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  clearCooldown(1);
  clearCooldown(2);

  const result = await getGithubCredentialsWithFallback();
  assertEquals(result.accountId, 1);
  assertEquals(result.token, "token-1");
});

Deno.test("getGithubCredentialsWithFallback falls back when preferred is cooling down", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  markCooldown(1, 60_000);
  clearCooldown(2);

  const result = await getGithubCredentialsWithFallback();
  assertEquals(result.accountId, 2);
  clearCooldown(1);
});

Deno.test("getGithubCredentialsWithFallback uses preferred when all cooling down", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  markCooldown(1, 60_000);
  markCooldown(2, 60_000);

  const result = await getGithubCredentialsWithFallback();
  assertEquals(result.accountId, 1);
  clearCooldown(1);
  clearCooldown(2);
});

Deno.test("getGithubCredentialsWithFallback respects explicit preferredAccountId", async () => {
  const repo = setupRepo();
  await addAccount(repo, 1, "user1", true);
  await addAccount(repo, 2, "user2");
  clearCooldown(1);
  clearCooldown(2);

  const result = await getGithubCredentialsWithFallback(2);
  assertEquals(result.accountId, 2);
});

Deno.test("getGithubCredentialsWithFallback throws when no accounts", async () => {
  setupRepo();
  await assertRejects(
    () => getGithubCredentialsWithFallback(),
    Error,
    "No GitHub account connected",
  );
});
