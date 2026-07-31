"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tile = { id: number; type: number; red?: boolean };
type Meld = { kind: "chi" | "pon" | "kan"; tiles: Tile[]; from: number; open: boolean };
type Discard = { tile: Tile; riichi?: boolean; called?: boolean };
type PlayerView = {
  seat: number;
  name: string;
  score: number;
  hand?: Tile[];
  handCount: number;
  melds: Meld[];
  discards: Discard[];
  riichi: boolean;
  wind: string;
};
type ActionView = {
  type: "draw" | "discard" | "riichi" | "tsumo" | "ankan" | "claim";
  label: string;
  kind?: "ron" | "chi" | "pon" | "kan";
  consumeIds?: number[];
  tileIds?: number[];
  tileType?: number;
};
type ResultView = {
  kind: "ron" | "tsumo" | "draw";
  title: string;
  message: string;
  winners: Array<{ seat: number; han: number; fu: number; points: number; yaku: string[] }>;
  dealerContinues: boolean;
};
type RoomView = {
  code: string;
  status: "lobby" | "playing" | "round-end" | "game-end";
  hostSeat: number;
  viewerSeat: number | null;
  players: PlayerView[];
  game?: {
    round: number;
    dealer: number;
    honba: number;
    riichiSticks: number;
    current: number;
    phase: "draw" | "discard" | "claim" | "round-end" | "game-end";
    wallCount: number;
    doraIndicators: Tile[];
    lastDiscard?: { tile: Tile; from: number };
    claimDeadline?: number;
    message: string;
    result?: ResultView;
  };
  availableActions: ActionView[];
};

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const NUMBER_CHARS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function tileName(tile: Tile) {
  if (tile.type >= 27) return HONORS[tile.type - 27];
  const rank = (tile.type % 9) + 1;
  const suit = tile.type < 9 ? "萬" : tile.type < 18 ? "筒" : "索";
  return `${tile.red ? "赤" : ""}${rank}${suit}`;
}

function TileFace({ tile, compact = false, selected = false }: { tile: Tile; compact?: boolean; selected?: boolean }) {
  const suit = tile.type < 9 ? "man" : tile.type < 18 ? "pin" : tile.type < 27 ? "sou" : "honor";
  const rank = (tile.type % 9) + 1;
  return (
    <span className={`tile-face tile-${suit} ${tile.red ? "is-red" : ""} ${compact ? "tile-compact" : ""} ${selected ? "is-selected" : ""}`} aria-hidden="true">
      {tile.type >= 27 ? (
        <b className="honor-mark">{HONORS[tile.type - 27]}</b>
      ) : (
        <>
          <b className="tile-number">{tile.type < 9 ? NUMBER_CHARS[rank - 1] : rank}</b>
          <small>{tile.type < 9 ? "萬" : tile.type < 18 ? "筒" : "索"}</small>
        </>
      )}
      {tile.red && <i className="red-dot" />}
    </span>
  );
}

function MeldView({ meld }: { meld: Meld }) {
  return (
    <span className={`meld meld-${meld.kind}`}>
      {meld.tiles.map((tile) => <TileFace key={tile.id} tile={tile} compact />)}
    </span>
  );
}

function PlayerPanel({ player, active, position }: { player: PlayerView; active: boolean; position: string }) {
  return (
    <section className={`opponent opponent-${position} ${active ? "active" : ""}`}>
      <div className="player-label">
        <span className="wind-badge">{player.wind}</span>
        <span>
          <strong>{player.name}{player.riichi ? " ・立直" : ""}</strong>
          <small>{player.score.toLocaleString()} 點</small>
        </span>
      </div>
      <div className="opponent-tiles" aria-label={`${player.name}有${player.handCount}張暗牌`}>
        {Array.from({ length: player.handCount }, (_, index) => <i key={index} className="tile-back" />)}
      </div>
      {player.melds.length > 0 && <div className="opponent-melds">{player.melds.map((meld, index) => <MeldView key={index} meld={meld} />)}</div>}
    </section>
  );
}

