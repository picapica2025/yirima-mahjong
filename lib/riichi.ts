export type Tile = { id: number; type: number; red?: boolean };
export type Meld = {
  kind: "chi" | "pon" | "kan";
  tiles: Tile[];
  from: number;
  open: boolean;
};
export type Discard = { tile: Tile; riichi?: boolean; called?: boolean };
export type Player = {
  seat: number;
  name: string;
  token: string;
  score: number;
  hand: Tile[];
  melds: Meld[];
  discards: Discard[];
  riichi: boolean;
  ippatsu: boolean;
  riichiTurn?: number;
  furitenUntilDraw: boolean;
};
export type ClaimOption = {
  kind: "ron" | "chi" | "pon" | "kan";
  label: string;
  consumeIds: number[];
};
export type ResultWinner = {
  seat: number;
  han: number;
  fu: number;
  points: number;
  yaku: string[];
};
export type RoundResult = {
  kind: "ron" | "tsumo" | "draw";
  title: string;
  message: string;
  winners: ResultWinner[];
  tenpaiSeats?: number[];
  dealerContinues: boolean;
};
export type Game = {
  round: number;
  dealer: number;
  honba: number;
  riichiSticks: number;
  wall: Tile[];
  rinshan: Tile[];
  doraIndicators: Tile[];
  doraReserve: Tile[];
  uraIndicators: Tile[];
  current: number;
  phase: "draw" | "discard" | "claim" | "round-end" | "game-end";
  turn: number;
  lastDrawnId?: number;
  lastDiscard?: { tile: Tile; from: number };
  claimOptions: Record<string, ClaimOption[]>;
  claimResponses: Record<string, ClaimOption | null>;
  claimDeadline?: number;
  message: string;
  result?: RoundResult;
};
export type RoomState = {
  code: string;
  status: "lobby" | "playing" | "round-end" | "game-end";
  hostSeat: number;
  players: Player[];
  game?: Game;
  createdAt: number;
};
export type ClientAction =
  | { type: "start" }
  | { type: "draw" }
  | { type: "discard"; tileId: number; riichi?: boolean }
  | { type: "claim"; kind: ClaimOption["kind"]; consumeIds?: number[] }
  | { type: "pass" }
  | { type: "tsumo" }
  | { type: "ankan"; tileType: number }
  | { type: "next-round" }
  | { type: "rematch" }
  | { type: "tick" };

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const WINDS = ["東", "南", "西", "北"];

function randomInt(max: number) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

