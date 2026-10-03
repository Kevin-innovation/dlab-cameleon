/** The reserved lobby identity for server-side moderation. */
export const LOBBY_ADMIN_NAME = "Kevin";

export function isLobbyAdminName(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLocaleLowerCase() === LOBBY_ADMIN_NAME.toLocaleLowerCase();
}

export function isLobbyAdminKey(value: unknown, expected: string | null): boolean {
  return typeof value === "string" && Boolean(expected) && value === expected;
}
