import type { NextRequest } from "next/server";
import { handleCloseRoom, handleGetRoom } from "@/lib/rooms/api";
import { directoryErrorResponse, getRoomDirectoryStore, jsonResponse } from "@/lib/rooms/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    return jsonResponse(await handleGetRoom(getRoomDirectoryStore(), code, Date.now()));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const raw = await request.text();
    return jsonResponse(await handleCloseRoom(getRoomDirectoryStore(), code, raw));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}
