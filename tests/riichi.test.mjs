import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/riichi.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { applyAction, createLobby, isWinning, joinLobby, publicView } = await import(
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
  applyAction(state, token(1), { type: "claim", kind: "kan", consumeIds: kan.consumeIds });
  assert.equal(state.players[1].furitenUntilDraw, false);
});

test("a closed-kan replacement draw clears temporary furiten", () => {
  const { state, tiles } = fixture();
  state.players[1].hand = tiles([4, 4, 4, 4, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
  state.players[1].furitenUntilDraw = true;
  state.game.current = 1;
  applyAction(state, token(1), { type: "ankan", tileType: 4 });
  assert.equal(state.players[1].furitenUntilDraw, false);
});
