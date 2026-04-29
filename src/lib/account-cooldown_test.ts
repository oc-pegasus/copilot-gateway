import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { markCooldown, isCoolingDown, clearCooldown } from "./account-cooldown.ts";

Deno.test("markCooldown puts account into cooldown", () => {
  clearCooldown(1001);
  markCooldown(1001, 60_000);
  assertEquals(isCoolingDown(1001), true);
  clearCooldown(1001);
});

Deno.test("isCoolingDown returns false for unknown account", () => {
  assertEquals(isCoolingDown(9999), false);
});

Deno.test("isCoolingDown returns false after cooldown expires", () => {
  clearCooldown(1002);
  // Set cooldown that already expired
  markCooldown(1002, -1);
  assertEquals(isCoolingDown(1002), false);
});

Deno.test("clearCooldown removes cooldown", () => {
  markCooldown(1003, 60_000);
  assertEquals(isCoolingDown(1003), true);
  clearCooldown(1003);
  assertEquals(isCoolingDown(1003), false);
});

Deno.test("all accounts cooling down still returns false after clear", () => {
  markCooldown(2001, 60_000);
  markCooldown(2002, 60_000);
  assertEquals(isCoolingDown(2001), true);
  assertEquals(isCoolingDown(2002), true);
  clearCooldown(2001);
  clearCooldown(2002);
  assertEquals(isCoolingDown(2001), false);
  assertEquals(isCoolingDown(2002), false);
});
