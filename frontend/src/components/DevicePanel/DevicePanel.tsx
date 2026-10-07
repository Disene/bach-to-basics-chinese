import { useEffect, useRef, useState } from "react";
import { WebMidi } from "webmidi";
import { syncEngine } from "../../engine/SyncEngine";
import { useAppStore } from "../../store/useAppStore";
import { MidiConnection, type MidiConnectionState, type MidiDriver, type MidiInputPort, type MidiStorage } from "./midiConnection";

/** Adapt the installed WebMidi library without replacing its global instance. */
function createMidiDriver(): MidiDriver {
  type Input = (typeof WebMidi.inputs)[number];
  const ports = new WeakMap<Input, MidiInputPort>();
  const adapt = (input: Input): MidiInputPort => {
    let port = ports.get(input);
    if (port) return port;
    port = {
      id: input.id,
      name: input.name || "未命名 MIDI 输入",
      manufacturer: input.manufacturer || "",
      isConnected: () => input.state === "connected",
      open: async () => {
        await input.open();
        if (input.connection !== "open") throw new Error("输入端口尚未就绪");
      },
      listen: (handlers) => {
        const noteOn = (e: { note: { number: number }; rawValue?: number }) => handlers.noteOn(e.note.number, e.rawValue ?? 64);
        const noteOff = (e: { note: { number: number } }) => handlers.noteOff(e.note.number);
        const control = (e: { controller: { number: number }; rawValue?: unknown; value?: unknown }) => {
          if (e.controller.number !== 64) return;
          const raw = typeof e.rawValue === "number" ? e.rawValue : Math.round((typeof e.value === "number" ? e.value : 0) * 127);
          handlers.pedal(raw >= 64);
        };
        const cleanup = () => {
          // A disconnected Input may already have been destroyed by WebMidi.
          try { input.removeListener("noteon", noteOn); } catch { /* already disposed */ }
          try { input.removeListener("noteoff", noteOff); } catch { /* already disposed */ }
          try { input.removeListener("controlchange", control); } catch { /* already disposed */ }
        };
        try {
          input.addListener("noteon", noteOn);
          input.addListener("noteoff", noteOff);
          input.addListener("controlchange", control);
        } catch (error) {
          cleanup();
          throw error;
        }
        return cleanup;
      },
    };
    ports.set(input, port);
    return port;
  };
  return {
    supported: typeof navigator.requestMIDIAccess === "function",
    secure: window.isSecureContext,
    enable: () => WebMidi.enable({ sysex: false }),
    inputs: () => WebMidi.inputs.map(adapt),
    watch: (changed) => {
      // Wait until the library has finished updating its port arrays.
      const notify = () => queueMicrotask(changed);
      WebMidi.addListener("connected", notify);
      WebMidi.addListener("disconnected", notify);
      WebMidi.addListener("portschanged", notify);
      return () => {
        WebMidi.removeListener("connected", notify);
        WebMidi.removeListener("disconnected", notify);
        WebMidi.removeListener("portschanged", notify);
      };
    },
  };
}

const INITIAL: MidiConnectionState = {
  phase: "starting", inputs: [], selectedId: null, selectedName: null,
  openingId: null, error: null, lastNote: null, pedal: null,
};

