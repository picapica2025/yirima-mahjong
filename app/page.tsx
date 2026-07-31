"use client";

import { useEffect, useMemo, useState } from "react";

type Suit = "wan" | "tong" | "suo" | "honor";
type Phase = "draw" | "discard" | "claim" | "over";
type MeldKind = "chow" | "pong" | "kong";

type Tile = {
  id: number;
  suit: Suit;
  rank: number;
  key: string;
};

type Meld = {
  kind: MeldKind;
  tiles: Tile[];
};

type Player = {
  name: string;
  wind: string;
  hand: Tile[];
  melds: Meld[];
  discards: Tile[];
};

type ClaimAction = {
  type: "win" | MeldKind;
  label: string;
  consumeIds: number[];
};

type PendingClaim = {
  tile: Tile;
  from: number;
  actions: ClaimAction[];
};

type GameState = {
  players: Player[];
  wall: Tile[];
  current: number;
  phase: Phase;
  pending?: PendingClaim;
  message: string;
  turn: number;
  winner?: number;
  winType?: "自摸" | "榮和" | "流局";
};

const WINDS = ["東", "南", "西", "北"];
const NAMES = ["你", "阿樂", "美玲", "老陳"];
const SUIT_ORDER: Record<Suit, number> = {
  wan: 0,
  tong: 1,
  suo: 2,
  honor: 3,
};
const CHINESE_NUMBERS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONORS = ["", "東", "南", "西", "北", "中", "發", "白"];

function createDeck() {
  const tiles: Tile[] = [];
  let id = 0;

  (["wan", "tong", "suo"] as Suit[]).forEach((suit) => {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({ id: id++, suit, rank, key: `${suit}-${rank}` });
      }
    }
  });

  for (let rank = 1; rank <= 7; rank += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push({ id: id++, suit: "honor", rank, key: `honor-${rank}` });
    }
  }

  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[swap]] = [tiles[swap], tiles[i]];
  }

  return tiles;
}

function sortHand(hand: Tile[]) {
  return [...hand].sort(
    (a, b) =>
      SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
      a.rank - b.rank ||
      a.id - b.id,
  );
}

function tileIndex(tile: Tile) {
  if (tile.suit === "wan") return tile.rank - 1;
  if (tile.suit === "tong") return 9 + tile.rank - 1;
  if (tile.suit === "suo") return 18 + tile.rank - 1;
  return 27 + tile.rank - 1;
}

function groupsPossible(counts: number[], groupsLeft: number): boolean {
  if (groupsLeft === 0) return counts.every((count) => count === 0);
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return false;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (groupsPossible(counts, groupsLeft - 1)) {
      counts[first] += 3;
      return true;
    }
    counts[first] += 3;
  }

  const isSuited = first < 27;
  const rank = first % 9;
  if (
    isSuited &&
    rank <= 6 &&
    counts[first + 1] > 0 &&
    counts[first + 2] > 0
  ) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (groupsPossible(counts, groupsLeft - 1)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  return false;
}

function isWinningHand(hand: Tile[], openMelds: number) {
  const groupsNeeded = 4 - openMelds;
  if (groupsNeeded < 0 || hand.length !== groupsNeeded * 3 + 2) return false;

  const counts = Array.from({ length: 34 }, () => 0);
  hand.forEach((tile) => {
    counts[tileIndex(tile)] += 1;
  });

  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    if (groupsPossible(counts, groupsNeeded)) {
      counts[pair] += 2;
      return true;
    }
    counts[pair] += 2;
  }

  return false;
}

