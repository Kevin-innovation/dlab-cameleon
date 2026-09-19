import type { NextRequest } from "next/server";
import { handleHeartbeat } from "@/lib/rooms/api";
import { directoryErrorResponse, getRoomDirectoryStore, jsonResponse } from "@/lib/rooms/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    return jsonResponse(await handleHeartbeat(getRoomDirectoryStore(), raw, Date.now()));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}
