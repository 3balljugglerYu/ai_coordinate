/**
 * typescript-hooks.mjs を登録する。import するだけで効く。
 *
 *   node --import ./scripts/lib/register-typescript.mjs <file>
 *
 * Node 22.15+ / 23.5+ は同期の registerHooks を使う。CI の Node 20 には無いので
 * register を使う(Node 26 では register が非推奨になり、警告が出る)。
 */
import * as nodeModule from "node:module";

if (typeof nodeModule.registerHooks === "function") {
  const { load, resolve } = await import("./typescript-hooks.mjs");
  nodeModule.registerHooks({ load, resolve });
} else {
  nodeModule.register("./typescript-hooks.mjs", import.meta.url);
}
