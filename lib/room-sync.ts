export type RoomCursor = { code: string; token: string; revision: number };

// A room response belongs to both a seat identity and a database revision.
export function acceptRoomSnapshot(cursor: RoomCursor, code: string, token: string, revision: number) {
  if (cursor.code !== code || cursor.token !== token || !Number.isSafeInteger(revision) || revision < cursor.revision) return false;
  cursor.revision = revision;
  return true;
}
