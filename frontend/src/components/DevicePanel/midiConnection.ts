/** MIDI connection lifecycle, separate from playback and score import. */
export type MidiPortInfo = { id: string; name: string; manufacturer: string };
export type MidiHandlers = {
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
  pedal: (down: boolean) => void;
};
export type MidiInputPort = MidiPortInfo & {
  isConnected: () => boolean;
  open: () => Promise<unknown>;
  listen: (handlers: MidiHandlers) => () => void;
};
export type MidiDriver = {
  supported: boolean;
  secure: boolean;
  enable: () => Promise<unknown>;
  inputs: () => MidiInputPort[];
  watch: (changed: () => void) => () => void;
};
export type MidiSink = {
  play: (midi: number, velocity: number) => Promise<unknown>;
  stop: (midi: number) => void;
  pedal: (down: boolean) => void;
};
export type MidiStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type MidiConnectionState = {
  phase: "starting" | "ready" | "error";
  inputs: MidiPortInfo[];
  selectedId: string | null;
  selectedName: string | null;
  openingId: string | null;
  error: string | null;
  lastNote: number | null;
  pedal: boolean | null; // null means no CC64 received, not an observed pedal-up.
};
export const MIDI_PREFERENCE_KEY = "b2b-midi-input-v1";

export function readMidiPreference(storage?: MidiStorage): MidiPortInfo | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(MIDI_PREFERENCE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (["id", "name", "manufacturer"].some((k) => typeof v[k] !== "string" || (v[k] as string).length > 512)) return null;
    return v.id && v.name ? { id: v.id as string, name: v.name as string, manufacturer: v.manufacturer as string } : null;
  } catch { return null; }
}

export function matchMidiPreference(ports: MidiInputPort[], preferred: MidiPortInfo | null): MidiInputPort | null {
  if (!preferred) return null;
  const available = ports.filter((p) => p.isConnected());
  // Remember an explicitly chosen port, never silently choose the first port.
  const exact = available.find((p) => p.id === preferred.id);
  if (exact) return exact;
  const matches = available.filter((p) => p.name === preferred.name && p.manufacturer === preferred.manufacturer);
  return matches.length === 1 ? matches[0] : null;
}

export class MidiConnection {
  private driver: MidiDriver;
  private sink: MidiSink;
  private changed: (state: MidiConnectionState) => void;
  private storage?: MidiStorage;
  private preferred: MidiPortInfo | null;
  private active: MidiInputPort | null = null;
  private opening: MidiInputPort | null = null;
  private failed: MidiInputPort | null = null;
  private removeInput: (() => void) | null = null;
  private removeWatch: (() => void) | null = null;
  private held = new Set<number>();
  private revision = 0;
  private disposed = false;
  private starting: Promise<void> | null = null;
  state: MidiConnectionState = {
    phase: "starting", inputs: [], selectedId: null, selectedName: null,
    openingId: null, error: null, lastNote: null, pedal: null,
  };

  constructor(driver: MidiDriver, sink: MidiSink, changed: (state: MidiConnectionState) => void, storage?: MidiStorage) {
    this.driver = driver;
    this.sink = sink;
    this.changed = changed;
    this.storage = storage;
    this.preferred = readMidiPreference(storage);
  }

  private emit(patch: Partial<MidiConnectionState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.changed(this.state);
  }

  private remember(value: MidiPortInfo | null) {
    this.preferred = value;
    try {
      if (value) this.storage?.setItem(MIDI_PREFERENCE_KEY, JSON.stringify(value));
      else this.storage?.removeItem(MIDI_PREFERENCE_KEY);
    } catch { /* Storage denial must not block MIDI input. */ }
  }

