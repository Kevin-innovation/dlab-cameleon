import type { NextRequest } from "next/server";
import { handleDeleteChat, handleListChat, handleSendChat } from "@/lib/rooms/api";
import { chatRateLimitResponse, directoryErrorResponse, getLobbyAdminKey, getRoomDirectoryStore, jsonResponse, rateLimitResponse } from "@/lib/rooms/server";
import { DEFAULT_CHANNEL_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  try {
    const channel = request.nextUrl.searchParams.get("channel") ?? DEFAULT_CHANNEL_ID;
    const rawAfter = request.nextUrl.searchParams.get("after") ?? "0";
    const after = Number(rawAfter);
    return jsonResponse(await handleListChat(getRoomDirectoryStore(), channel, after, Date.now()));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const limited = chatRateLimitResponse(request);
  if (limited) return limited;
  try {
    return jsonResponse(await handleSendChat(getRoomDirectoryStore(), await request.text(), Date.now()));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const limited = chatRateLimitResponse(request);
  if (limited) return limited;
  const adminKey = getLobbyAdminKey();
  if (!adminKey) return jsonResponse({ status: 503, body: { ok: false, error: "chat moderation is not configured" } });
  try {
    return jsonResponse(await handleDeleteChat(getRoomDirectoryStore(), await request.text(), Date.now(), adminKey));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}