function noteName(midi: number) {
  return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function DevicePanel() {
  const [state, setState] = useState<MidiConnectionState>(INITIAL);
  const [open, setOpen] = useState(false);
  const controller = useRef<MidiConnection | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const setMidiDevice = useAppStore((s) => s.setMidiDevice);

  useEffect(() => {
    let storage: MidiStorage | undefined;
    try { storage = window.localStorage; } catch { /* MIDI works without storage. */ }
    let selectedName: string | null = null;
    const connection = new MidiConnection(createMidiDriver(), {
      play: (midi, velocity) => syncEngine.playMidi(midi, velocity),
      stop: (midi) => syncEngine.stopMidi(midi),
      pedal: (down) => syncEngine.setSustainPedal(down),
    }, (next) => {
      setState(next);
      if (selectedName !== next.selectedName) {
        selectedName = next.selectedName;
        setMidiDevice(selectedName);
      }
    }, storage);
    controller.current = connection;
    void connection.start();
    return () => {
      connection.dispose();
      controller.current = null;
      setMidiDevice(null);
    };
  }, [setMidiDevice]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); chipRef.current?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const connected = state.selectedId !== null;
  const busy = state.phase === "starting" || state.openingId !== null;
  const label = connected ? state.selectedName : state.phase === "starting" ? "正在检测 MIDI…"
    : state.phase === "error" ? "MIDI 连接异常" : state.openingId ? "正在连接 MIDI…"
      : state.inputs.length ? `发现 ${state.inputs.length} 个 MIDI 输入` : "未发现 MIDI 输入";
  const pedalLabel = state.pedal === null ? "待检测" : state.pedal ? "踩下" : "抬起";

  return (
    <div ref={panelRef} className="relative shrink-0 flex items-center gap-1.5">
      {connected && (
        <span
          title={state.pedal === null ? "尚未收到 CC64，请踩下再抬起踏板以确认状态" : "实体 MIDI 输入的 CC64 状态，不是乐曲文件的踏板标记"}
          aria-label={`延音踏板：${pedalLabel}`}
          className="text-xs font-semibold shrink-0"
          style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", color: state.pedal ? "var(--color-accent)" : "var(--color-text-muted)", whiteSpace: "nowrap" }}
        >
          <span aria-hidden>{state.pedal ? "●" : "○"} </span>踏板 {pedalLabel}
        </span>
      )}
      <button
        ref={chipRef}
        type="button"
        aria-label="MIDI 输入设备"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={connected ? `已连接：${state.selectedName}` : "查看设备列表、连接状态或重试"}
        className="flex items-center gap-2 text-xs font-semibold transition-colors shrink-0"
        style={{ background: connected ? "rgba(34,197,94,0.08)" : "var(--color-warning-subtle)", border: connected ? "1px solid rgba(34,197,94,0.5)" : "1px solid var(--color-warning-border)", color: connected ? "#4ade80" : "var(--color-warning)", cursor: "pointer", maxWidth: 210, borderRadius: 999, padding: "5px 10px" }}
      >
        <span aria-hidden>{connected ? "●" : "⚠"}</span>
        <span className="truncate" style={{ maxWidth: 168 }}>{label}</span>
        <svg aria-hidden width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}><path d="M7 10l5 5 5-5z" /></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: "min(320px, calc(100vw - 24px))", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 100, overflow: "hidden" }}>
          <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>MIDI 输入</div>
          {state.error && <div role="alert" className="px-3 py-2 text-xs" style={{ color: "var(--color-warning)", overflowWrap: "anywhere" }}>{state.error}</div>}
          {state.phase === "ready" && state.inputs.length === 0 && (
            <div className="px-3 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>浏览器目前没有列出 MIDI 输入。请确认键盘电源与 USB 连接，再点击重新检测。必要时关闭其他正在使用键盘的程序。</div>
          )}
          {state.phase === "ready" && state.inputs.length > 0 && !connected && !busy && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>已发现设备，请选择输入。连接成功后会记住你的选择。</div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
            {state.inputs.map((input) => (
              <li key={input.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void controller.current?.select(input.id); }}
                  aria-pressed={state.selectedId === input.id}
                  title={`${input.name}${input.manufacturer ? ` · ${input.manufacturer}` : ""}（端口 ${input.id}）`}
                  className="w-full text-left px-3 py-2 text-xs"
                  style={{ background: state.selectedId === input.id ? "var(--color-accent-subtle)" : "transparent", color: "var(--color-text)", border: "none", cursor: busy ? "wait" : "pointer", overflowWrap: "anywhere" }}
                >
                  {input.name}{state.selectedId === input.id ? " ✓" : state.openingId === input.id ? " · 正在连接…" : ""}
                  {state.inputs.filter((p) => p.name === input.name).length > 1 && <span style={{ display: "block", color: "var(--color-text-muted)" }}>端口 {input.id}</span>}
                </button>
              </li>
            ))}
          </ul>
          {connected && <div role="status" className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{state.lastNote === null ? "已连接，尚未收到按键。请弹一个音检查输入。" : `已收到按键：${noteName(state.lastNote)}`}</div>}
          <div className="px-3 py-2 flex items-center gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
            <button type="button" disabled={busy} onClick={() => { void controller.current?.retry(); }} className="text-xs" style={{ color: "var(--color-accent)", background: "transparent", border: 0, padding: "5px 0", cursor: busy ? "wait" : "pointer" }}>{state.phase === "error" ? "重试连接" : "重新检测"}</button>
            {connected && <button type="button" onClick={() => controller.current?.disconnect()} className="text-xs" style={{ color: "#f87171", background: "transparent", border: 0, padding: "5px 0", cursor: "pointer" }}>断开连接</button>}
          </div>
        </div>
      )}
    </div>
  );
}
