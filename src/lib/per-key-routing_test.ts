import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { setupAppTest } from "../test-helpers.ts";
import { getGithubCredentials, removeGithubAccount } from "./github.ts";
import { createApiKey, validateApiKey } from "./api-keys.ts";
import type { GitHubAccount } from "../repo/types.ts";

// ---------------------------------------------------------------------------
// getGithubCredentials — per-key routing
// ---------------------------------------------------------------------------

Deno.test("getGithubCredentials with specific githubAccountId returns that account's credentials", async () => {
  const { repo } = await setupAppTest();

  // Add a second GitHub account
  const secondAccount: GitHubAccount = {
    token: "ghu_second_account_token",
    accountType: "organization",
    user: {
      id: 99999,
      login: "org-bot",
      name: "Org Bot",
      avatar_url: "https://example.com/org.png",
    },
  };
  await repo.github.saveAccount(secondAccount.user.id, secondAccount);

  const creds = await getGithubCredentials(secondAccount.user.id);
  assertEquals(creds.token, "ghu_second_account_token");
  assertEquals(creds.accountType, "organization");
});

Deno.test("getGithubCredentials with no githubAccountId returns active account", async () => {
  const { githubAccount } = await setupAppTest();

  const creds = await getGithubCredentials();
  assertEquals(creds.token, githubAccount.token);
  assertEquals(creds.accountType, githubAccount.accountType);
});

Deno.test("getGithubCredentials with non-existent githubAccountId falls back to active", async () => {
  const { githubAccount } = await setupAppTest();

  // Request credentials for an account ID that doesn't exist
  const creds = await getGithubCredentials(777777);
  assertEquals(creds.token, githubAccount.token);
  assertEquals(creds.accountType, githubAccount.accountType);
});

Deno.test("getGithubCredentials throws when no active account and no specific account", async () => {
  const { repo } = await setupAppTest();

  // Remove all accounts and clear active
  await repo.github.deleteAllAccounts();

  await assertRejects(
    () => getGithubCredentials(),
    Error,
    "No GitHub account connected",
  );
});

// ---------------------------------------------------------------------------
// clearGithubAccountId — MemoryApiKeyRepo
// ---------------------------------------------------------------------------

Deno.test("clearGithubAccountId clears the field on matching keys", async () => {
  const { repo } = await setupAppTest();

  // Save two keys bound to account 42 and one bound to account 99
  await repo.apiKeys.save({
    id: "key_a",
    name: "Key A",
    key: "raw_a",
    createdAt: "2026-04-01T00:00:00.000Z",
    githubAccountId: 42,
  });
  await repo.apiKeys.save({
    id: "key_b",
    name: "Key B",
    key: "raw_b",
    createdAt: "2026-04-01T00:00:00.000Z",
    githubAccountId: 42,
  });
  await repo.apiKeys.save({
    id: "key_c",
    name: "Key C",
    key: "raw_c",
    createdAt: "2026-04-01T00:00:00.000Z",
    githubAccountId: 99,
  });

  await repo.apiKeys.clearGithubAccountId(42);

  const keyA = await repo.apiKeys.getById("key_a");
  const keyB = await repo.apiKeys.getById("key_b");
  const keyC = await repo.apiKeys.getById("key_c");

  assertExists(keyA);
  assertExists(keyB);
  assertExists(keyC);
  assertEquals(keyA.githubAccountId, undefined);
  assertEquals(keyB.githubAccountId, undefined);
  // Key C should be unaffected (bound to account 99, not 42)
  assertEquals(keyC.githubAccountId, 99);
});

// ---------------------------------------------------------------------------
// removeGithubAccount — cascades to api keys
// ---------------------------------------------------------------------------

Deno.test("removeGithubAccount also clears githubAccountId on api keys", async () => {
  const { repo, githubAccount } = await setupAppTest();

  const accountId = githubAccount.user.id;

  // Save a key bound to the active GitHub account
  await repo.apiKeys.save({
    id: "key_bound",
    name: "Bound Key",
    key: "raw_bound",
    createdAt: "2026-04-01T00:00:00.000Z",
    githubAccountId: accountId,
  });

  // Save a key with no binding
  await repo.apiKeys.save({
    id: "key_unbound",
    name: "Unbound Key",
    key: "raw_unbound",
    createdAt: "2026-04-01T00:00:00.000Z",
  });

  await removeGithubAccount(accountId);

  const bound = await repo.apiKeys.getById("key_bound");
  const unbound = await repo.apiKeys.getById("key_unbound");

  assertExists(bound);
  assertExists(unbound);
  assertEquals(bound.githubAccountId, undefined);
  assertEquals(unbound.githubAccountId, undefined);

  // The GitHub account itself should be deleted
  const deletedAccount = await repo.github.getAccount(accountId);
  assertEquals(deletedAccount, null);
});

// ---------------------------------------------------------------------------
// createApiKey — stores githubAccountId
// ---------------------------------------------------------------------------

Deno.test("createApiKey with githubAccountId stores it", async () => {
  await setupAppTest();

  const key = await createApiKey("Routed Key", 12345);

  assertExists(key.id);
  assertExists(key.key);
  assertEquals(key.name, "Routed Key");
  assertEquals(key.githubAccountId, 12345);
});

Deno.test("createApiKey without githubAccountId omits the field", async () => {
  await setupAppTest();

  const key = await createApiKey("Plain Key");

  assertExists(key.id);
  assertEquals(key.name, "Plain Key");
  assertEquals(key.githubAccountId, undefined);
});

// ---------------------------------------------------------------------------
// validateApiKey — returns githubAccountId
// ---------------------------------------------------------------------------

Deno.test("validateApiKey returns githubAccountId when present", async () => {
  const { repo } = await setupAppTest();

  await repo.apiKeys.save({
    id: "key_with_account",
    name: "With Account",
    key: "raw_validate_test",
    createdAt: "2026-04-01T00:00:00.000Z",
    githubAccountId: 54321,
  });

  const result = await validateApiKey("raw_validate_test");

  assertExists(result);
  assertEquals(result.id, "key_with_account");
  assertEquals(result.name, "With Account");
  assertEquals(result.githubAccountId, 54321);
});

Deno.test("validateApiKey returns undefined githubAccountId when not set", async () => {
  const { apiKey } = await setupAppTest();

  const result = await validateApiKey(apiKey.key);

  assertExists(result);
  assertEquals(result.id, apiKey.id);
  assertEquals(result.githubAccountId, undefined);
});

Deno.test("validateApiKey returns null for unknown key", async () => {
  await setupAppTest();

  const result = await validateApiKey("nonexistent_key");
  assertEquals(result, null);
});
