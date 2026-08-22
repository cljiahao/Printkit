const KEY = "printkit:bridge-mode";

export function isBridgeModeEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function setBridgeModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? "true" : "false");
  } catch {
    // Storage unavailable (private mode, quota) — Bridge mode simply
    // won't persist across reloads; not worth surfacing as an error here.
  }
}