function chowActions(hand: Tile[], tile: Tile) {
  if (tile.suit === "honor") return [] as ClaimAction[];
  const patterns = [
    [tile.rank - 2, tile.rank - 1],
    [tile.rank - 1, tile.rank + 1],
    [tile.rank + 1, tile.rank + 2],
  ];

  return patterns.flatMap((pattern) => {
    if (pattern[0] < 1 || pattern[1] > 9) return [];
    const first = hand.find(
      (candidate) => candidate.suit === tile.suit && candidate.rank === pattern[0],
    );
    const second = hand.find(
      (candidate) =>
        candidate.suit === tile.suit &&
        candidate.rank === pattern[1] &&
        candidate.id !== first?.id,
    );
    if (!first || !second) return [];
    const sequence = [...pattern, tile.rank].sort((a, b) => a - b).join("·");
    return [
      {
        type: "chow" as const,
        label: `吃 ${sequence}`,
        consumeIds: [first.id, second.id],
      },
    ];
  });
}

function claimActionsForPlayer(
  player: Player,
  tile: Tile,
  canChow: boolean,
) {
  const matches = player.hand.filter((candidate) => candidate.key === tile.key);
  const actions: ClaimAction[] = [];

  if (isWinningHand([...player.hand, tile], player.melds.length)) {
    actions.push({ type: "win", label: "胡", consumeIds: [] });
  }
  if (matches.length >= 3) {
    actions.push({
      type: "kong",
      label: "槓",
      consumeIds: matches.slice(0, 3).map((match) => match.id),
    });
  }
  if (matches.length >= 2) {
    actions.push({
      type: "pong",
      label: "碰",
      consumeIds: matches.slice(0, 2).map((match) => match.id),
    });
  }
  if (canChow) actions.push(...chowActions(player.hand, tile));

  return actions;
}

function removeLastDiscard(players: Player[], playerIndex: number, tileId: number) {
  return players.map((player, index) =>
    index === playerIndex
      ? {
          ...player,
          discards: player.discards.filter((discard) => discard.id !== tileId),
        }
      : player,
  );
}

function applyBotClaim(
  state: GameState,
  claimant: number,
  from: number,
  tile: Tile,
  action: ClaimAction,
) {
  let players = removeLastDiscard(state.players, from, tile.id);
  const player = players[claimant];
  const consumed = player.hand.filter((candidate) =>
    action.consumeIds.includes(candidate.id),
  );
  const nextPlayer: Player = {
    ...player,
    hand: sortHand(
      player.hand.filter((candidate) => !action.consumeIds.includes(candidate.id)),
    ),
    melds: [
      ...player.melds,
      {
        kind: action.type as MeldKind,
        tiles: sortHand([...consumed, tile]),
      },
    ],
  };
  players = players.map((candidate, index) =>
    index === claimant ? nextPlayer : candidate,
  );
  const verb = action.type === "kong" ? "槓" : action.type === "pong" ? "碰" : "吃";

  return {
    ...state,
    players,
    current: claimant,
    phase: action.type === "kong" ? ("draw" as const) : ("discard" as const),
    pending: undefined,
    message:
      action.type === "kong"
        ? `${player.name}${verb}了，補一張牌`
        : `${player.name}${verb}了，正在選擇出牌`,
  };
}

function nextTurn(state: GameState, from: number) {
  return {
    ...state,
    current: (from + 1) % 4,
    phase: "draw" as const,
    pending: undefined,
    message:
      (from + 1) % 4 === 0
        ? "輪到你了，摸一張牌"
        : `輪到${state.players[(from + 1) % 4].name}摸牌`,
  };
}

function resolveHumanDiscard(state: GameState, tile: Tile) {
  const botOrder = [1, 2, 3];

  for (const botIndex of botOrder) {
    const bot = state.players[botIndex];
    if (isWinningHand([...bot.hand, tile], bot.melds.length)) {
      return {
        ...state,
        phase: "over" as const,
        current: botIndex,
        winner: botIndex,
        winType: "榮和" as const,
        message: `${bot.name}胡了你打出的牌`,
      };
    }
  }

  for (const botIndex of botOrder) {
    const actions = claimActionsForPlayer(state.players[botIndex], tile, false);
    const action =
      actions.find((candidate) => candidate.type === "kong") ??
      actions.find((candidate) => candidate.type === "pong");
    if (action) return applyBotClaim(state, botIndex, 0, tile, action);
  }

  const chow = chowActions(state.players[1].hand, tile)[0];
  if (chow) return applyBotClaim(state, 1, 0, tile, chow);

  return nextTurn(state, 0);
}

