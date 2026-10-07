/** Per-file practice memory. No score bytes, titles, live MIDI or playback flags
 * are persisted. Inspired by the separate per-song settings in upstream PR45.
 */
export const PRACTICE_STORAGE_KEY = "b2b-practice-v1";
const MAX_ENTRIES = 100;
const MAX_RECORD_BYTES = 256_000;
const WRITE_INTERVAL_MS = 2_000;
type Hand = "left" | "right";
type Trainer = { enabled: boolean; startPct: number; endPct: number; stepPct: number; currentPct: number };
export type PracticePreferences = {
  position: number;
  tempoMultiplier: number;
  loopStart: number | null;
  loopEnd: number | null;
  waitMode: boolean;
  activeHands: Hand[];
  handVolume: { left: number; right: number };
  waitForHand: Hand | "both";
  transposeSemitones: number;
  speedTrainer: Omit<Trainer, "currentPct">;
};
export interface PracticeDocument {
  id: string;
  sourceType: string;
  musicXml: string | null;
  midiBuffer: ArrayBuffer | null;
  totalDuration: number;
  notes: readonly unknown[];
}
export interface PracticeState {
  document: PracticeDocument | null;
  isLoadingDocument: boolean;
  status: string;
  currentSeconds: number;
  tempoMultiplier: number;
  loopStart: number | null;
  loopEnd: number | null;
  waitMode: boolean;
  settings: {
    activeHands: Set<Hand>;
    handVolume: { left: number; right: number };
    waitForHand: Hand | "both";
    transposeSemitones: number;
    speedTrainer: Trainer;
  };
  updateSettings(patch: Partial<PracticeState["settings"]>): void;
  setTempoMultiplier(value: number): void;
  setActiveHands(hands: Set<Hand>): void;
  setWaitMode(on: boolean): void;
  setLoopPoints(start: number | null, end: number | null): void;
  seek(seconds: number): void;
}
export interface PracticeStore {
  getState(): PracticeState;
  subscribe(listener: (state: PracticeState, previous: PracticeState) => void): () => void;
}
export interface PracticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type MemoryNotice = "restored" | "new" | "forgotten" | "unavailable" | "session-only";
type RecordEntry = { duration: number; updatedAt: number; practice: PracticePreferences };
type Index = Record<string, RecordEntry>;
const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  finite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

export function defaultPractice(): PracticePreferences {
  return { position: 0, tempoMultiplier: 1, loopStart: null, loopEnd: null,
    waitMode: false, activeHands: ["left", "right"], handVolume: { left: 1, right: 1 },
    waitForHand: "both", transposeSemitones: 0,
    speedTrainer: { enabled: false, startPct: 60, endPct: 100, stepPct: 5 } };
}

export function sanitizePractice(value: unknown, duration: number): PracticePreferences {
  const out = defaultPractice();
  if (!isObject(value) || !finite(duration) || duration <= 0) return out;
  out.position = clamp(value.position, 0, duration, 0);
  // Completing a piece should not reopen an immediately-finished transport.
  if (out.position >= duration - 0.05) out.position = 0;
  out.tempoMultiplier = clamp(value.tempoMultiplier, 0.25, 2, 1);
  if (finite(value.loopStart) && finite(value.loopEnd) && value.loopStart >= 0 &&
      value.loopEnd <= duration && value.loopEnd - value.loopStart >= 0.05) {
    out.loopStart = value.loopStart; out.loopEnd = value.loopEnd;
  }
  if (typeof value.waitMode === "boolean") out.waitMode = value.waitMode;
  if (Array.isArray(value.activeHands)) {
    const hands = (["left", "right"] as const).filter(h => (value.activeHands as unknown[]).includes(h));
    if (hands.length) out.activeHands = hands;
  }
  if (isObject(value.handVolume)) out.handVolume = {
    left: clamp(value.handVolume.left, 0, 1, 1), right: clamp(value.handVolume.right, 0, 1, 1),
  };
  if (value.waitForHand === "left" || value.waitForHand === "right" || value.waitForHand === "both") {
    out.waitForHand = value.waitForHand;
  }
  out.transposeSemitones = Math.round(clamp(value.transposeSemitones, -6, 6, 0));
  if (isObject(value.speedTrainer)) {
    const startPct = Math.round(clamp(value.speedTrainer.startPct, 25, 200, 60));
    out.speedTrainer = {
      enabled: value.speedTrainer.enabled === true, startPct,
      endPct: Math.max(startPct, Math.round(clamp(value.speedTrainer.endPct, 25, 200, 100))),
      stepPct: Math.round(clamp(value.speedTrainer.stepPct, 1, 50, 5)),
    };
  }
  return out;
}

