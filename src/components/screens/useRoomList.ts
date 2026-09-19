"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIRECTORY_POLL_MS } from "@/lib/config";
import { fetchRooms } from "@/lib/rooms/client";
import type { RoomListing } from "@/lib/rooms/listing";

export type RoomListState = {
  rooms: RoomListing[];
  loading: boolean;
  error: string;
  fetchedAt: number;
};

/** Polls the public room list while the page is visible; failures back off up to 4x. */
export function useRoomList(channelId: string, enabled: boolean): RoomListState & { refresh: () => void } {
  const [state, setState] = useState<RoomListState>({ rooms: [], loading: true, error: "", fetchedAt: 0 });
  const failuresRef = useRef(0);
  const timerRef = useRef<number>(0);
  const activeRef = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchRooms(channelId);
    if (!activeRef.current) return;
    if (result.ok) {
      failuresRef.current = 0;
      setState({ rooms: result.value.rooms, loading: false, error: "", fetchedAt: Date.now() });
    } else {
      failuresRef.current = Math.min(failuresRef.current + 1, 2);
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          result.status === 503
            ? "방 목록 서버가 준비되지 않았습니다."
            : result.status === 0
              ? "네트워크 연결을 확인해 주세요."
              : "방 목록을 불러오지 못했습니다.",
      }));
    }
  }, [channelId]);

  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    const schedule = () => {
      window.clearTimeout(timerRef.current);
      const delay = DIRECTORY_POLL_MS * 2 ** failuresRef.current;
      timerRef.current = window.setTimeout(tick, delay);
    };
    const tick = async () => {
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      await load();
      if (activeRef.current) schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    void load();
  }, [load]);

  return { ...state, refresh };
}
