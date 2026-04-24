const TELEMETRY_STORAGE_KEY = "sudoku-sprint-phaser-telemetry-v1";
const MAX_EVENTS = 400;

export interface TelemetryEvent {
  type: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export function trackEvent(type: string, payload?: Record<string, unknown>): void {
  const event: TelemetryEvent = {
    type,
    timestamp: Date.now(),
    payload,
  };

  try {
    const existing = readEvents();
    existing.push(event);
    const trimmed = existing.slice(-MAX_EVENTS);
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Telemetry must never break gameplay flow.
  }
}

export function readEvents(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === "object" && typeof item.type === "string")
      .map((item) => ({
        type: String(item.type),
        timestamp: Number(item.timestamp) || Date.now(),
        payload: typeof item.payload === "object" && item.payload ? (item.payload as Record<string, unknown>) : undefined,
      }));
  } catch {
    return [];
  }
}

export function clearEvents(): void {
  try {
    localStorage.removeItem(TELEMETRY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}