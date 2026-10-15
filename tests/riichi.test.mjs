import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/riichi.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { applyAction, createLobby, GameError, isWinning, joinLobby, publicView } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const waitingTypes = [2, 3, 5, 6, 7, 11, 12, 13, 23, 24, 25, 10, 10];
const token = (seat) => `player-${seat}`;

function fixture({ riichi = false, discards = [] } = {}) {
  const state = createLobby("TEST", "Player 0", token(0));
  for (let seat = 1; seat < 4; seat += 1) joinLobby(state, `Player ${seat}`, token(seat));
  let id = 0;
  const tiles = (types) => types.map((type) => ({ id: id++, type }));
  state.status = "playing";
  state.players[1].hand = tiles(waitingTypes);
  state.players[1].riichi = riichi;
  state.players[1].discards = discards.map((type) => ({ tile: tiles([type])[0] }));
  state.game = {
    round: 0,
    dealer: 0,
    honba: 0,
    riichiSticks: 0,
    wall: tiles([30, 29, 28]),
    rinshan: tiles([33]),
    doraIndicators: tiles([0]),
    doraReserve: [],
    uraIndicators: [],
    current: 0,
    phase: "discard",
    turn: 0,
    claimOptions: {},
    claimResponses: {},
    message: "",
  };
  function discard(type, from = 0) {
    const tile = tiles([type])[0];
    state.players[from].hand.push(tile);
    state.game.current = from;
    state.game.phase = "discard";
    state.game.lastDrawnId = tile.id;
    applyAction(state, token(from), { type: "discard", tileId: tile.id });
  }
  function draw() {
    state.game.current = 1;
    state.game.phase = "draw";
    applyAction(state, token(1), { type: "draw" });
    applyAction(state, token(1), { type: "discard", tileId: state.game.lastDrawnId });
  }
  const hasRon = () => publicView(state, token(1)).availableActions.some((action) => action.kind === "ron");
  return { state, tiles, discard, draw, hasRon };
}

test("discarding any tile in the full wait prevents ron on the other wait", () => {
  const { state, discard, hasRon } = fixture({ discards: [1] });
  assert.ok(isWinning([...state.players[1].hand, { id: -1, type: 1 }], []));
  assert.ok(isWinning([...state.players[1].hand, { id: -2, type: 4 }], []));
  discard(4);
  assert.equal(hasRon(), false);
});

test("a called tile in one's own discards still causes furiten", () => {
  const { state, discard, hasRon } = fixture({ discards: [1] });
  state.players[1].discards[0].called = true;
  discard(4);
  assert.equal(hasRon(), false);
});

test("a discard outside the wait does not prevent ron", () => {
  const { discard, hasRon } = fixture({ discards: [0] });
  discard(4);
  assert.equal(hasRon(), true);
});

for (const riichi of [false, true]) {
  test(`passing ron ${riichi ? "after riichi lasts for the round" : "expires on the next own draw"}`, () => {
    const { state, discard, draw, hasRon } = fixture({ riichi });
    discard(4);
    assert.equal(hasRon(), true);
    applyAction(state, token(1), { type: "pass" });
    assert.equal(state.players[1].furitenUntilDraw, true);
    discard(4, 2);
    assert.equal(hasRon(), false);
    draw();
    assert.equal(state.players[1].furitenUntilDraw, riichi);
    discard(4);
    assert.equal(hasRon(), !riichi);
  });

  test(`timing out a ron opportunity sets ${riichi ? "riichi" : "temporary"} furiten`, () => {
    const { state, discard, draw, hasRon } = fixture({ riichi });
    discard(4);
    assert.equal(hasRon(), true);
    state.game.claimDeadline = Date.now() - 1;
    applyAction(state, token(0), { type: "tick" });
    assert.equal(state.players[1].furitenUntilDraw, true);
    draw();
    assert.equal(state.players[1].furitenUntilDraw, riichi);
    discard(4);
    assert.equal(hasRon(), !riichi);
  });
}

test("choosing chi instead of an offered ron sets missed-win furiten", () => {
  const { state, discard, hasRon } = fixture();
  discard(4);
  assert.equal(hasRon(), true);
  const chi = publicView(state, token(1)).availableActions.find((action) => action.kind === "chi");
  assert.ok(chi);
  applyAction(state, token(1), { type: "claim", kind: "chi", consumeIds: chi.consumeIds });
  assert.equal(state.players[1].furitenUntilDraw, true);
});

test("responding without a ron opportunity does not set furiten", () => {
  const { state, discard, hasRon } = fixture({ discards: [4] });
  discard(4);
  assert.equal(hasRon(), false);
  applyAction(state, token(1), { type: "pass" });
  assert.equal(state.players[1].furitenUntilDraw, false);
});