function River({ player }: { player: PlayerView }) {
  return (
    <div className="river-group">
      <span>{player.wind}・{player.name}</span>
      <div>{player.discards.filter((discard) => !discard.called).slice(-18).map((discard, index) => <span key={`${discard.tile.id}-${index}`} className={discard.riichi ? "riichi-discard" : ""}><TileFace tile={discard.tile} compact /></span>)}</div>
    </div>
  );
}

function SeatList({ room }: { room: RoomView }) {
  return (
    <div className="seat-list">
      {Array.from({ length: 4 }, (_, seat) => {
        const player = room.players.find((candidate) => candidate.seat === seat);
        return (
          <div className={`seat-slot ${player ? "filled" : ""}`} key={seat}>
            <span>{["東", "南", "西", "北"][seat]}</span>
            <div><strong>{player?.name ?? "等待玩家"}</strong><small>{player ? (seat === room.hostSeat ? "房主" : "已入座") : "分享链接邀请朋友"}</small></div>
            <i>{player ? "✓" : `${seat + 1}`}</i>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const lastTick = useRef(0);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
    setRoomCode(code);
    setToken(code ? localStorage.getItem(`yique-riichi:${code}`) ?? "" : "");
    setReady(true);
  }, []);

  const fetchRoom = useCallback(async (code: string, currentToken: string, quiet = false) => {
    try {
      const response = await fetch(`/api/rooms/${code}?token=${encodeURIComponent(currentToken)}`, { cache: "no-store" });
      const data = await response.json() as { room?: RoomView; error?: string };
      if (!response.ok || !data.room) throw new Error(data.error ?? "读取房间失败");
      setRoom(data.room);
      if (!quiet) setError("");
      if (data.room.game?.phase === "claim" && data.room.game.claimDeadline && Date.now() >= data.room.game.claimDeadline && currentToken && Date.now() - lastTick.current > 2000) {
        lastTick.current = Date.now();
        void fetch(`/api/rooms/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "action", token: currentToken, action: { type: "tick" } }) });
      }
    } catch (fetchError) {
      if (!quiet) setError(fetchError instanceof Error ? fetchError.message : "读取房间失败");
    }
  }, []);

  useEffect(() => {
    if (!ready || !roomCode) return;
    void fetchRoom(roomCode, token);
    const interval = window.setInterval(() => void fetchRoom(roomCode, token, true), 1100);
    return () => window.clearInterval(interval);
  }, [fetchRoom, ready, roomCode, token]);

  async function createRoom() {
    if (!name.trim()) return setError("请先输入昵称");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json() as { token?: string; room?: RoomView; error?: string };
      if (!response.ok || !data.token || !data.room) throw new Error(data.error ?? "建立房间失败");
      localStorage.setItem(`yique-riichi:${data.room.code}`, data.token);
      window.history.replaceState({}, "", `${window.location.pathname}?room=${data.room.code}`);
      setToken(data.token);
      setRoomCode(data.room.code);
      setRoom(data.room);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "建立房间失败");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!name.trim()) return setError("请先输入昵称");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomCode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "join", name }) });
      const data = await response.json() as { token?: string; room?: RoomView; error?: string };
      if (!response.ok || !data.token || !data.room) throw new Error(data.error ?? "加入房间失败");
      localStorage.setItem(`yique-riichi:${roomCode}`, data.token);
      setToken(data.token);
      setRoom(data.room);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "加入房间失败");
    } finally {
      setBusy(false);
    }
  }

  async function sendAction(action: Record<string, unknown>) {
    if (!roomCode || !token || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomCode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "action", token, action }) });
      const data = await response.json() as { room?: RoomView; error?: string };
      if (!response.ok || !data.room) throw new Error(data.error ?? "操作失败");
      setRoom(data.room);
      setSelectedId(undefined);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function shareRoom() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: "谐不压怔！一日麻！", text: `杨振山快来，就等你来玩了！房号 ${roomCode}`, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("没有复制成功，请从地址栏复制链接");
    }
  }

  const viewer = room?.players.find((player) => player.seat === room.viewerSeat);
  const hand = viewer?.hand ?? [];
  const selected = hand.find((tile) => tile.id === selectedId);
  const riichiAction = room?.availableActions.find((action) => action.type === "riichi");
  const claimActions = room?.availableActions.filter((action) => action.type === "claim") ?? [];
  const canDiscard = room?.availableActions.some((action) => action.type === "discard");
  const relativeSeats = useMemo(() => {
    const seat = room?.viewerSeat ?? 0;
    return { right: (seat + 1) % 4, top: (seat + 2) % 4, left: (seat + 3) % 4 };
  }, [room?.viewerSeat]);

  if (!ready) return <main className="loading-screen"><span className="brand-seal">雀</span><p>正在铺开牌桌…</p></main>;

  if (!roomCode) {
    return (
      <main className="landing-shell">
        <header className="landing-nav"><Brand /><span className="no-login-badge">免登录・链接入场</span></header>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">四人线上日麻</span>
            <h1>谐不压怔！<br /><em>一日麻！</em></h1>
            <p className="invite-subtitle">杨振山快来，就等你来玩了！</p>
            <p className="hero-description">建立一间私人房，分享链接。四个人用昵称入座，不注册、不安装，直接打东风战。</p>
            <div className="create-card">
              <label htmlFor="host-name">你的昵称</label>
              <div><input id="host-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={16} placeholder="例如：小林" onKeyDown={(event) => { if (event.key === "Enter") void createRoom(); }} /><button onClick={createRoom} disabled={busy}>{busy ? "建房中…" : "建立四人房"}</button></div>
              {error && <p className="form-error">{error}</p>}
            </div>
            <div className="rule-chips"><span>东风战</span><span>25,000 点</span><span>赤宝牌</span><span>食断</span><span>多人荣和</span></div>
          </div>
          <div className="hero-table" aria-hidden="true">
            <div className="hero-center">東一局<small>四人待合</small></div>
            {[0, 1, 2, 3].map((side) => <div className={`hero-wall wall-${side}`} key={side}>{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>)}
            <span className="floating-tile"><TileFace tile={{ id: 900, type: 31 }} /></span>
          </div>
        </section>
        <footer className="landing-footer"><span>核心日麻规则</span><p>立直・一发・宝牌／里宝牌・振听・吃碰杠・荣和／自摸・荒牌流局</p></footer>
      </main>
    );
  }

  if (!room) {
    return <main className="loading-screen"><span className="brand-seal">雀</span><p>{error || `正在进入房间 ${roomCode}…`}</p></main>;
  }

  if (room.viewerSeat === null) {
    return (
      <main className="lobby-shell">
        <header className="topbar"><Brand /><span className="no-login-badge">免登录</span></header>
        <section className="join-panel">
          <span className="eyebrow">朋友邀请你加入</span>
          <h1>谐不压怔！一日麻！</h1>
          <p className="invite-line">杨振山快来，就等你来玩了！</p>
          <button className="room-code" onClick={shareRoom}><small>房号</small>{room.code}<i>{copied ? "已复制" : "复制链接"}</i></button>
          <SeatList room={room} />
          {room.status === "lobby" ? (
            <div className="join-form"><label htmlFor="guest-name">输入昵称后入座</label><div><input id="guest-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={16} placeholder="你的昵称" onKeyDown={(event) => { if (event.key === "Enter") void joinRoom(); }} /><button onClick={joinRoom} disabled={busy || room.players.length >= 4}>{busy ? "加入中…" : "加入牌桌"}</button></div></div>
          ) : <p className="spectator-note">牌局已经开始。这一版不开放中途入座。</p>}
          {error && <p className="form-error">{error}</p>}
        </section>
      </main>
    );
  }

  if (room.status === "lobby") {
    const isHost = room.viewerSeat === room.hostSeat;
    return (
      <main className="lobby-shell">
        <header className="topbar"><Brand /><span className="no-login-badge">免登录・已入座</span></header>
        <section className="lobby-panel">
          <div className="lobby-heading"><div><span className="eyebrow">四人东风战</span><h1>等待朋友入座</h1></div><button className="room-code compact-code" onClick={shareRoom}><small>房号</small>{room.code}<i>{copied ? "已复制" : "分享"}</i></button></div>
          <SeatList room={room} />
          <div className="lobby-actions"><p>{room.players.length}/4 人已到齐<br /><small>每人 25,000 点・赤宝牌・食断</small></p><button className="primary-button" onClick={() => sendAction({ type: "start" })} disabled={!isHost || room.players.length !== 4 || busy}>{isHost ? (room.players.length === 4 ? "开始东一局" : "等四人到齐") : "等待房主开始"}</button></div>
          {error && <p className="form-error">{error}</p>}
        </section>
      </main>
    );
  }

  const game = room.game;
  if (!game || !viewer) return <main className="loading-screen"><p>同步牌局中…</p></main>;
  const right = room.players.find((player) => player.seat === relativeSeats.right) as PlayerView;
  const top = room.players.find((player) => player.seat === relativeSeats.top) as PlayerView;
  const left = room.players.find((player) => player.seat === relativeSeats.left) as PlayerView;
  const result = game.result;

  return (
    <main className="game-shell">
      <header className="topbar game-topbar"><Brand /><div className="round-meta"><span>东{game.round + 1}局</span><i /><span>{game.honba} 本场</span><i /><span>供托 {game.riichiSticks}</span></div><button className="room-pill" onClick={shareRoom}>{copied ? "链接已复制" : `房号 ${room.code}・分享`}</button></header>
      <section className="table-wrap">
        <div className="felt-table">
          <PlayerPanel player={top} active={game.current === top.seat && game.phase !== "claim"} position="top" />
          <PlayerPanel player={left} active={game.current === left.seat && game.phase !== "claim"} position="left" />
          <PlayerPanel player={right} active={game.current === right.seat && game.phase !== "claim"} position="right" />
          <div className="table-center">
            <div className="center-round"><small>東</small><strong>{game.round + 1}</strong><span>局</span></div>
            <div className="center-stats"><span>牌山 <b>{game.wallCount}</b></span><span>本场 <b>{game.honba}</b></span><span>供托 <b>{game.riichiSticks}</b></span></div>
            <div className="dora-row"><small>宝牌表示</small>{game.doraIndicators.map((tile) => <TileFace key={tile.id} tile={tile} compact />)}</div>
            <p>{game.message}</p>
          </div>
          <div className="rivers">{room.players.map((player) => <River key={player.seat} player={player} />)}</div>
        </div>
      </section>

      <section className="hand-dock">
        <div className="hand-heading"><div className={`your-seat ${game.current === viewer.seat ? "active" : ""}`}><span className="wind-badge">{viewer.wind}</span><span><strong>{viewer.name}{viewer.riichi ? "・立直" : ""}</strong><small>{viewer.score.toLocaleString()} 点・{viewer.handCount} 张暗牌</small></span></div><p>{game.phase === "claim" ? "请决定是否鸣牌" : game.current === viewer.seat ? "轮到你" : `等待 ${room.players[game.current].name}`}</p></div>
        {viewer.melds.length > 0 && <div className="human-melds">{viewer.melds.map((meld, index) => <MeldView key={index} meld={meld} />)}</div>}
        <div className="hand-row">{hand.map((tile, index) => <button key={tile.id} className="tile-button" disabled={!canDiscard} aria-pressed={selectedId === tile.id} aria-label={`第${index + 1}张，${tileName(tile)}`} onClick={() => setSelectedId((current) => current === tile.id ? undefined : tile.id)}><TileFace tile={tile} selected={selectedId === tile.id} /></button>)}</div>
        <div className="action-bar">
          {claimActions.length > 0 ? (
            <><p>可鸣牌・剩余 {game.claimDeadline ? Math.max(0, Math.ceil((game.claimDeadline - Date.now()) / 1000)) : 0} 秒</p><div className="action-buttons">{claimActions.map((action, index) => <button key={`${action.kind}-${index}`} className={action.kind === "ron" ? "gold-button" : "action-button"} onClick={() => sendAction({ type: "claim", kind: action.kind, consumeIds: action.consumeIds })}>{action.label}</button>)}<button className="quiet-button" onClick={() => sendAction({ type: "pass" })}>过</button></div></>
          ) : (
            <><p>{selected ? `已选：${tileName(selected)}` : game.current === viewer.seat ? "选择一张牌" : "牌局同步中"}</p><div className="action-buttons">
              {room.availableActions.filter((action) => action.type === "tsumo").map((action) => <button key="tsumo" className="gold-button" onClick={() => sendAction({ type: "tsumo" })}>{action.label}</button>)}
              {room.availableActions.filter((action) => action.type === "ankan").map((action) => <button key={`kan-${action.tileType}`} className="action-button" onClick={() => sendAction({ type: "ankan", tileType: action.tileType })}>{action.label}</button>)}
              {room.availableActions.some((action) => action.type === "draw") && <button className="primary-button" onClick={() => sendAction({ type: "draw" })}>摸牌</button>}
              {canDiscard && riichiAction?.tileIds?.includes(selectedId ?? -1) && <button className="gold-button" disabled={!selected} onClick={() => sendAction({ type: "discard", tileId: selectedId, riichi: true })}>立直打出</button>}
              {canDiscard && <button className="primary-button" disabled={!selected || busy} onClick={() => sendAction({ type: "discard", tileId: selectedId })}>打出</button>}
            </div></>
          )}
        </div>
        {error && <p className="table-error">{error}</p>}
      </section>

      <footer className="game-notes"><p><span>东风战</span>立直・赤宝牌・食断・多人荣和・荒牌听牌料</p><p>公开链接入场・无需账号・不涉及金钱</p></footer>

      {(room.status === "round-end" || room.status === "game-end") && result && (
        <div className="result-overlay"><section className="result-card"><span className="result-stamp">{result.kind === "draw" ? "流" : "和"}</span><small>东{game.round + 1}局・{result.title}</small><h1>{result.message}</h1>{result.winners.map((winner) => <div className="winner-detail" key={winner.seat}><strong>{room.players[winner.seat].name}　{winner.han}番 {winner.fu}符</strong><span>＋{winner.points.toLocaleString()} 点</span><p>{winner.yaku.join("・")}</p></div>)}<div className="score-board">{[...room.players].sort((a, b) => b.score - a.score).map((player, index) => <span key={player.seat}><i>{index + 1}</i>{player.name}<b>{player.score.toLocaleString()}</b></span>)}</div>{room.status === "round-end" && <button className="primary-button" disabled={viewer.seat !== room.hostSeat || busy} onClick={() => sendAction({ type: "next-round" })}>{viewer.seat === room.hostSeat ? "下一局" : "等待房主继续"}</button>}{room.status === "game-end" && <div className="result-actions"><button className="primary-button" disabled={viewer.seat !== room.hostSeat || busy} onClick={() => sendAction({ type: "rematch" })}>{viewer.seat === room.hostSeat ? "原房再开一场" : "等待房主再开"}</button><a className="quiet-button" href={window.location.pathname}>建立新房</a></div>}</section></div>
      )}
    </main>
  );
}

function Brand() {
  return <a className="brand" href="/"><span className="brand-seal">雀</span><span><strong>谐不压怔！一日麻！</strong><small>杨振山快来，就等你来玩了！</small></span></a>;
}
