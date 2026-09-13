export async function requestMobileLandscape() {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia("(max-width: 767px)").matches) return true;

  let fullscreen = Boolean(document.fullscreenElement);
  if (!fullscreen && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      fullscreen = true;
    } catch {
      // Fullscreen can be denied by browser settings or an embedded frame.
    }
  }

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
  };
  if (fullscreen && orientation?.lock) {
    try {
      await orientation.lock("landscape");
      return true;
    } catch {
      // Some browsers do not expose orientation locking outside installed PWAs.
    }
  }

  return window.matchMedia("(orientation: landscape)").matches;
}