function resolveBotDiscard(state: GameState, tile: Tile, from: number) {
  const actions = claimActionsForPlayer(
    state.players[0],
    tile,
    (from + 1) % 4 === 0,
  );
  if (actions.length > 0) {
    return {
      ...state,
      phase: "claim" as const,
      pending: { tile, from, actions },
      message: `${state.players[from].name}打出一張可鳴的牌`,
    };
  }
  return nextTurn(state, from);
}

function botDiscardValue(hand: Tile[], tile: Tile) {
  const same = hand.filter((candidate) => candidate.key === tile.key).length;
  if (tile.suit === "honor") return same * 4;
  const adjacent = hand.filter(
    (candidate) =>
      candidate.suit === tile.suit &&
      Math.abs(candidate.rank - tile.rank) <= 2 &&
      candidate.id !== tile.id,
  ).length;
  const edgePenalty = tile.rank === 1 || tile.rank === 9 ? -0.35 : 0;
  return same * 3.5 + adjacent + edgePenalty + Math.random() * 0.4;
}

function stepBot(state: GameState) {
  if (state.phase === "over" || state.current === 0) return state;
  const botIndex = state.current;
  const bot = state.players[botIndex];

  if (state.phase === "draw") {
    if (state.wall.length === 0) {
      return {
        ...state,
        phase: "over" as const,
        winType: "流局" as const,
        message: "牌牆已空，本局流局",
      };
    }
    const [drawn, ...wall] = state.wall;
    const players = state.players.map((player, index) =>
      index === botIndex
        ? { ...player, hand: sortHand([...player.hand, drawn]) }
        : player,
    );
    if (isWinningHand(players[botIndex].hand, players[botIndex].melds.length)) {
      return {
        ...state,
        players,
        wall,
        phase: "over" as const,
        winner: botIndex,
        winType: "自摸" as const,
        message: `${bot.name}自摸了`,
      };
    }
    return {
      ...state,
      players,
      wall,
      phase: "discard" as const,
      message: `${bot.name}摸了一張牌`,
    };
  }

  if (state.phase === "discard") {
    const discard = [...bot.hand].sort(
      (a, b) => botDiscardValue(bot.hand, a) - botDiscardValue(bot.hand, b),
    )[0];
    if (!discard) return nextTurn(state, botIndex);
    const players = state.players.map((player, index) =>
      index === botIndex
        ? {
            ...player,
            hand: player.hand.filter((tile) => tile.id !== discard.id),
            discards: [...player.discards, discard],
          }
        : player,
    );
    const withDiscard = {
      ...state,
      players,
      turn: state.turn + 1,
      message: `${bot.name}打出 ${tileSpokenName(discard)}`,
    };
    return resolveBotDiscard(withDiscard, discard, botIndex);
  }

  return state;
}

function newGame(): GameState {
  const deck = createDeck();
  const players: Player[] = NAMES.map((name, index) => ({
    name,
    wind: WINDS[index],
    hand: [],
    melds: [],
    discards: [],
  }));

  for (let round = 0; round < 13; round += 1) {
    for (let player = 0; player < 4; player += 1) {
      players[player].hand.push(deck.shift() as Tile);
    }
  }
  players[0].hand.push(deck.shift() as Tile);
  players.forEach((player) => {
    player.hand = sortHand(player.hand);
  });

  return {
    players,
    wall: deck,
    current: 0,
    phase: "discard",
    message: "東一局，你是莊家。請先打出一張牌",
    turn: 1,
  };
}

