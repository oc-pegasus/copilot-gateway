export function getEnv(name: string): string {
  // deno-lint-ignore no-explicit-any
  return (Deno as any).env.get(name) ?? "";
}
