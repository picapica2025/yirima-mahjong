import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(new URL("../lib/room-sync.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { acceptRoomSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

test("delayed polling cannot roll back a successful move", async () => {
  const cursor = { code: "ABC234", token: "seat-1", revision: 3 };
  let releaseOldPoll;
  const oldPoll = new Promise((resolve) => { releaseOldPoll = resolve; });
  const oldResult = oldPoll.then((revision) => acceptRoomSnapshot(cursor, "ABC234", "seat-1", revision));
  assert.equal(acceptRoomSnapshot(cursor, "ABC234", "seat-1", 5), true);
  releaseOldPoll(4);
  assert.equal(await oldResult, false);
  assert.equal(cursor.revision, 5);
  assert.equal(acceptRoomSnapshot(cursor, "ABC234", "seat-1", 5), true);
});

test("a pre-join spectator request cannot replace the seated player's view", () => {
  const cursor = { code: "ABC234", token: "new-seat", revision: 1 };
  assert.equal(acceptRoomSnapshot(cursor, "ABC234", "", 2), false);
  assert.equal(acceptRoomSnapshot(cursor, "OLD234", "new-seat", 20), false);
  assert.equal(acceptRoomSnapshot(cursor, "ABC234", "new-seat", NaN), false);
  assert.equal(cursor.revision, 1);
});