  start(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.startOnce().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async startOnce() {
    if (!this.driver.secure || !this.driver.supported) {
      this.emit({ phase: "error", error: !this.driver.secure
        ? "MIDI 需要安全页面，请使用本机 localhost 地址或 HTTPS。"
        : "当前浏览器不支持 Web MIDI，请使用支持该功能的 Chrome 或 Edge。" });
      return;
    }
    this.emit({ phase: "starting", error: null });
    try {
      await this.driver.enable();
      if (this.disposed) return;
      this.removeWatch?.();
      this.removeWatch = this.driver.watch(() => { void this.refresh(); });
      this.emit({ phase: "ready" });
      await this.refresh();
    } catch (error) {
      if (this.disposed) return;
      const name = error instanceof Error ? error.name : "";
      this.emit({ phase: "error", error: name === "NotAllowedError" || name === "SecurityError"
        ? "MIDI 权限未获允许。请检查当前网站的 MIDI 权限，再点击重试。"
        : `MIDI 初始化失败：${error instanceof Error ? error.message : String(error)}。请点击重试。` });
    }
  }

  /** Re-enumerate without disabling the global WebMidi singleton or reloading the score. */
  async retry() {
    this.failed = null;
    if (this.state.phase !== "ready") { await this.start(); return; }
    this.emit({ error: null });
    await this.refresh();
  }

  private async refresh() {
    if (this.disposed || this.state.phase !== "ready") return;
    const ports = this.driver.inputs().filter((p) => p.isConnected());
    if (this.active && !ports.includes(this.active)) this.detach();
    if (this.opening && !ports.includes(this.opening)) this.detach();
    if (this.failed && !ports.includes(this.failed)) this.failed = null;
    this.emit({ inputs: ports.map(({ id, name, manufacturer }) => ({ id, name, manufacturer })) });
    if (this.active || this.opening) return;
    const preferred = matchMidiPreference(ports, this.preferred);
    if (preferred && preferred !== this.failed) await this.connect(preferred);
  }

  async select(id: string) {
    if (this.disposed || this.state.phase !== "ready") return;
    const port = this.driver.inputs().find((p) => p.id === id && p.isConnected());
    if (!port) { this.emit({ error: "该 MIDI 输入已不可用，请重新检测设备。" }); return; }
    await this.connect(port);
  }

  private async connect(port: MidiInputPort) {
    if (port === this.active || port === this.opening) return;
    this.detach();
    const revision = this.revision;
    this.opening = port;
    this.emit({ openingId: port.id, error: null });
    try {
      await port.open();
      if (this.disposed || this.revision !== revision || !port.isConnected()) return;
      this.active = port;
      this.opening = null;
      const current = () => !this.disposed && this.active === port && this.revision === revision;
      this.removeInput = port.listen({
        noteOn: (midi, velocity) => {
          if (!current()) return;
          if (velocity === 0) { this.held.delete(midi); this.sink.stop(midi); return; }
          this.held.add(midi);
          this.emit({ lastNote: midi });
          void this.sink.play(midi, velocity).catch((error: unknown) => {
            if (current()) this.emit({ error: `已收到 MIDI 按键，但声音加载失败：${error instanceof Error ? error.message : String(error)}` });
          });
        },
        noteOff: (midi) => { if (current()) { this.held.delete(midi); this.sink.stop(midi); } },
        pedal: (down) => { if (current()) { this.sink.pedal(down); this.emit({ pedal: down }); } },
      });
      this.failed = null;
      this.remember({ id: port.id, name: port.name, manufacturer: port.manufacturer });
      this.emit({ selectedId: port.id, selectedName: port.name, openingId: null });
    } catch (error) {
      if (this.disposed || this.revision !== revision) return;
      this.detach();
      this.failed = port;
      this.emit({ error: `无法打开 MIDI 输入“${port.name}”：${error instanceof Error ? error.message : String(error)}。请检查连接或其他占用设备的程序，然后重试。` });
    } finally {
      if (this.opening === port && this.revision === revision) {
        this.opening = null;
        this.emit({ openingId: null });
      }
    }
  }

  private detach() {
    ++this.revision; // Late open/audio callbacks must not revive a previous selection.
    this.opening = null;
    this.removeInput?.();
    this.removeInput = null;
    if (this.active) {
      this.sink.pedal(false);
      for (const midi of this.held) this.sink.stop(midi);
    }
    this.held.clear();
    this.active = null;
    this.emit({ selectedId: null, selectedName: null, openingId: null, pedal: null, lastNote: null });
  }

  disconnect() {
    this.remember(null); // Respect intentional disconnect, including after a refresh.
    this.failed = null;
    this.detach();
  }

  dispose() {
    this.disposed = true;
    this.removeWatch?.();
    this.removeWatch = null;
    this.detach();
  }
}
