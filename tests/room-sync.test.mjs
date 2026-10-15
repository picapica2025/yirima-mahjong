import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(new URL("../lib/room-sync.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { acceptRoomSnapshot, createSeatToken, requestRoom } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

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

function untilAborted(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

for (const phase of ["fetch", "json"]) {
  test(`room request times out while ${phase} is pending`, { timeout: 1000 }, async (t) => {
    let signal;
    t.mock.method(globalThis, "fetch", async (url, init) => {
      signal = init.signal;
      if (phase === "fetch") return untilAborted(signal);
      return { json: () => untilAborted(signal) };
    });
    await assert.rejects(requestRoom("/api/rooms/ABC234", {}, 15));
    assert.equal(signal.aborted, true);
  });
}

test("a parent cancellation interrupts a pending room request", { timeout: 1000 }, async (t) => {
  const parent = new AbortController();
  let requestSignal;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requestSignal = init.signal;
    return untilAborted(requestSignal);
  });
  const pending = requestRoom("/api/rooms/ABC234", { signal: parent.signal }, 500);
  parent.abort();
  await assert.rejects(pending);
  assert.equal(requestSignal.aborted, true);
});

test("an already cancelled parent does not leave a room request pending", { timeout: 1000 }, async (t) => {
  const parent = new AbortController();
  parent.abort();
  t.mock.method(globalThis, "fetch", async (url, init) => untilAborted(init.signal));
  await assert.rejects(requestRoom("/api/rooms/ABC234", { signal: parent.signal }, 500));
});

test("successful room requests preserve options and clean up their timer and parent listener", async (t) => {
  const parent = new AbortController();
  const add = t.mock.method(parent.signal, "addEventListener");
  const remove = t.mock.method(parent.signal, "removeEventListener");
  const timers = t.mock.method(globalThis, "setTimeout");
  const clear = t.mock.method(globalThis, "clearTimeout");
  const data = { room: { code: "ABC234" }, revision: 4 };
  const response = { ok: true, json: async () => data };
  let options;
  t.mock.method(globalThis, "fetch", async (url, init) => { options = init; return response; });
  assert.deepEqual(await requestRoom("/api/rooms/ABC234", {
    method: "POST", body: "{}", signal: parent.signal,
  }), { response, data });
  assert.equal(options.method, "POST");
  assert.equal(options.body, "{}");
  assert.equal(options.signal.aborted, false);
  assert.ok(timers.mock.calls.some((scheduled) => clear.mock.calls.some((cancelled) => cancelled.arguments[0] === scheduled.result)));
  assert.ok(add.mock.calls.some((added) => remove.mock.calls.some((removed) =>
    added.arguments[0] === removed.arguments[0] && added.arguments[1] === removed.arguments[1])));
  parent.abort();
  assert.equal(options.signal.aborted, false, "the completed request must no longer follow its parent");
});

test("seat tokens use secure random bytes without depending on randomUUID", (t) => {
  t.mock.method(globalThis.crypto, "randomUUID", () => { throw new Error("randomUUID unavailable on LAN HTTP"); });
  const first = createSeatToken();
  const second = createSeatToken();
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.match(second, /^[a-f0-9]{32}$/);
  assert.notEqual(first, second);
});