export function capturePractice(state: PracticeState): PracticePreferences {
  return sanitizePractice({ position: state.currentSeconds,
    tempoMultiplier: state.tempoMultiplier, loopStart: state.loopStart, loopEnd: state.loopEnd,
    waitMode: state.waitMode, activeHands: [...state.settings.activeHands],
    handVolume: state.settings.handVolume, waitForHand: state.settings.waitForHand,
    transposeSemitones: state.settings.transposeSemitones, speedTrainer: state.settings.speedTrainer,
  }, state.document?.totalDuration ?? 0);
}

export async function practiceKey(doc: PracticeDocument): Promise<string> {
  // Snapshot the immutable imported source BEFORE hashing. Later MIDI->XML or
  // fingering updates to the same document id must not change its identity.
  const xml = doc.sourceType === "musicxml" ? doc.musicXml : null;
  let payload: Uint8Array<ArrayBuffer>;
  let kind: string;
  if (xml) { payload = new TextEncoder().encode(xml); kind = "xml"; }
  else if (doc.midiBuffer?.byteLength) { payload = new Uint8Array(doc.midiBuffer.slice(0)); kind = "midi"; }
  else throw new Error("No stable imported source");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return `${kind}:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
}

function readIndex(storage: PracticeStorage): Index {
  const raw = storage.getItem(PRACTICE_STORAGE_KEY);
  if (!raw) return {};
  if (raw.length > MAX_RECORD_BYTES) throw new Error("Practice record exceeds limit");
  const decoded: unknown = JSON.parse(raw);
  // Do not downgrade or overwrite a newer schema with an older application.
  if (!isObject(decoded) || decoded.version !== 1 || !isObject(decoded.entries)) {
    throw new Error("Unsupported practice record");
  }
  const index: Index = {};
  for (const [key, entry] of Object.entries(decoded.entries).slice(0, MAX_ENTRIES * 2)) {
    if (!/^(xml|midi):[0-9a-f]{64}$/.test(key) || !isObject(entry) ||
        !finite(entry.duration) || entry.duration <= 0 || !finite(entry.updatedAt)) continue;
    index[key] = { duration: entry.duration, updatedAt: entry.updatedAt,
      practice: sanitizePractice(entry.practice, entry.duration) };
  }
  return index;
}
function saveIndex(storage: PracticeStorage, index: Index): void {
  const entries = Object.fromEntries(Object.entries(index)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_ENTRIES));
  const raw = JSON.stringify({ version: 1, entries });
  if (raw.length > MAX_RECORD_BYTES) throw new Error("Practice record exceeds limit");
  storage.setItem(PRACTICE_STORAGE_KEY, raw);
}
function browserStorage(): PracticeStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

export interface PracticeMemoryOptions {
  storage?: PracticeStorage;
  keyForDocument?: (doc: PracticeDocument) => Promise<string>;
  now?: () => number;
  notice?: (kind: MemoryNotice) => void;
}
/** Installs once, after global preference restoration. The controller is
 * independent of score rendering and makes no audio/MIDI/network requests.
 */
export function connectPracticeMemory(store: PracticeStore, options: PracticeMemoryOptions = {}) {
  const storage = options.storage ?? browserStorage();
  const keyForDocument = options.keyForDocument ?? practiceKey;
  const now = options.now ?? Date.now;
  const notice = options.notice ?? (() => {});
  let disposed = false;
  let applying = false;
  let scheduled = false;
  let generation = 0;
  let observedId: string | null = null;
  let pendingId: string | null = null;
  let touchedWhilePending = false;
  let active: { id: string; key: string; duration: number } | null = null;
  let last: PracticePreferences | null = null;
  let lastSaved = "";
  let lastWriteAt = 0;
  let storageFailed = false;
  const failed = () => {
    if (!storageFailed) notice("unavailable");
    storageFailed = true;
  };
  function flush(): void {
    if (!storage || !active || !last) return;
    const serialized = JSON.stringify(last);
    if (serialized === lastSaved) return;
    try {
      // Merge the latest persisted index, so editing one piece never wipes other
      // pieces merely because this tab was opened before those entries existed.
      const index = readIndex(storage);
      index[active.key] = { duration: active.duration, updatedAt: now(), practice: last };
      saveIndex(storage, index);
      lastSaved = serialized; lastWriteAt = now(); storageFailed = false;
    } catch { failed(); }
  }
  function restore(value: PracticePreferences): void {
    applying = true;
    try {
      const state = store.getState();
      // Only called while stopped, after import and engine loading have settled.
      state.updateSettings({ handVolume: { ...value.handVolume }, waitForHand: value.waitForHand,
        transposeSemitones: value.transposeSemitones,
        speedTrainer: { ...value.speedTrainer, currentPct: value.speedTrainer.startPct } });
      state.setActiveHands(new Set(value.activeHands));
      state.setWaitMode(value.waitMode);
      state.setTempoMultiplier(value.tempoMultiplier);
      state.setLoopPoints(value.loopStart, value.loopEnd);
      state.seek(value.position);
    } finally { applying = false; }
  }
  async function considerDocument(): Promise<void> {
    scheduled = false;
    if (disposed) return;
    const state = store.getState();
    const doc = state.document;
    if (!doc || doc.id !== observedId || active?.id === doc.id || pendingId === doc.id ||
        state.isLoadingDocument || !doc.notes.length || doc.totalDuration <= 0) return;
    const token = generation;
    pendingId = doc.id;
    touchedWhilePending = state.status !== "stopped" || state.currentSeconds !== 0;
    try {
      const key = await keyForDocument(doc);
      if (disposed || token !== generation || store.getState().document?.id !== doc.id) return;
      if (!/^(xml|midi):[0-9a-f]{64}$/.test(key)) throw new Error("Invalid source key");
      const current = store.getState();
      if (current.isLoadingDocument) { pendingId = null; return; }
      active = { id: doc.id, key, duration: doc.totalDuration };
      let saved: RecordEntry | undefined;
      try { saved = storage ? readIndex(storage)[key] : undefined; }
      catch { failed(); }
      // A changed converter may change duration; do not apply obsolete ranges.
      const compatible = saved && Math.abs(saved.duration - doc.totalDuration) < 0.001 ? saved : undefined;
      if (!touchedWhilePending && current.status === "stopped" && current.currentSeconds === 0) {
        restore(compatible ? sanitizePractice(compatible.practice, doc.totalDuration) : defaultPractice());
        if (!storageFailed) notice(compatible ? "restored" : storage ? "new" : "session-only");
      }
      last = capturePractice(store.getState());
      lastSaved = compatible ? JSON.stringify(compatible.practice) : "";
      lastWriteAt = now();
    } catch { if (!disposed && token === generation) { failed(); pendingId = doc.id; } }
  }
  function scheduleConsider(): void {
    if (disposed || scheduled) return;
    scheduled = true;
    // set({document}) is followed by loadDocument() in the existing store;
    // deferring prevents applying seek/settings to the previous engine document.
    queueMicrotask(() => { void considerDocument(); });
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (disposed || applying) return;
    const id = state.document?.id ?? null;
    if (id !== observedId) {
      flush(); generation++; observedId = id; pendingId = null; active = null;
      last = null; lastSaved = ""; touchedWhilePending = false; storageFailed = false;
      scheduleConsider(); return;
    }
    if (!active || active.id !== id) {
      if (pendingId === id && (state.status !== "stopped" ||
          JSON.stringify(capturePractice(state)) !== JSON.stringify(capturePractice(previous)))) {
        touchedWhilePending = true;
      }
      scheduleConsider(); return;
    }
    if (state.isLoadingDocument) { flush(); return; }
    const next = capturePractice(state);
    const prior = last;
    last = next;
    const settingsChanged = prior && JSON.stringify({ ...prior, position: 0 }) !==
      JSON.stringify({ ...next, position: 0 });
    if (settingsChanged || state.status !== previous.status ||
        (state.status !== "playing" && state.currentSeconds !== previous.currentSeconds) ||
        now() - lastWriteAt >= WRITE_INTERVAL_MS) flush();
  });
  observedId = store.getState().document?.id ?? null;
  scheduleConsider();
  return {
    flush,
    forgetCurrent(): boolean {
      if (!active || !storage) return false;
      try {
        const index = readIndex(storage); delete index[active.key]; saveIndex(storage, index);
        // Avoid immediately rewriting the just-forgotten entry at page hide.
        generation++; pendingId = active.id; active = null; last = null; lastSaved = "";
        notice("forgotten"); return true;
      } catch { failed(); return false; }
    },
    dispose(): void {
      if (disposed) return;
      flush(); disposed = true; generation++; unsubscribe();
    },
  };
}
