import { LEAVE_REASON_KEY } from "../config";

export type LeaveReason = "kicked" | "lost";
export type LeaveRecord = { reason: LeaveReason; code: string; at: number };

export function readLeaveRecord(): LeaveRecord | null {
  try {
    const raw = window.sessionStorage.getItem(LEAVE_REASON_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(LEAVE_REASON_KEY);
    const parsed = JSON.parse(raw) as Partial<LeaveRecord>;
    if ((parsed.reason !== "kicked" && parsed.reason !== "lost") || typeof parsed.code !== "string") return null;
    return { reason: parsed.reason, code: parsed.code, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

export function writeLeaveRecord(record: LeaveRecord) {
  try {
    window.sessionStorage.setItem(LEAVE_REASON_KEY, JSON.stringify(record));
  } catch {
    // Storage can be blocked; the home screen then shows no reason, which is acceptable.
  }
}
