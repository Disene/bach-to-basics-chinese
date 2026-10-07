/** Persist display/device-independent preferences, never scores or live MIDI state.
 * No framework or storage dependency: the existing store actions remain the
 * source of truth for synchronizing restored settings with the audio engine.
 */
export const SETTINGS_STORAGE_KEY = "b2b-settings-v1";
const VERSION = 1;
const MAX_STORED_LENGTH = 32_768;

const BOOLEAN_KEYS = [
  "showFingering", "showFingeringOnNotes", "showHandColors", "useFlats",
  "metronomeEnabled", "showGrid", "showMeasureNums", "showKeySignature",
  "sheetMusicWhiteBackground", "scrollToSeek", "showBeatLines",
  "showSustainPedal", "showNoteOutline", "showSustainedNotes",
] as const;

export type RememberedSettings = Record<(typeof BOOLEAN_KEYS)[number], boolean> & {
  theme: "dark" | "light";
  layoutMode: "falling" | "sheet" | "piano" | "all";
  colorTheme: "violet" | "classic" | "ocean" | "forest" | "cascade" | "custom";
  customColors: { leftHand: string; rightHand: string; unknown: string };
  noteFilter: "all" | "white" | "black" | "c_only";
  noteLabelMode: "none" | "c_only" | "white" | "black" | "all";
  fallingNotesLabelMode: "none" | "c_only" | "white" | "black" | "all";
  pianoTheme: "white" | "ivory";
  impactStyle: "off" | "bloom" | "side" | "trail";
  instrument: "grand" | "bright" | "electric" | "harpsichord" | "honkytonk";
  viewportSeconds: number;
  minNoteHeight: number;
  noteCornerRadius: number;
  renderOffset: number;
  countInBars: 0 | 1 | 2;
};

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PreferenceState {
  settings: RememberedSettings;
  updateSettings(patch: Partial<RememberedSettings>): void;
  setMetronome(on: boolean): void;
}

export interface PreferenceStore {
  getState(): PreferenceState;
  subscribe(listener: (state: PreferenceState, previous: PreferenceState) => void): () => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T | undefined {
  return typeof value === "string" && choices.includes(value as T) ? value as T : undefined;
}

function bounded(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : undefined;
}

/** Allowlist + field validation; never spread untrusted storage into app state. */
export function sanitizeRememberedSettings(value: unknown): Partial<RememberedSettings> {
  if (!record(value)) return {};
  const result: Partial<RememberedSettings> = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] === "boolean") result[key] = value[key];
  }

  const theme = choice(value.theme, ["dark", "light"]);
  if (theme !== undefined) result.theme = theme;
  const layoutMode = choice(value.layoutMode, ["falling", "sheet", "piano", "all"]);
  if (layoutMode !== undefined) result.layoutMode = layoutMode;
  const colorTheme = choice(value.colorTheme, ["violet", "classic", "ocean", "forest", "cascade", "custom"]);
  if (colorTheme !== undefined) result.colorTheme = colorTheme;
  const noteFilter = choice(value.noteFilter, ["all", "white", "black", "c_only"]);
  if (noteFilter !== undefined) result.noteFilter = noteFilter;
  const labels = ["none", "c_only", "white", "black", "all"] as const;
  const noteLabelMode = choice(value.noteLabelMode, labels);
  if (noteLabelMode !== undefined) result.noteLabelMode = noteLabelMode;
  const fallingNotesLabelMode = choice(value.fallingNotesLabelMode, labels);
  if (fallingNotesLabelMode !== undefined) result.fallingNotesLabelMode = fallingNotesLabelMode;
  const pianoTheme = choice(value.pianoTheme, ["white", "ivory"]);
  if (pianoTheme !== undefined) result.pianoTheme = pianoTheme;
  const impactStyle = choice(value.impactStyle, ["off", "bloom", "side", "trail"]);
  if (impactStyle !== undefined) result.impactStyle = impactStyle;
  const instrument = choice(value.instrument, ["grand", "bright", "electric", "harpsichord", "honkytonk"]);
  if (instrument !== undefined) result.instrument = instrument;

  const viewportSeconds = bounded(value.viewportSeconds, 2, 10);
  if (viewportSeconds !== undefined) result.viewportSeconds = viewportSeconds;
  const minNoteHeight = bounded(value.minNoteHeight, 4, 24);
  if (minNoteHeight !== undefined) result.minNoteHeight = minNoteHeight;
  const noteCornerRadius = bounded(value.noteCornerRadius, 0, 12);
  if (noteCornerRadius !== undefined) result.noteCornerRadius = noteCornerRadius;
  const renderOffset = bounded(value.renderOffset, -200, 200);
  if (renderOffset !== undefined) result.renderOffset = renderOffset;
  if (value.countInBars === 0 || value.countInBars === 1 || value.countInBars === 2) {
    result.countInBars = value.countInBars;
  }

  const colors = value.customColors;
  const hex = (color: unknown): color is string =>
    typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
  if (record(colors) && hex(colors.leftHand) && hex(colors.rightHand) && hex(colors.unknown)) {
    result.customColors = { leftHand: colors.leftHand, rightHand: colors.rightHand, unknown: colors.unknown };
  }
  return result;
}

export function readRememberedSettings(storage?: PreferenceStorage): Partial<RememberedSettings> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_LENGTH) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || parsed.version !== VERSION) return {};
    return sanitizeRememberedSettings(parsed.settings);
  } catch {
    // Missing permission, private mode and broken/old JSON must not stop practice.
    return {};
  }
}

export function serializeRememberedSettings(settings: RememberedSettings): string {
  return JSON.stringify({ version: VERSION, settings: sanitizeRememberedSettings(settings) });
}

/** Accessing window.localStorage itself can throw (before getItem is called). */
export function getPreferenceStorage(): PreferenceStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Call once after store creation, before the first React render.
 * No playback, MIDI permission request, score conversion or fingering generation
 * is initiated here. Device reconnection retains its existing separate key.
 */
export function connectSettingsPersistence(
  store: PreferenceStore,
  storage: PreferenceStorage | undefined = getPreferenceStorage(),
): () => void {
  if (!storage) return () => {};

  const restored = readRememberedSettings(storage);
  const { metronomeEnabled, ...patch } = restored;
  // These actions also configure instrument, audio offset and count-in in the
  // existing engine. Direct setState would only make the UI look restored.
  if (Object.keys(patch).length > 0) store.getState().updateSettings(patch);
  if (metronomeEnabled !== undefined) store.getState().setMetronome(metronomeEnabled);

  let lastSaved = serializeRememberedSettings(store.getState().settings);
  return store.subscribe((state, previous) => {
    // Transport ticks update the store frequently; no JSON/storage work for them.
    if (state.settings === previous.settings) return;
    const next = serializeRememberedSettings(state.settings);
    if (next === lastSaved) return;
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, next);
      lastSaved = next;
    } catch {
      // Keep the current session usable; a later setting change can retry saving.
    }
  });
}
