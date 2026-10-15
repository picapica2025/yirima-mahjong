import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["createRoom", "joinRoom", "sendAction"]);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(functions.length, names.size, "exercise the real Home request handlers");
const handlers = ts.transpileModule(functions.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const helpers = ts.transpileModule(await readFile(new URL("../lib/room-sync.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { acceptRoomSnapshot, createSeatToken } = await import(`data:text/javascript;base64,${Buffer.from(helpers).toString("base64")}`);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function harness(request, { seated = false } = {}) {
  const state = { busy: false, error: "", token: seated ? "seat-1" : "", room: null };
  const storage = new Map();
  const calls = [];
  const cursor = { current: { code: "ABC234", token: state.token, revision: 0 } };
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const requestRoom = (url, init) => {
    calls.push({ url, init });
    return request({ url, init, state, storage, cursor, index: calls.length });
  };
  // React state stays unchanged inside the current render; the ref must stop re-entry immediately.
  const run = new Function("requestRoom", "localStorage", "cursor", "acceptRoomSnapshot", "createSeatToken", "state", `
    const name = "Friend", roomCode = "ABC234", token = state.token, busy = false;
    const busyRequest = { current: false };
    const setBusy = value => state.busy = value;
    const setError = value => state.error = value;
    const setConnectionIssue = value => state.connectionIssue = value;
    const setToken = value => state.token = value;
    const setRoom = value => state.room = value;
    const setRoomCode = value => state.roomCode = value;
    const setSelectedId = value => state.selectedId = value;
    const window = { location: { pathname: "/" }, history: { replaceState() {} } };
    ${handlers}
    return { createRoom, joinRoom, sendAction, busyRequest };
  `);
  return { ...run(requestRoom, localStorage, cursor, acceptRoomSnapshot, createSeatToken, state), state, calls, storage, cursor };
}

function success(token = "seat-1", revision = 1) {
  return { response: { ok: true }, data: { token, revision, room: { code: "ABC234", viewerSeat: 1 } } };
}

for (const handler of ["createRoom", "joinRoom", "sendAction"]) {
  test(`rapid repeated ${handler} calls send only one request`, async () => {
    const pending = deferred();
    const client = harness(() => pending.promise, { seated: handler === "sendAction" });
    const first = client[handler]({ type: "draw" });
    await client[handler]({ type: "draw" });
    assert.equal(client.calls.length, 1);
    assert.equal(client.state.busy, true);
    const sentToken = JSON.parse(client.calls[0].init.body).token;
    pending.resolve(success(sentToken ?? "host-seat"));
    await first;
    assert.equal(client.state.busy, false);
    assert.equal(client.busyRequest.current, false);
  });
}

test("failed admission keeps the pre-saved seat token for an explicit retry", async () => {
  const client = harness(({ init, storage, index }) => {
    const token = JSON.parse(init.body).token;
    assert.match(token, /^[a-f0-9]{32}$/);
    assert.equal(storage.get("yique-riichi:ABC234"), token, "save the identity before sending admission");
    if (index === 1) throw new DOMException("Request timed out", "TimeoutError");
    return Promise.resolve(success(token));
  });
  await client.joinRoom();
  assert.equal(client.calls.length, 1, "a timeout must not trigger an automatic mutation retry");
  assert.equal(client.state.busy, false);
  assert.ok(client.state.error);
  await client.joinRoom();
  assert.equal(client.calls.length, 2);
  assert.equal(JSON.parse(client.calls[0].init.body).token, JSON.parse(client.calls[1].init.body).token);
  assert.equal(client.state.room.viewerSeat, 1);
});

test("a delayed admission response cannot overwrite a newer poll for that saved seat", async () => {
  const pending = deferred();
  const client = harness(() => pending.promise);
  const admission = client.joinRoom();
  const token = JSON.parse(client.calls[0].init.body).token;
  const newest = { code: "ABC234", viewerSeat: 1, marker: "newer poll" };
  client.cursor.current = { code: "ABC234", token, revision: 9 };
  client.state.room = newest;
  pending.resolve(success(token, 4));
  await admission;
  assert.equal(client.cursor.current.revision, 9);
  assert.equal(client.state.room, newest);
});

test("a timed-out action releases the lock and allows an explicit next action without replaying", async () => {
  const pending = deferred();
  const client = harness(({ index }) => index === 1 ? pending.promise : Promise.resolve(success()), { seated: true });
  const action = client.sendAction({ type: "draw" });
  pending.reject(new DOMException("Request timed out", "TimeoutError"));
  await action;
  assert.equal(client.calls.length, 1);
  assert.equal(client.state.busy, false);
  assert.equal(client.busyRequest.current, false);
  assert.ok(client.state.error);
  await client.sendAction({ type: "discard", tileId: 42 });
  assert.equal(client.calls.length, 2);
  assert.equal(JSON.parse(client.calls[1].init.body).action.type, "discard");
});
