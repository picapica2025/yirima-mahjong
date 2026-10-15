import {
  applyAction,
  GameError,
  joinLobby,
  publicView,
  type ClientAction,
} from "../../../../lib/riichi";
import { mutateRoom, readRoom } from "../../../../lib/rooms";

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 16) : "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const token = new URL(request.url).searchParams.get("token") ?? undefined;
    const loaded = await readRoom(code);
    if (!loaded) return Response.json({ error: "找不到這個房間" }, { status: 404 });
    return Response.json({ room: publicView(loaded.state, token), revision: loaded.revision });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "讀取房間失敗" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const body = (await request.json()) as {
      op?: "join" | "action";
      name?: string;
      token?: string;
      action?: ClientAction;
    };
    if (body.op === "join") {
      const name = cleanName(body.name);
      if (!name) return Response.json({ error: "請輸入暱稱" }, { status: 400 });
      if (body.token !== undefined && (typeof body.token !== "string" || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(body.token))) return Response.json({ error: "无效座位凭据" }, { status: 400 });
      const token = body.token ?? crypto.randomUUID();
      const updated = await mutateRoom(code, (state) => joinLobby(state, name, token));
      if (!updated) return Response.json({ error: "找不到這個房間" }, { status: 404 });
      return Response.json({ token, room: publicView(updated.state, token), revision: updated.revision }, { status: 201 });
    }
    if (body.op === "action") {
      if (!body.token || !body.action) return Response.json({ error: "缺少牌局操作資料" }, { status: 400 });
      const updated = await mutateRoom(code, (state) => applyAction(state, body.token as string, body.action as ClientAction));
      if (!updated) return Response.json({ error: "找不到這個房間" }, { status: 404 });
      return Response.json({ room: publicView(updated.state, body.token), revision: updated.revision });
    }
    return Response.json({ error: "不支援這個操作" }, { status: 400 });
  } catch (error) {
    const status = error instanceof GameError ? error.status : error instanceof SyntaxError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "操作失敗" },
      { status },
    );
  }
}
