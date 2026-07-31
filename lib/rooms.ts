import { env } from "cloudflare:workers";
import type { RoomState } from "./riichi";

const ROOM_SCHEMA = `
  CREATE TABLE IF NOT EXISTS mahjong_rooms (
    code TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

async function ensureSchema() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  await env.DB.prepare(ROOM_SCHEMA).run();
}

export async function readRoom(code: string) {
  await ensureSchema();
  const row = await env.DB.prepare(
    "SELECT state_json, revision FROM mahjong_rooms WHERE code = ?",
  )
    .bind(code)
    .first<{ state_json: string; revision: number }>();
  if (!row) return null;
  return { state: JSON.parse(row.state_json) as RoomState, revision: row.revision };
}

export async function insertRoom(state: RoomState) {
  await ensureSchema();
  const now = Date.now();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO mahjong_rooms (code, state_json, revision, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
  )
    .bind(state.code, JSON.stringify(state), now, now)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function mutateRoom(
  code: string,
  mutate: (state: RoomState) => RoomState | Promise<RoomState>,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const loaded = await readRoom(code);
    if (!loaded) return null;
    const next = await mutate(loaded.state);
    const result = await env.DB.prepare(
      "UPDATE mahjong_rooms SET state_json = ?, revision = revision + 1, updated_at = ? WHERE code = ? AND revision = ?",
    )
      .bind(JSON.stringify(next), Date.now(), code, loaded.revision)
      .run();
    if (Number(result.meta.changes ?? 0) === 1) {
      return { state: next, revision: loaded.revision + 1 };
    }
  }
  throw new Error("Room changed too quickly; please retry");
}
