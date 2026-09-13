export const MOBILE_DEVICE_QUERY = "(max-width: 767px), (pointer: coarse) and (hover: none)";
export const MOBILE_PORTRAIT_QUERY =
  "(max-width: 767px) and (orientation: portrait), (pointer: coarse) and (hover: none) and (orientation: portrait)";

export function joystickInput(deltaX: number, deltaY: number, max: number) {
  const safeMax = Math.max(1, max);
  const length = Math.hypot(deltaX, deltaY) || 1;
  const scale = Math.min(1, safeMax / length);
  const x = deltaX * scale;
  const y = deltaY * scale;
  const threshold = safeMax * 0.24;
  const keys: string[] = [];
  if (y < -threshold) keys.push("w");
  if (y > threshold) keys.push("s");
  if (x < -threshold) keys.push("a");
  if (x > threshold) keys.push("d");
  return { x, y, keys };
}

export async function requestMobileLandscape() {
  try {
    if (typeof window === "undefined") return false;
    if (!window.matchMedia(MOBILE_DEVICE_QUERY).matches) return true;

    let fullscreen = Boolean(document.fullscreenElement);
    if (!fullscreen && typeof document.documentElement.requestFullscreen === "function") {
      try {
        await document.documentElement.requestFullscreen();
        fullscreen = true;
      } catch {
        // Fullscreen can be denied by iOS Safari, browser settings, or an embedded frame.
      }
    }

    const orientation = window.screen?.orientation as (ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    }) | undefined;
    if (fullscreen && orientation?.lock) {
      try {
        await orientation.lock("landscape");
        return true;
      } catch {
        // Some browsers do not expose orientation locking outside installed PWAs.
      }
    }

    return window.matchMedia("(orientation: landscape)").matches;
  } catch {
    // A restricted iOS browser API must never prevent the room from opening.
    return false;
  }
}
