import { createLobby, publicView } from "../../../lib/riichi";
import { insertRoom } from "../../../lib/rooms";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 16) : "";
}

function makeCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    const name = cleanName(body.name);
    if (name.length < 1) return Response.json({ error: "請輸入暱稱" }, { status: 400 });
    const token = crypto.randomUUID();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = makeCode();
      const state = createLobby(code, name, token);
      if (await insertRoom(state)) {
        return Response.json({ token, room: publicView(state, token) }, { status: 201 });
      }
    }
    return Response.json({ error: "暫時無法建立房間，請再試一次" }, { status: 503 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "建立房間失敗" },
      { status: 500 },
    );
  }
}