test("riichi furiten allows tsumo and resets for the next round", () => {
  const { state, tiles, discard } = fixture({ riichi: true });
  discard(4);
  applyAction(state, token(1), { type: "pass" });
  state.game.current = 1;
  state.game.phase = "draw";
  state.game.wall = tiles([4]);
  applyAction(state, token(1), { type: "draw" });
  assert.equal(state.players[1].furitenUntilDraw, true);
  applyAction(state, token(1), { type: "tsumo" });
  assert.equal(state.game.result.kind, "tsumo");
  applyAction(state, token(0), { type: "next-round" });
  assert.equal(state.players[1].furitenUntilDraw, false);
});

test("an open-kan replacement draw clears temporary furiten", () => {
  const { state, tiles, discard } = fixture();
  state.players[1].hand = tiles([4, 4, 4, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
  state.players[1].furitenUntilDraw = true;
  discard(4);
  const kan = publicView(state, token(1)).availableActions.find((action) => action.kind === "kan");
  assert.ok(kan);
  const wallCount = state.game.wall.length;
  applyAction(state, token(1), { type: "claim", kind: "kan", consumeIds: kan.consumeIds });
  assert.equal(state.players[1].furitenUntilDraw, false);
  assert.equal(state.game.wall.length, wallCount - 1);
});

test("a closed-kan replacement draw clears temporary furiten", () => {
  const { state, tiles } = fixture();
  state.players[1].hand = tiles([4, 4, 4, 4, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
  state.players[1].furitenUntilDraw = true;
  state.game.current = 1;
  state.game.lastDrawnId = state.players[1].hand.at(-1).id;
  const wallCount = state.game.wall.length;
  applyAction(state, token(1), { type: "ankan", tileType: 4 });
  assert.equal(state.players[1].furitenUntilDraw, false);
  assert.equal(state.game.wall.length, wallCount - 1);
});

const unchangedWaitTypes = [31, 31, 31, 1, 2, 3, 10, 11, 12, 19, 20, 21, 27];

function closedKanFixture({ riichi = true, before = unchangedWaitTypes, drawnType = 31 } = {}) {
  const setup = fixture({ riichi });
  const { state, tiles } = setup;
  state.players[1].hand = tiles(before);
  state.game.current = 1;
  state.game.phase = "draw";
  state.game.wall = tiles([drawnType, 30, 29, 28]);
  applyAction(state, token(1), { type: "draw" });
  return setup;
}

function assertKanRejected(state, action) {
  const before = structuredClone(state);
  assert.throws(() => applyAction(state, token(1), action), GameError);
  assert.deepEqual(state, before, "a rejected kan must not consume tiles or change a claim response");
}

function hasAnkan(state, tileType) {
  return publicView(state, token(1)).availableActions.some((action) => action.type === "ankan" && action.tileType === tileType);
}

test("riichi permits drawing the fourth copy and declaring a wait-preserving kan", () => {
  const { state } = closedKanFixture();
  const wallCount = state.game.wall.length;
  assert.equal(hasAnkan(state, 31), true);
  applyAction(state, token(1), { type: "ankan", tileType: 31 });
  assert.equal(state.players[1].melds[0].kind, "kan");
  assert.equal(state.players[1].melds[0].open, false);
  assert.equal(state.game.wall.length, wallCount - 1);
  assert.equal(state.game.wall.some((tile) => tile.type === 28), false);
});

test("riichi rejects a nine-gates kan that changes its wait", () => {
  const { state } = closedKanFixture({ before: [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8], drawnType: 0 });
  assertKanRejected(state, { type: "ankan", tileType: 0 });
  assert.equal(hasAnkan(state, 0), false);
});

test("riichi rejects a kan that preserves waits but removes a three-sequence interpretation", () => {
  const { state } = closedKanFixture({ before: [1, 1, 1, 2, 2, 2, 3, 3, 3, 10, 11, 12, 27], drawnType: 1 });
  assertKanRejected(state, { type: "ankan", tileType: 1 });
  assert.equal(hasAnkan(state, 1), false);
});

test("riichi rejects a kan of four tiles already held before this draw", () => {
  const { state } = closedKanFixture({ before: [0, 0, 0, 0, 1, 2, 10, 11, 12, 19, 20, 21, 27], drawnType: 30 });
  assertKanRejected(state, { type: "ankan", tileType: 0 });
  assert.equal(hasAnkan(state, 0), false);
});

test("a fixed kan's four tiles exclude an impossible fifth-copy wait", () => {
  const { state, tiles } = fixture();
  state.players[1].hand = tiles([0, 1, 10, 11, 12, 19, 20, 21, 27, 27, 30]);
  state.players[1].melds = [{ kind: "kan", tiles: tiles([2, 2, 2, 2]), from: 1, open: false }];
  state.game.current = 1;
  state.game.lastDrawnId = state.players[1].hand.at(-1).id;
  assert.equal(publicView(state, token(1)).availableActions.some((action) => action.type === "riichi"), false);
});

for (const kind of ["chi", "pon"]) {
  test(`a closed kan is unavailable immediately after ${kind} without drawing`, () => {
    const { state, tiles, discard } = fixture();
    state.players[1].hand = tiles([31, 31, 31, 31, ...(kind === "chi" ? [2, 3] : [4, 4]), 0, 8, 9, 17, 18, 26, 27]);
    discard(4);
    const option = publicView(state, token(1)).availableActions.find((action) => action.kind === kind);
    assert.ok(option);
    applyAction(state, token(1), { type: "claim", kind, consumeIds: option.consumeIds });
    assert.equal(state.game.lastDrawnId, undefined);
    assertKanRejected(state, { type: "ankan", tileType: 31 });
    assert.equal(hasAnkan(state, 31), false);
  });
}

const kanLimits = {
  "no live-wall tiles": ({ state }) => { state.game.wall = []; },
  "no replacement tiles": ({ state }) => { state.game.rinshan = []; },
  "four kans already declared": ({ state, tiles }) => {
    state.players[2].melds = [0, 9, 18, 27].map((type) => ({ kind: "kan", tiles: tiles([type, type, type, type]), from: 2, open: false }));
  },
};

for (const [label, exhaust] of Object.entries(kanLimits)) {
  test(`closed kan rejects ${label} before changing state`, () => {
    const setup = closedKanFixture({ riichi: false });
    exhaust(setup);
    assertKanRejected(setup.state, { type: "ankan", tileType: 31 });
    assert.equal(hasAnkan(setup.state, 31), false);
  });

  test(`open kan is not offered with ${label}, while pon remains possible`, () => {
    const setup = fixture();
    const { state, tiles, discard } = setup;
    state.players[1].hand = tiles([4, 4, 4, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
    exhaust(setup);
    discard(4);
    const options = publicView(state, token(1)).availableActions;
    assert.equal(options.some((action) => action.kind === "kan"), false);
    assert.equal(options.some((action) => action.kind === "pon"), true);
    assertKanRejected(state, { type: "claim", kind: "kan" });
  });
}

test("an open-kan option is revalidated before recording a stale claim", () => {
  const { state, tiles, discard } = fixture();
  state.players[1].hand = tiles([4, 4, 4, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
  discard(4);
  const kan = publicView(state, token(1)).availableActions.find((action) => action.kind === "kan");
  assert.ok(kan);
  state.game.wall = [];
  assertKanRejected(state, { type: "claim", kind: "kan", consumeIds: kan.consumeIds });
});

test("the fourth kan is allowed with one remaining replacement and live-wall tile", () => {
  const { state, tiles } = closedKanFixture({ riichi: false });
  state.players[2].melds = [0, 9, 18].map((type) => ({ kind: "kan", tiles: tiles([type, type, type, type]), from: 2, open: false }));
  state.game.wall = tiles([30]);
  assert.equal(state.game.rinshan.length, 1);
  assert.equal(hasAnkan(state, 31), true);
  applyAction(state, token(1), { type: "ankan", tileType: 31 });
  assert.equal(state.game.wall.length, 0);
  assert.equal(state.game.rinshan.length, 0);
  assert.equal(state.players.flatMap((player) => player.melds).filter((meld) => meld.kind === "kan").length, 4);
});

test("retrying a join with the same token preserves its original seat and name", () => {
  const state = createLobby("TEST", "Host", token(0));
  const before = structuredClone(state);
  assert.equal(joinLobby(state, "Changed name", token(0)), state);
  assert.deepEqual(state, before);
});

for (const status of ["lobby", "playing", "round-end", "game-end"]) {
  test(`an existing token can retry a join in a full ${status} room`, () => {
    const { state } = fixture();
    state.status = status;
    const before = structuredClone(state);
    assert.equal(joinLobby(state, "Changed name", token(2)), state);
    assert.deepEqual(state, before);
  });
}

test("distinct tokens sharing a nickname occupy distinct seats", () => {
  const state = createLobby("TEST", "Same name", token(0));
  joinLobby(state, "Same name", token(1));
  assert.equal(state.players.length, 2);
  assert.equal(state.players[1].token, token(1));
});