function tileSpokenName(tile: Tile) {
  if (tile.suit === "honor") return HONORS[tile.rank];
  const suit = tile.suit === "wan" ? "萬" : tile.suit === "tong" ? "筒" : "索";
  return `${tile.rank}${suit}`;
}

function TileFace({
  tile,
  compact = false,
  selected = false,
}: {
  tile: Tile;
  compact?: boolean;
  selected?: boolean;
}) {
  const className = [
    "tile-face",
    `tile-${tile.suit}`,
    compact ? "tile-compact" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (tile.suit === "honor") {
    return (
      <span className={className} aria-hidden="true">
        <span className="honor-mark">{HONORS[tile.rank]}</span>
      </span>
    );
  }

  const suitLabel =
    tile.suit === "wan" ? "萬" : tile.suit === "tong" ? "筒" : "索";
  return (
    <span className={className} aria-hidden="true">
      <span className="tile-number">
        {tile.suit === "wan" ? CHINESE_NUMBERS[tile.rank] : tile.rank}
      </span>
      <span className="tile-suit">{suitLabel}</span>
    </span>
  );
}

function MeldView({ meld }: { meld: Meld }) {
  return (
    <span className="meld" aria-label={`${meld.kind}牌組`}>
      {meld.tiles.map((tile) => (
        <TileFace key={tile.id} tile={tile} compact />
      ))}
    </span>
  );
}

function Opponent({
  player,
  active,
  position,
}: {
  player: Player;
  active: boolean;
  position: string;
}) {
  return (
    <section className={`opponent opponent-${position} ${active ? "active" : ""}`}>
      <div className="player-label">
        <span className="wind-badge">{player.wind}</span>
        <span>
          <strong>{player.name}</strong>
          <small>{active ? "思考中…" : "25,000"}</small>
        </span>
      </div>
      <div className="opponent-tiles" aria-label={`${player.name}有${player.hand.length}張暗牌`}>
        {player.hand.slice(0, 14).map((tile) => (
          <i key={tile.id} className="tile-back" />
        ))}
      </div>
      {player.melds.length > 0 && (
        <div className="opponent-melds">
          {player.melds.map((meld, index) => (
            <MeldView key={`${meld.kind}-${index}`} meld={meld} />
          ))}
        </div>
      )}
    </section>
  );
}

function River({
  player,
  label,
}: {
  player: Player;
  label: string;
}) {
  return (
    <div className="river-group">
      <span>{label}</span>
      <div>
        {player.discards.slice(-12).map((tile) => (
          <TileFace key={tile.id} tile={tile} compact />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => newGame());
  const [selectedId, setSelectedId] = useState<number>();
  const human = game.players[0];
  const canSelfWin =
    game.current === 0 &&
    game.phase === "discard" &&
    isWinningHand(human.hand, human.melds.length);

  useEffect(() => {
    if (game.current === 0 || game.phase === "claim" || game.phase === "over") {
      return;
    }
    const timer = window.setTimeout(() => {
      setGame((current) => stepBot(current));
    }, 620);
    return () => window.clearTimeout(timer);
  }, [game]);

  const selectedTile = useMemo(
    () => human.hand.find((tile) => tile.id === selectedId),
    [human.hand, selectedId],
  );

  function restart() {
    setSelectedId(undefined);
    setGame(newGame());
  }

  function drawTile() {
    if (game.current !== 0 || game.phase !== "draw") return;
    if (game.wall.length === 0) {
      setGame({
        ...game,
        phase: "over",
        winType: "流局",
        message: "牌牆已空，本局流局",
      });
      return;
    }
    const [drawn, ...wall] = game.wall;
    const players = game.players.map((player, index) =>
      index === 0
        ? { ...player, hand: sortHand([...player.hand, drawn]) }
        : player,
    );
    setGame({
      ...game,
      players,
      wall,
      phase: "discard",
      message: `你摸到 ${tileSpokenName(drawn)}，請選擇一張打出`,
    });
    setSelectedId(drawn.id);
  }

  function discardSelected() {
    if (!selectedTile || game.current !== 0 || game.phase !== "discard") return;
    const players = game.players.map((player, index) =>
      index === 0
        ? {
            ...player,
            hand: player.hand.filter((tile) => tile.id !== selectedTile.id),
            discards: [...player.discards, selectedTile],
          }
        : player,
    );
    const withDiscard = {
      ...game,
      players,
      turn: game.turn + 1,
      message: `你打出 ${tileSpokenName(selectedTile)}`,
    };
    setSelectedId(undefined);
    setGame(resolveHumanDiscard(withDiscard, selectedTile));
  }

  function claim(action: ClaimAction) {
    const pending = game.pending;
    if (!pending || game.phase !== "claim") return;
    if (action.type === "win") {
      setGame({
        ...game,
        phase: "over",
        current: 0,
        winner: 0,
        winType: "榮和",
        pending: undefined,
        message: `你胡了${game.players[pending.from].name}打出的 ${tileSpokenName(pending.tile)}`,
      });
      return;
    }

    let players = removeLastDiscard(
      game.players,
      pending.from,
      pending.tile.id,
    );
    const consumed = players[0].hand.filter((tile) =>
      action.consumeIds.includes(tile.id),
    );
    players = players.map((player, index) =>
      index === 0
        ? {
            ...player,
            hand: sortHand(
              player.hand.filter((tile) => !action.consumeIds.includes(tile.id)),
            ),
            melds: [
              ...player.melds,
              {
                kind: action.type as MeldKind,
                tiles: sortHand([...consumed, pending.tile]),
              },
            ],
          }
        : player,
    );
    setSelectedId(undefined);
    setGame({
      ...game,
      players,
      current: 0,
      phase: action.type === "kong" ? "draw" : "discard",
      pending: undefined,
      message:
        action.type === "kong"
          ? "明槓成立，請補摸一張牌"
          : `${action.label}成立，請打出一張牌`,
    });
  }

  function passClaim() {
    if (!game.pending) return;
    const from = game.pending.from;
    setGame(nextTurn({ ...game, pending: undefined }, from));
  }

  function selfWin() {
    if (!canSelfWin) return;
    setGame({
      ...game,
      phase: "over",
      winner: 0,
      winType: "自摸",
      message: "恭喜，你自摸了！",
    });
  }

  const isHumanTurn = game.current === 0 && game.phase !== "over";
  const phaseLabel =
    game.phase === "claim"
      ? "等待你決定"
      : game.phase === "over"
        ? "本局結束"
        : isHumanTurn
          ? "輪到你"
          : `${game.players[game.current].name}的回合`;

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#table" aria-label="一雀麻將首頁">
          <span className="brand-seal">雀</span>
          <span>
            <strong>一雀麻將</strong>
            <small>MAHJONG TABLE</small>
          </span>
        </a>
        <div className="round-meta" aria-label="牌局狀態">
          <span>東一局</span>
          <i />
          <span>莊家：你</span>
          <i />
          <span>{phaseLabel}</span>
        </div>
        <button className="quiet-button" onClick={restart}>
          ↻ 新的一局
        </button>
      </header>

      <section id="table" className="table-wrap" aria-label="四人麻將牌桌">
        <div className="felt-table">
          <Opponent
            player={game.players[2]}
            active={game.current === 2 && game.phase !== "over"}
            position="top"
          />
          <Opponent
            player={game.players[3]}
            active={game.current === 3 && game.phase !== "over"}
            position="left"
          />
          <Opponent
            player={game.players[1]}
            active={game.current === 1 && game.phase !== "over"}
            position="right"
          />

          <div className="table-center">
            <div className="wall-counter">
              <small>牌牆</small>
              <strong>{game.wall.length}</strong>
              <span>張</span>
            </div>
            <div className="turn-orbit">
              <span>東</span>
              <span>南</span>
              <span>西</span>
              <span>北</span>
              <b
                className={`turn-marker marker-${game.current}`}
                aria-hidden="true"
              />
            </div>
            <p className="announcement" aria-live="polite">
              {game.message}
            </p>
          </div>

          <div className="rivers" aria-label="牌河">
            <River player={game.players[2]} label="西家" />
            <River player={game.players[3]} label="北家" />
            <River player={game.players[1]} label="南家" />
            <River player={game.players[0]} label="你的牌河" />
          </div>
        </div>
      </section>

      <section className="hand-dock" aria-label="你的手牌">
        <div className="hand-heading">
          <div className={`your-seat ${isHumanTurn ? "active" : ""}`}>
            <span className="wind-badge">東</span>
            <span>
              <strong>你的手牌</strong>
              <small>{human.hand.length} 張暗牌 · 25,000 點</small>
            </span>
          </div>
          <p>點選一張牌，再按「打出」</p>
        </div>

        {human.melds.length > 0 && (
          <div className="human-melds">
            {human.melds.map((meld, index) => (
              <MeldView key={`${meld.kind}-${index}`} meld={meld} />
            ))}
          </div>
        )}

        <div className="hand-row" role="group" aria-label="選擇要打出的牌">
          {human.hand.map((tile, index) => (
            <button
              key={tile.id}
              type="button"
              className="tile-button"
              onClick={() =>
                setSelectedId((current) =>
                  current === tile.id ? undefined : tile.id,
                )
              }
              aria-pressed={selectedId === tile.id}
              aria-label={`第${index + 1}張，${tileSpokenName(tile)}`}
              disabled={game.current !== 0 || game.phase !== "discard"}
            >
              <TileFace tile={tile} selected={selectedId === tile.id} />
            </button>
          ))}
        </div>

        <div className="action-bar">
          {game.phase === "claim" && game.pending ? (
            <>
              <div className="claim-tile">
                <span>上家打出</span>
                <TileFace tile={game.pending.tile} compact />
              </div>
              <div className="claim-buttons">
                {game.pending.actions.map((action, index) => (
                  <button
                    key={`${action.type}-${index}`}
                    className={action.type === "win" ? "gold-button" : "action-button"}
                    onClick={() => claim(action)}
                  >
                    {action.label}
                  </button>
                ))}
                <button className="quiet-button pass-button" onClick={passClaim}>
                  過
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="selection-copy">
                {selectedTile
                  ? `已選：${tileSpokenName(selectedTile)}`
                  : game.phase === "draw" && game.current === 0
                    ? "先摸一張牌"
                    : "尚未選牌"}
              </p>
              <div className="claim-buttons">
                {canSelfWin && (
                  <button className="gold-button" onClick={selfWin}>
                    自摸
                  </button>
                )}
                {game.phase === "draw" && game.current === 0 ? (
                  <button className="primary-button" onClick={drawTile}>
                    摸一張
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    onClick={discardSelected}
                    disabled={!selectedTile || game.phase !== "discard" || game.current !== 0}
                  >
                    打出
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="game-notes">
        <p>
          <span>簡化港式玩法</span>
          四人對局 · 吃、碰、明槓、胡 · 電腦玩家會自動摸打
        </p>
        <p>不含金錢交易 · 牌局資料只留在本次瀏覽</p>
      </footer>

      {game.phase === "over" && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label="牌局結果">
          <div className="result-card">
            <span className="result-stamp">
              {game.winType === "流局" ? "流" : "和"}
            </span>
            <small>東一局 · {game.winType}</small>
            <h1>
              {game.winner === 0
                ? "好牌，漂亮！"
                : game.winType === "流局"
                  ? "牌牆摸完了"
                  : `${game.players[game.winner ?? 0].name}和牌`}
            </h1>
            <p>{game.message}</p>
            <button className="primary-button" onClick={restart}>
              再開一局
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