function makeDeck() {
  const deck: Tile[] = [];
  let id = 0;
  for (let type = 0; type < 34; type += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push({
        id: id++,
        type,
        red: copy === 0 && (type === 4 || type === 13 || type === 22),
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function sortTiles(tiles: Tile[]) {
  return [...tiles].sort((a, b) => a.type - b.type || Number(b.red) - Number(a.red) || a.id - b.id);
}

function countsFor(tiles: Tile[]) {
  const counts = Array.from({ length: 34 }, () => 0);
  tiles.forEach((tile) => {
    counts[tile.type] += 1;
  });
  return counts;
}

type ClosedGroup = { kind: "sequence" | "triplet"; type: number };

function findGroups(counts: number[], groupsLeft: number): ClosedGroup[] | null {
  if (groupsLeft === 0) return counts.every((count) => count === 0) ? [] : null;
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return null;
  if (counts[first] >= 3) {
    counts[first] -= 3;
    const rest = findGroups(counts, groupsLeft - 1);
    counts[first] += 3;
    if (rest) return [{ kind: "triplet", type: first }, ...rest];
  }
  if (first < 27 && first % 9 <= 6 && counts[first + 1] && counts[first + 2]) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    const rest = findGroups(counts, groupsLeft - 1);
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
    if (rest) return [{ kind: "sequence", type: first }, ...rest];
  }
  return null;
}

function standardShape(tiles: Tile[], openMelds: number) {
  const groupsNeeded = 4 - openMelds;
  if (tiles.length !== groupsNeeded * 3 + 2) return null;
  const counts = countsFor(tiles);
  for (let pair = 0; pair < 34; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const groups = findGroups(counts, groupsNeeded);
    counts[pair] += 2;
    if (groups) return { pair, groups };
  }
  return null;
}

function isChiitoitsu(tiles: Tile[], openMelds: number) {
  if (openMelds || tiles.length !== 14) return false;
  const counts = countsFor(tiles);
  return counts.filter((count) => count === 2).length === 7;
}

function isKokushi(tiles: Tile[], openMelds: number) {
  if (openMelds || tiles.length !== 14) return false;
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const counts = countsFor(tiles);
  return terminals.every((type) => counts[type] > 0) && terminals.some((type) => counts[type] > 1);
}

export function isWinning(tiles: Tile[], melds: Meld[]) {
  return Boolean(standardShape(tiles, melds.length)) || isChiitoitsu(tiles, melds.length) || isKokushi(tiles, melds.length);
}

function isTenpai(tiles: Tile[], melds: Meld[]) {
  const counts = countsFor(tiles);
  for (let type = 0; type < 34; type += 1) {
    if (counts[type] >= 4) continue;
    if (isWinning([...tiles, { id: -1000 - type, type }], melds)) return true;
  }
  return false;
}

function isTerminalOrHonor(type: number) {
  return type >= 27 || type % 9 === 0 || type % 9 === 8;
}

function doraType(indicator: number) {
  if (indicator < 27) {
    const base = Math.floor(indicator / 9) * 9;
    return base + ((indicator % 9 + 1) % 9);
  }
  if (indicator <= 30) return 27 + ((indicator - 27 + 1) % 4);
  return 31 + ((indicator - 31 + 1) % 3);
}

function allTiles(player: Player, concealed: Tile[]) {
  return [...concealed, ...player.melds.flatMap((meld) => meld.tiles)];
}

function scoreHand(
  player: Player,
  concealed: Tile[],
  game: Game,
  options: { tsumo: boolean },
) {
  const yaku: string[] = [];
  const menzen = player.melds.every((meld) => !meld.open);
  const all = allTiles(player, concealed);
  let baseHan = 0;
  let yakuman = false;

  if (isKokushi(concealed, player.melds.length)) {
    yaku.push("國士無雙");
    baseHan = 13;
    yakuman = true;
  } else if (isChiitoitsu(concealed, player.melds.length)) {
    yaku.push("七對子");
    baseHan += 2;
  }
  if (player.riichi) {
    yaku.push("立直");
    baseHan += 1;
  }
  if (player.ippatsu && player.riichi) {
    yaku.push("一發");
    baseHan += 1;
  }
  if (options.tsumo && menzen) {
    yaku.push("門前清自摸和");
    baseHan += 1;
  }
  if (all.every((tile) => !isTerminalOrHonor(tile.type))) {
    yaku.push("斷么九");
    baseHan += 1;
  }

  const shape = standardShape(concealed, player.melds.length);
  const closedGroups = shape?.groups ?? [];
  const tripletTypes = [
    ...closedGroups.filter((group) => group.kind === "triplet").map((group) => group.type),
    ...player.melds.filter((meld) => meld.kind !== "chi").map((meld) => meld.tiles[0].type),
  ];
  const seatWind = 27 + ((player.seat - game.dealer + 4) % 4);
  const valueTypes = [27, seatWind, 31, 32, 33];
  tripletTypes.forEach((type) => {
    if (type === 27) {
      yaku.push("場風 東");
      baseHan += 1;
    }
    if (type === seatWind) {
      yaku.push(`自風 ${WINDS[type - 27]}`);
      baseHan += 1;
    }
    if (type >= 31) {
      yaku.push(`役牌 ${["白", "發", "中"][type - 31]}`);
      baseHan += 1;
    }
  });

  const allTriplets = Boolean(shape) && closedGroups.every((group) => group.kind === "triplet") && player.melds.every((meld) => meld.kind !== "chi");
  if (allTriplets) {
    yaku.push("對對和");
    baseHan += 2;
  }

  if (menzen && closedGroups.length > 0) {
    const sequenceStarts = closedGroups.filter((group) => group.kind === "sequence").map((group) => group.type);
    if (sequenceStarts.some((type, index) => sequenceStarts.indexOf(type) !== index)) {
      yaku.push("一盃口");
      baseHan += 1;
    }
  }

  const suits = new Set(all.filter((tile) => tile.type < 27).map((tile) => Math.floor(tile.type / 9)));
  const hasHonors = all.some((tile) => tile.type >= 27);
  if (suits.size === 1 && all.some((tile) => tile.type < 27)) {
    if (hasHonors) {
      yaku.push("混一色");
      baseHan += menzen ? 3 : 2;
    } else {
      yaku.push("清一色");
      baseHan += menzen ? 6 : 5;
    }
  }

  if (baseHan === 0) return null;
  let dora = 0;
  const doraTypes = game.doraIndicators.map((tile) => doraType(tile.type));
  all.forEach((tile) => {
    dora += doraTypes.filter((type) => type === tile.type).length;
    if (tile.red) dora += 1;
  });
  if (player.riichi) {
    const uraTypes = game.uraIndicators.slice(0, game.doraIndicators.length).map((tile) => doraType(tile.type));
    all.forEach((tile) => {
      dora += uraTypes.filter((type) => type === tile.type).length;
    });
  }
  if (dora) yaku.push(`寶牌 ${dora}`);
  const han = yakuman ? 13 : baseHan + dora;

  let fu = isChiitoitsu(concealed, player.melds.length) ? 25 : 20;
  if (fu !== 25) {
    if (!options.tsumo && menzen) fu += 10;
    if (options.tsumo) fu += 2;
    if (shape && valueTypes.includes(shape.pair)) fu += 2;
    closedGroups.filter((group) => group.kind === "triplet").forEach((group) => {
      fu += isTerminalOrHonor(group.type) ? 8 : 4;
    });
    player.melds.filter((meld) => meld.kind !== "chi").forEach((meld) => {
      const terminal = isTerminalOrHonor(meld.tiles[0].type);
      const multiplier = meld.kind === "kan" ? 4 : 1;
      fu += (terminal ? 4 : 2) * multiplier * (meld.open ? 1 : 2);
    });
    fu = Math.max(30, Math.ceil(fu / 10) * 10);
  }

  let basic: number;
  if (han >= 13) basic = 8000;
  else if (han >= 11) basic = 6000;
  else if (han >= 8) basic = 4000;
  else if (han >= 6) basic = 3000;
  else if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) basic = 2000;
  else basic = Math.min(2000, fu * 2 ** (han + 2));
  return { han, fu, basic, yaku };
}

function ceil100(value: number) {
  return Math.ceil(value / 100) * 100;
}

function chiOptions(hand: Tile[], tile: Tile) {
  if (tile.type >= 27) return [] as ClaimOption[];
  const rank = tile.type % 9;
  const base = Math.floor(tile.type / 9) * 9;
  const patterns = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  return patterns.flatMap((pattern) => {
    if (pattern[0] < 0 || pattern[1] > 8) return [];
    const first = hand.find((candidate) => candidate.type === base + pattern[0]);
    const second = hand.find((candidate) => candidate.type === base + pattern[1] && candidate.id !== first?.id);
    if (!first || !second) return [];
    return [{ kind: "chi" as const, label: `吃 ${pattern.map((value) => value + 1).concat(rank + 1).sort().join("·")}`, consumeIds: [first.id, second.id] }];
  });
}

function claimOptionsFor(state: RoomState, from: number, tile: Tile) {
  const game = state.game as Game;
  const options: Record<string, ClaimOption[]> = {};
  state.players.forEach((player) => {
    if (player.seat === from) return;
    const playerOptions: ClaimOption[] = [];
    const ownDiscardFuriten = player.discards.some((discard) => isWinning([...player.hand, discard.tile], player.melds));
    const winningTiles = [...player.hand, tile];
    if (
      !player.furitenUntilDraw &&
      !ownDiscardFuriten &&
      isWinning(winningTiles, player.melds) &&
      scoreHand(player, winningTiles, game, { tsumo: false })
    ) {
      playerOptions.push({ kind: "ron", label: "榮和", consumeIds: [] });
    }
    if (!player.riichi) {
      const matches = player.hand.filter((candidate) => candidate.type === tile.type);
      if (matches.length >= 3) playerOptions.push({ kind: "kan", label: "大明槓", consumeIds: matches.slice(0, 3).map((match) => match.id) });
      if (matches.length >= 2) playerOptions.push({ kind: "pon", label: "碰", consumeIds: matches.slice(0, 2).map((match) => match.id) });
      if ((from + 1) % 4 === player.seat) playerOptions.push(...chiOptions(player.hand, tile));
    }
    if (playerOptions.length) options[String(player.seat)] = playerOptions;
  });
  return options;
}

function startRound(state: RoomState, round: number, dealer: number, honba: number, riichiSticks: number) {
  const deck = makeDeck();
  const deadWall = deck.splice(-14);
  state.players.forEach((player) => {
    player.hand = [];
    player.melds = [];
    player.discards = [];
    player.riichi = false;
    player.ippatsu = false;
    player.riichiTurn = undefined;
    player.furitenUntilDraw = false;
  });
  for (let i = 0; i < 13; i += 1) {
    state.players.forEach((player) => player.hand.push(deck.shift() as Tile));
  }
  const dealerDraw = deck.shift() as Tile;
  state.players[dealer].hand.push(dealerDraw);
  state.players.forEach((player) => {
    player.hand = sortTiles(player.hand);
  });
  state.status = "playing";
  state.game = {
    round,
    dealer,
    honba,
    riichiSticks,
    wall: deck,
    rinshan: deadWall.slice(10),
    doraIndicators: [deadWall[0]],
    doraReserve: [deadWall[2], deadWall[4], deadWall[6], deadWall[8]],
    uraIndicators: [deadWall[1], deadWall[3], deadWall[5], deadWall[7], deadWall[9]],
    current: dealer,
    phase: "discard",
    turn: 0,
    lastDrawnId: dealerDraw.id,
    claimOptions: {},
    claimResponses: {},
    message: `東${round + 1}局，${state.players[dealer].name}是莊家`,
  };
  return state;
}

export function createLobby(code: string, hostName: string, token: string): RoomState {
  return {
    code,
    status: "lobby",
    hostSeat: 0,
    players: [{
      seat: 0,
      name: hostName,
      token,
      score: 25000,
      hand: [],
      melds: [],
      discards: [],
      riichi: false,
      ippatsu: false,
      furitenUntilDraw: false,
    }],
    createdAt: Date.now(),
  };
}

export function joinLobby(state: RoomState, name: string, token: string) {
  if (state.status !== "lobby") throw new GameError("牌局已經開始，不能再加入", 409);
  if (state.players.length >= 4) throw new GameError("房間已滿", 409);
  state.players.push({
    seat: state.players.length,
    name,
    token,
    score: 25000,
    hand: [],
    melds: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    furitenUntilDraw: false,
  });
  return state;
}

function nextSeatAfterDiscard(state: RoomState, from: number) {
  const game = state.game as Game;
  game.current = (from + 1) % 4;
  game.phase = "draw";
  game.claimOptions = {};
  game.claimResponses = {};
  game.claimDeadline = undefined;
  game.lastDrawnId = undefined;
  game.message = `輪到 ${state.players[game.current].name} 摸牌`;
}

function revealKanDora(game: Game) {
  const next = game.doraReserve.shift();
  if (next) game.doraIndicators.push(next);
}

function finishDraw(state: RoomState) {
  const game = state.game as Game;
  const tenpaiSeats = state.players.filter((player) => isTenpai(player.hand, player.melds)).map((player) => player.seat);
  if (tenpaiSeats.length > 0 && tenpaiSeats.length < 4) {
    const gain = 3000 / tenpaiSeats.length;
    const loss = 3000 / (4 - tenpaiSeats.length);
    state.players.forEach((player) => {
      player.score += tenpaiSeats.includes(player.seat) ? gain : -loss;
    });
  }
  const dealerContinues = tenpaiSeats.includes(game.dealer);
  game.phase = "round-end";
  game.result = {
    kind: "draw",
    title: "荒牌流局",
    message: tenpaiSeats.length ? `聽牌：${tenpaiSeats.map((seat) => state.players[seat].name).join("、")}` : "四家皆未聽牌",
    winners: [],
    tenpaiSeats,
    dealerContinues,
  };
  game.message = game.result.message;
  state.status = "round-end";
}

function finishRon(state: RoomState, winnerSeats: number[], discarder: number) {
  const game = state.game as Game;
  const tile = game.lastDiscard?.tile as Tile;
  const winners: ResultWinner[] = [];
  winnerSeats.forEach((seat) => {
    const player = state.players[seat];
    const score = scoreHand(player, [...player.hand, tile], game, { tsumo: false });
    if (!score) throw new GameError("這副牌沒有役，不能榮和");
    const points = ceil100(score.basic * (seat === game.dealer ? 6 : 4));
    const payment = points + game.honba * 300;
    player.score += payment;
    state.players[discarder].score -= payment;
    winners.push({ seat, han: score.han, fu: score.fu, points: payment, yaku: score.yaku });
  });
  if (game.riichiSticks) {
    state.players[winnerSeats[0]].score += game.riichiSticks * 1000;
    game.riichiSticks = 0;
  }
  const dealerContinues = winnerSeats.includes(game.dealer);
  game.phase = "round-end";
  game.result = {
    kind: "ron",
    title: winnerSeats.length > 1 ? "多人榮和" : "榮和",
    message: `${winnerSeats.map((seat) => state.players[seat].name).join("、")} 和了 ${state.players[discarder].name} 的牌`,
    winners,
    dealerContinues,
  };
  game.message = game.result.message;
  state.status = "round-end";
}

function finishTsumo(state: RoomState, seat: number) {
  const game = state.game as Game;
  const winner = state.players[seat];
  const score = scoreHand(winner, winner.hand, game, { tsumo: true });
  if (!score) throw new GameError("這副牌沒有役，不能自摸");
  let total = 0;
  state.players.forEach((player) => {
    if (player.seat === seat) return;
    const multiplier = seat === game.dealer || player.seat === game.dealer ? 2 : 1;
    const payment = ceil100(score.basic * multiplier) + game.honba * 100;
    player.score -= payment;
    total += payment;
  });
  winner.score += total + game.riichiSticks * 1000;
  game.riichiSticks = 0;
  game.phase = "round-end";
  game.result = {
    kind: "tsumo",
    title: "自摸",
    message: `${winner.name} 自摸，${score.han}番 ${score.fu}符`,
    winners: [{ seat, han: score.han, fu: score.fu, points: total, yaku: score.yaku }],
    dealerContinues: seat === game.dealer,
  };
  game.message = game.result.message;
  state.status = "round-end";
}

function resolveClaims(state: RoomState) {
  const game = state.game as Game;
  const last = game.lastDiscard as { tile: Tile; from: number };
  const ronSeats = Object.entries(game.claimResponses)
    .filter(([, response]) => response?.kind === "ron")
    .map(([seat]) => Number(seat));
  if (ronSeats.length) {
    finishRon(state, ronSeats, last.from);
    return;
  }
  const orderedSeats = [1, 2, 3].map((offset) => (last.from + offset) % 4);
  let chosenSeat: number | undefined;
  let chosen: ClaimOption | undefined;
  for (const kind of ["kan", "pon", "chi"] as const) {
    for (const seat of orderedSeats) {
      const response = game.claimResponses[String(seat)];
      if (response?.kind === kind) {
        chosenSeat = seat;
        chosen = response;
        break;
      }
    }
    if (chosen) break;
  }
  if (chosenSeat === undefined || !chosen) {
    nextSeatAfterDiscard(state, last.from);
    return;
  }
  const player = state.players[chosenSeat];
  const consumed = player.hand.filter((tile) => chosen?.consumeIds.includes(tile.id));
  player.hand = sortTiles(player.hand.filter((tile) => !chosen?.consumeIds.includes(tile.id)));
  player.melds.push({ kind: chosen.kind as "chi" | "pon" | "kan", tiles: sortTiles([...consumed, last.tile]), from: last.from, open: true });
  const claimedDiscard = state.players[last.from].discards.at(-1);
  if (claimedDiscard) claimedDiscard.called = true;
  state.players.forEach((candidate) => {
    candidate.ippatsu = false;
  });
  game.current = chosenSeat;
  game.claimOptions = {};
  game.claimResponses = {};
  game.claimDeadline = undefined;
  game.lastDrawnId = undefined;
  if (chosen.kind === "kan") {
    const replacement = game.rinshan.pop();
    if (!replacement) throw new GameError("嶺上牌已用完");
    player.hand = sortTiles([...player.hand, replacement]);
    if (!player.riichi) player.furitenUntilDraw = false;
    game.lastDrawnId = replacement.id;
    revealKanDora(game);
    game.phase = "discard";
    game.message = `${player.name} 大明槓，已補摸嶺上牌`;
  } else {
    game.phase = "discard";
    game.message = `${player.name} ${chosen.kind === "chi" ? "吃" : "碰"}牌，請打出一張`;
  }
}

function allClaimsAnswered(game: Game) {
  return Object.keys(game.claimOptions).every((seat) => Object.prototype.hasOwnProperty.call(game.claimResponses, seat));
}

function recordClaimResponse(state: RoomState, seat: number, response: ClaimOption | null) {
  const game = state.game as Game;
  if (response?.kind !== "ron" && game.claimOptions[String(seat)].some((option) => option.kind === "ron")) {
    state.players[seat].furitenUntilDraw = true;
  }
  game.claimResponses[String(seat)] = response;
}

function availableForSeat(state: RoomState, seat: number) {
  const game = state.game;
  if (!game) return [] as Array<Record<string, unknown>>;
  if (game.phase === "claim") {
    if (Object.prototype.hasOwnProperty.call(game.claimResponses, String(seat))) return [];
    return (game.claimOptions[String(seat)] ?? []).map((option) => ({ ...option, type: "claim" }));
  }
  if (game.current !== seat) return [];
  const player = state.players[seat];
  if (game.phase === "draw") return [{ type: "draw", label: "摸牌" }];
  if (game.phase !== "discard") return [];
  const actions: Array<Record<string, unknown>> = [{ type: "discard", label: "打出" }];
  if (isWinning(player.hand, player.melds) && scoreHand(player, player.hand, game, { tsumo: true })) actions.push({ type: "tsumo", label: "自摸" });
  if (!player.riichi && player.melds.every((meld) => !meld.open) && player.score >= 1000) {
    const riichiTileIds = player.hand.filter((tile) => isTenpai(player.hand.filter((candidate) => candidate.id !== tile.id), player.melds)).map((tile) => tile.id);
    if (riichiTileIds.length) actions.push({ type: "riichi", label: "立直", tileIds: riichiTileIds });
  }
  const counts = countsFor(player.hand);
  counts.forEach((count, tileType) => {
    if (count === 4 && (!player.riichi || player.hand.filter((tile) => tile.type === tileType).some((tile) => tile.id === game.lastDrawnId))) actions.push({ type: "ankan", label: "暗槓", tileType });
  });
  return actions;
}

export function applyAction(state: RoomState, token: string, action: ClientAction) {
  const player = state.players.find((candidate) => candidate.token === token);
  if (!player) throw new GameError("找不到你的座位，請重新加入房間", 403);
  if (action.type === "start") {
    if (state.status !== "lobby") throw new GameError("牌局已經開始");
    if (player.seat !== state.hostSeat) throw new GameError("只有房主可以開始");
    if (state.players.length !== 4) throw new GameError("需要四位玩家到齊");
    return startRound(state, 0, 0, 0, 0);
  }
  const game = state.game;
  if (!game) throw new GameError("牌局尚未開始");
  if (action.type === "tick") {
    if (game.phase === "claim" && game.claimDeadline && Date.now() >= game.claimDeadline) {
      Object.keys(game.claimOptions).forEach((seat) => {
        if (!Object.prototype.hasOwnProperty.call(game.claimResponses, seat)) recordClaimResponse(state, Number(seat), null);
      });
      resolveClaims(state);
    }
    return state;
  }
  if (action.type === "next-round") {
    if (game.phase !== "round-end") throw new GameError("本局尚未結束");
    if (player.seat !== state.hostSeat) throw new GameError("只有房主可以開始下一局");
    const dealerContinues = Boolean(game.result?.dealerContinues);
    const nextRound = dealerContinues ? game.round : game.round + 1;
    const nextDealer = dealerContinues ? game.dealer : (game.dealer + 1) % 4;
    const nextHonba = dealerContinues ? game.honba + 1 : 0;
    if (nextRound >= 4) {
      game.phase = "game-end";
      game.message = "東風戰結束";
      state.status = "game-end";
      return state;
    }
    return startRound(state, nextRound, nextDealer, nextHonba, game.riichiSticks);
  }
  if (action.type === "rematch") {
    if (state.status !== "game-end" || game.phase !== "game-end") throw new GameError("东风战尚未结束");
    if (player.seat !== state.hostSeat) throw new GameError("只有房主可以原房再开一场");
    state.players.forEach((candidate) => {
      candidate.score = 25000;
    });
    return startRound(state, 0, 0, 0, 0);
  }
  if (game.phase === "claim") {
    const options = game.claimOptions[String(player.seat)] ?? [];
    if (!options.length) throw new GameError("你目前沒有可鳴的牌");
    if (Object.prototype.hasOwnProperty.call(game.claimResponses, String(player.seat))) throw new GameError("你已經回應過了");
    if (action.type === "pass") {
      recordClaimResponse(state, player.seat, null);
    } else if (action.type === "claim") {
      const selected = options.find((option) => option.kind === action.kind && (action.consumeIds?.length ? option.consumeIds.every((id) => action.consumeIds?.includes(id)) : true));
      if (!selected) throw new GameError("這個鳴牌選項已失效");
      recordClaimResponse(state, player.seat, selected);
    } else throw new GameError("請先處理鳴牌選項");
    if (allClaimsAnswered(game)) resolveClaims(state);
    return state;
  }
  if (game.current !== player.seat) throw new GameError("現在不是你的回合");
  if (action.type === "draw") {
    if (game.phase !== "draw") throw new GameError("現在不能摸牌");
    if (!game.wall.length) {
      finishDraw(state);
      return state;
    }
    const tile = game.wall.shift() as Tile;
    player.hand = sortTiles([...player.hand, tile]);
    if (!player.riichi) player.furitenUntilDraw = false;
    game.lastDrawnId = tile.id;
    game.phase = "discard";
    game.message = `${player.name} 摸了一張牌`;
    return state;
  }
  if (action.type === "tsumo") {
    if (game.phase !== "discard" || !isWinning(player.hand, player.melds)) throw new GameError("目前不能自摸");
    finishTsumo(state, player.seat);
    return state;
  }
  if (action.type === "ankan") {
    if (game.phase !== "discard") throw new GameError("現在不能槓");
    const tiles = player.hand.filter((tile) => tile.type === action.tileType);
    if (tiles.length !== 4) throw new GameError("手中沒有四張相同的牌");
    player.hand = player.hand.filter((tile) => tile.type !== action.tileType);
    player.melds.push({ kind: "kan", tiles, from: player.seat, open: false });
    const replacement = game.rinshan.pop();
    if (!replacement) throw new GameError("嶺上牌已用完");
    player.hand = sortTiles([...player.hand, replacement]);
    if (!player.riichi) player.furitenUntilDraw = false;
    game.lastDrawnId = replacement.id;
    revealKanDora(game);
    state.players.forEach((candidate) => {
      candidate.ippatsu = false;
    });
    game.message = `${player.name} 暗槓，已補摸嶺上牌`;
    return state;
  }
  if (action.type === "discard") {
    if (game.phase !== "discard") throw new GameError("現在不能打牌");
    const tile = player.hand.find((candidate) => candidate.id === action.tileId);
    if (!tile) throw new GameError("找不到這張手牌");
    if (player.riichi && tile.id !== game.lastDrawnId) throw new GameError("立直後只能摸切");
    if (action.riichi) {
      if (player.riichi || !player.melds.every((meld) => !meld.open) || player.score < 1000) throw new GameError("目前不能立直");
      const after = player.hand.filter((candidate) => candidate.id !== tile.id);
      if (!isTenpai(after, player.melds)) throw new GameError("打出這張牌後沒有聽牌");
      player.score -= 1000;
      player.riichi = true;
      player.ippatsu = true;
      player.riichiTurn = game.turn;
      game.riichiSticks += 1;
    } else if (player.riichi && player.riichiTurn !== undefined && game.turn > player.riichiTurn) {
      player.ippatsu = false;
    }
    player.hand = player.hand.filter((candidate) => candidate.id !== tile.id);
    player.discards.push({ tile, riichi: Boolean(action.riichi) });
    game.turn += 1;
    game.lastDrawnId = undefined;
    game.lastDiscard = { tile, from: player.seat };
    game.claimOptions = claimOptionsFor(state, player.seat, tile);
    game.claimResponses = {};
    if (Object.keys(game.claimOptions).length) {
      game.phase = "claim";
      game.claimDeadline = Date.now() + 12000;
      game.message = `${player.name} 打出一張牌，等待鳴牌`;
    } else {
      nextSeatAfterDiscard(state, player.seat);
    }
    return state;
  }
  throw new GameError("不支援這個操作");
}

export function publicView(state: RoomState, token?: string) {
  const viewer = state.players.find((player) => player.token === token);
  const game = state.game;
  return {
    code: state.code,
    status: state.status,
    hostSeat: state.hostSeat,
    viewerSeat: viewer?.seat ?? null,
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      score: player.score,
      hand: player.seat === viewer?.seat ? sortTiles(player.hand) : undefined,
      handCount: player.hand.length,
      melds: player.melds,
      discards: player.discards,
      riichi: player.riichi,
      wind: game ? WINDS[(player.seat - game.dealer + 4) % 4] : WINDS[player.seat],
    })),
    game: game
      ? {
          round: game.round,
          dealer: game.dealer,
          honba: game.honba,
          riichiSticks: game.riichiSticks,
          current: game.current,
          phase: game.phase,
          wallCount: game.wall.length,
          doraIndicators: game.doraIndicators,
          lastDiscard: game.lastDiscard,
          claimDeadline: game.claimDeadline,
          message: game.message,
          result: game.result,
        }
      : undefined,
    availableActions: viewer ? availableForSeat(state, viewer.seat) : [],
  };
}
