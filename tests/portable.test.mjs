import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("portable four-player server, hidden hands, persistence and a full round", { timeout: 60000 }, async () => {
  const data = await mkdtemp(resolve(tmpdir(), "mahjong-test-"));
  let child;
  async function start() {
    child = spawn(process.execPath, [resolve("release/portable/server.mjs")], {
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0", MAHJONG_DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"],
    });
    return await new Promise((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server did not start")), 10000);
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on("data", (chunk) => {
        const port = String(chunk).match(/localhost:(\d+)/)?.[1];
        if (port) { clearTimeout(timeout); accept(`http://127.0.0.1:${port}`); }
      });
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise((accept) => { child.once("exit", accept); child.kill(); });
  }
  let base = await start();
  async function request(path, body, headers = {}) {
    const response = await fetch(base + path, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /谐不压怔！一日麻！/);
    for (const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((m) => m[1])) {
      assert.equal((await fetch(base + asset)).status, 200);
    }
    assert.equal((await request("/api/rooms", { name: "" })).status, 400);
    assert.equal((await request("/api/rooms", { name: "外部请求" }, { Origin: "https://example.com" })).status, 403);
    assert.equal((await fetch(base + "/%2e%2e%2fserver.mjs")).status, 403);
    assert.equal((await fetch(base + "/server.mjs")).status, 404);

    const created = await request("/api/rooms", { name: "房主" });
    assert.equal(created.status, 201);
    const code = created.data.room.code;
    const path = `/api/rooms/${code}`;
    const tokens = [created.data.token];
    const joined = await Promise.all(["北", "南", "西", "第五人"].map((name) => request(path, { op: "join", name })));
    assert.equal(joined.filter((r) => r.status === 201).length, 3);
    assert.equal(joined.filter((r) => r.status !== 201).length, 1);
    for (const result of joined.filter((r) => r.status === 201)) tokens[result.data.room.viewerSeat] = result.data.token;
    const action = (seat, value) => request(path, { op: "action", token: tokens[seat], action: value });
    assert.equal((await action(1, { type: "start" })).status, 400);
    assert.equal((await request(path, { op: "action", token: "invalid", action: { type: "start" } })).status, 403);
    assert.equal((await action(0, { type: "start" })).status, 200);
    const publicRoom = (await request(path)).data.room;
    assert.equal(publicRoom.viewerSeat, null);
    assert.ok(publicRoom.players.every((p) => !p.hand && !p.token));
    for (let seat = 0; seat < 4; seat++) {
      const view = (await request(`${path}?token=${tokens[seat]}`)).data.room;
      assert.equal(view.players.filter((p) => p.hand).length, 1);
      assert.ok(view.players[seat].hand.length >= 13);
      assert.ok(!JSON.stringify(view).includes(tokens[(seat + 1) % 4]));
    }
    const before = (await request(`${path}?token=${tokens[0]}`)).data;
    await stop();
    base = await start();
    assert.deepEqual((await request(`${path}?token=${tokens[0]}`)).data, before);
    let finished = false;
    for (let step = 0; step < 300; step++) {
      const state = (await request(path)).data.room;
      if (state.status === "round-end" || state.status === "game-end") {
        assert.equal(state.players.reduce((sum, p) => sum + p.score, 0), 100000);
        finished = true;
        break;
      }
      if (state.game.phase === "claim") {
        for (let seat = 0; seat < 4; seat++) {
          const view = (await request(`${path}?token=${tokens[seat]}`)).data.room;
          if (view.availableActions.some((a) => a.type === "claim")) assert.equal((await action(seat, { type: "pass" })).status, 200);
        }
      } else {
        const seat = state.game.current;
        if (state.game.phase === "draw") assert.equal((await action(seat, { type: "draw" })).status, 200);
        else {
          const view = (await request(`${path}?token=${tokens[seat]}`)).data.room;
          const tile = view.players[seat].hand.at(-1);
          assert.equal((await action(seat, { type: "discard", tileId: tile.id })).status, 200);
        }
      }
    }
    assert.ok(finished, "The round must finish without stalling");
    assert.equal((await action(0, { type: "next-round" })).status, 200);
  } finally {
    await stop();
    await rm(data, { recursive: true, force: true });
  }
});
