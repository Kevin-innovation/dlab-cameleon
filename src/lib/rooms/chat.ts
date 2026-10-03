import { CHAT_TEXT_MAX } from "../config";
import { NICKNAME_MAX } from "../nickname";

export type LobbyChatMessage = {
  id: string;
  name: string;
  text: string;
  at: number;
};

/** Keep user-supplied lobby text single-line and bounded before it reaches storage/UI. */
export function cleanLobbyChatText(value: unknown, max = CHAT_TEXT_MAX): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

export function cleanLobbyChatName(value: unknown): string | null {
  return cleanLobbyChatText(value, NICKNAME_MAX);
}
