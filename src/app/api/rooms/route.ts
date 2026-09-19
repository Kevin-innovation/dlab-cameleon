import type { NextRequest } from "next/server";
import { handleListRooms } from "@/lib/rooms/api";
import { directoryErrorResponse, getRoomDirectoryStore, jsonResponse, rateLimitResponse } from "@/lib/rooms/server";
import { DEFAULT_CHANNEL_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  try {
    const channel = request.nextUrl.searchParams.get("channel") ?? DEFAULT_CHANNEL_ID;
    return jsonResponse(await handleListRooms(getRoomDirectoryStore(), channel, Date.now()));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}
