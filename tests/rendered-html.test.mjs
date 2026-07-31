import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the public riichi landing experience", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /谐不压怔！一日麻！/);
  assert.match(page, /杨振山快来，就等你来玩了！/);
  assert.match(page, /免登录/);
  assert.match(page, /建立四人房/);
  assert.match(page, /原房再开一场/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps room state server-backed and private by construction", async () => {
  const [page, roomApi, engine, hosting, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/riichi.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_careful_tony_stark.sql", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /CREATE TABLE `mahjong_rooms`/);
  assert.match(roomApi, /publicView/);
  assert.match(engine, /player\.seat === viewer\?\.seat \? sortTiles\(player\.hand\) : undefined/);
  assert.match(page, /localStorage\.setItem\(`yique-riichi:/);
  assert.doesNotMatch(page, /password|email|sign.?in/i);
});
