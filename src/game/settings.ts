import { readStored, writeStored } from "./simulation/progressStore";

const SETTINGS_KEY = "sudoku-sprint-settings-v1";

export interface Settings {
  reducedMotion: boolean;
  relatedHighlight: boolean;
  longPressHighlight: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  reducedMotion: false,
  relatedHighlight: true,
  longPressHighlight: true,
};

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const stored = JSON.parse(readStored(SETTINGS_KEY) ?? "null");
    for (const key of Object.keys(settings) as Array<keyof Settings>) {
      if (typeof stored?.[key] === "boolean") settings[key] = stored[key];
    }
  } catch {
    // Malformed or older settings should not prevent starting the game.
  }
  return settings;
}

export function applySettingsAppearance(settings: Settings): void {
  document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion);
}

export function saveSettings(settings: Settings): void {
  writeStored(SETTINGS_KEY, JSON.stringify(settings));
  applySettingsAppearance(settings);
}
