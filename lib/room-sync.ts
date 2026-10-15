export type RoomCursor = { code: string; token: string; revision: number };

// A room response belongs to both a seat identity and a database revision.
export function acceptRoomSnapshot(cursor: RoomCursor, code: string, token: string, revision: number) {
  if (cursor.code !== code || cursor.token !== token || !Number.isSafeInteger(revision) || revision < cursor.revision) return false;
  cursor.revision = revision;
  return true;
}

// getRandomValues also works on the portable game's plain HTTP LAN address.
export function createSeatToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requestRoom<T>(url: string, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json() as T;
    return { response, data };
  } catch (error) {
    if (timedOut && !init.signal?.aborted) throw new Error("请求超时，请检查连接并确认牌桌状态后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
  }
}
