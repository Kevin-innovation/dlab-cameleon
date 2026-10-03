"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOBBY_CHAT_HISTORY_MAX, LOBBY_CHAT_POLL_MS } from "@/lib/config";
import { fetchLobbyChat, sendLobbyChat } from "@/lib/rooms/client";
import type { LobbyChatMessage } from "@/lib/rooms/chat";

export type LobbyChatState = {
  messages: LobbyChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string;
};

const initialState: LobbyChatState = { messages: [], loading: true, sending: false, error: "" };

function mergeMessages(current: LobbyChatMessage[], incoming: LobbyChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-LOBBY_CHAT_HISTORY_MAX);
}

export function useLobbyChat(channelId: string, nickname: string, enabled: boolean): LobbyChatState & { send: (text: string) => Promise<boolean>; refresh: () => void } {
  const [state, setState] = useState<LobbyChatState>(initialState);
  const cursorRef = useRef(0);
  const timerRef = useRef<number>(0);
  const activeRef = useRef(false);
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchLobbyChat(channelId, Math.max(0, cursorRef.current - 1));
    if (!activeRef.current) return;
    if (!result.ok) {
      setState((prev) => ({ ...prev, loading: false, error: result.status === 0 ? "채팅 서버 연결을 확인해 주세요." : "로비 채팅을 불러오지 못했습니다." }));
      return;
    }
    const latest = result.value.messages.reduce((max, message) => Math.max(max, message.at), cursorRef.current);
    cursorRef.current = latest;
    setState((prev) => ({ ...prev, messages: mergeMessages(prev.messages, result.value.messages), loading: false, error: "" }));
  }, [channelId]);

  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    const schedule = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(tick, LOBBY_CHAT_POLL_MS);
    };
    const tick = async () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false) await load();
      if (activeRef.current) schedule();
    };
    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || !nickname.trim() || sendingRef.current) return false;
      sendingRef.current = true;
      setState((prev) => ({ ...prev, sending: true, error: "" }));
      const result = await sendLobbyChat(channelId, nickname, clean);
      sendingRef.current = false;
      if (!result.ok) {
        setState((prev) => ({ ...prev, sending: false, error: result.status === 429 ? "메시지를 너무 빠르게 보내고 있어요." : "메시지를 보내지 못했습니다." }));
        return false;
      }
      cursorRef.current = Math.max(cursorRef.current, result.value.message.at);
      setState((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [result.value.message]), sending: false }));
      return true;
    },
    [channelId, nickname],
  );

  const refresh = useCallback(() => {
    cursorRef.current = 0;
    setState((prev) => ({ ...prev, messages: [], loading: true, error: "" }));
    void load();
  }, [load]);

  return { ...state, send, refresh };
}
