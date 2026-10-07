import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicDocument, NoteEvent } from "@bach-to-basics/shared";

const scheduled = vi.hoisted(() => [] as Array<() => void>);
const mockTransport = vi.hoisted(() => ({
  seconds: 0,
  bpm: { value: 120 },
  state: "started" as "started" | "stopped" | "paused",
  cancel: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  scheduleRepeat: vi.fn(),
  scheduleOnce: vi.fn((cb: () => void, _time: string) => {
    scheduled.push(cb);
    return scheduled.length;
  }),
}));

vi.mock("tone", () => ({
  getTransport: () => mockTransport,
  start: vi.fn().mockResolvedValue(undefined),
  Synth: class {
    toDestination() { return this; }
    triggerAttackRelease() {}
  },
}));

const audioInstances = vi.hoisted(() => [] as Array<{
  load: ReturnType<typeof vi.fn>;
  wake: ReturnType<typeof vi.fn>;
  playNote: ReturnType<typeof vi.fn>;
  playMidi: ReturnType<typeof vi.fn>;
  stopNote: ReturnType<typeof vi.fn>;
  stopAll: ReturnType<typeof vi.fn>;
  setInstrument: ReturnType<typeof vi.fn>;
}>);

vi.mock("../engine/AudioEngine", () => ({
  AudioEngine: class {
    load = vi.fn().mockResolvedValue(undefined);
    wake = vi.fn().mockResolvedValue(undefined);
    playNote = vi.fn();
    playMidi = vi.fn();
    stopNote = vi.fn();
    stopAll = vi.fn();
    setInstrument = vi.fn().mockResolvedValue(undefined);
    constructor() {
      audioInstances.push(this as unknown as (typeof audioInstances)[number]);
    }
  },
}));

import { SyncEngine } from "../engine/SyncEngine";

function note(id: string, midi: number, startSeconds: number, hand: "left" | "right" | "unknown" = "right"): NoteEvent {
  return {
    id,
    midi,
    pitch: "C4",
    startTick: 0,
    durationTick: 480,
    startSeconds,
    endSeconds: startSeconds + 1,
    hand,
    finger: null,
    velocity: 80,
    channel: 0,
  };
}

function doc(notes: NoteEvent[]): MusicDocument {
  return {
    id: "test",
    title: "test",
    sourceType: "midi",
    musicXml: null,
    midiBuffer: null,
    notes,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    totalDuration: 10,
    ppq: 480,
    keySignature: null,
    youtubeId: null,
    youtubeSyncOffset: 0,
    fingeringVersion: "none",
  };
}

type TestEngineInternals = {
  _state: { status: "stopped" | "playing" | "paused" | "waiting" };
  onTick(seconds: number): void;
};

describe("SyncEngine wait mode", () => {
  beforeEach(() => {
    scheduled.length = 0;
    audioInstances.length = 0;
    mockTransport.seconds = 0;
    mockTransport.cancel.mockClear();
    mockTransport.start.mockClear();
    mockTransport.pause.mockClear();
    mockTransport.stop.mockClear();
    mockTransport.scheduleRepeat.mockClear();
    mockTransport.scheduleOnce.mockClear();
  });

  it("waits at the actual onset and resumes only after the expected note", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("n1", 60, 1)]));
    engine.setWaitMode(true);

    const testEngine = engine as unknown as TestEngineInternals;
    testEngine._state.status = "playing";
    testEngine.onTick(0);

    expect(scheduled.length > 0).toBe(true); // Work is scheduled, but not yet fired.
    expect(engine.state.status).toBe("playing");

    scheduled[0]();
    expect(engine.state.status).toBe("waiting");
    expect(audioInstances[0].playNote).not.toHaveBeenCalled();

    engine.onMidiInput(61, 80);
    expect(engine.state.status).toBe("waiting");

    engine.onMidiInput(60, 80);
    expect(engine.state.status).toBe("playing");
    expect(mockTransport.start).toHaveBeenCalled();
  });

  it("waits for every pitch in a chord before resuming", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([
      note("c", 60, 1),
      note("e", 64, 1),
      note("g", 67, 1),
    ]));
    engine.setWaitMode(true);

    const testEngine = engine as unknown as TestEngineInternals;
    testEngine._state.status = "playing";
    testEngine.onTick(0);

    expect(scheduled.length > 0).toBe(true); // Chord semantics, not callback count.
    scheduled[0]();
    expect(engine.state.status).toBe("waiting");

    engine.onMidiInput(60, 80);
    engine.onMidiInput(64, 80);
    expect(engine.state.status).toBe("waiting");

    engine.onMidiInput(67, 80);
    expect(engine.state.status).toBe("playing");
  });

  it("keeps live notes sounding while CC64 is down and releases them on pedal-up", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([]));

    engine.setSustainPedal(true);
    expect(engine.state.sustainPedalDown).toBe(true);

    await engine.playMidi(60, 90);
    engine.stopMidi(60);
    expect(audioInstances[0].stopNote).not.toHaveBeenCalled();

    engine.setSustainPedal(false);
    expect(engine.state.sustainPedalDown).toBe(false);
    expect(audioInstances[0].stopNote).toHaveBeenCalledWith(60);
  });

  it("separates visual note-off from source-MIDI sustain audio release", async () => {
    const engine = new SyncEngine();
    const source = doc([note("n1", 60, 1)]);
    source.sustainRanges = [{ startSeconds: 0.5, endSeconds: 3 }];
    await engine.loadDocument(source);

    const testEngine = engine as unknown as TestEngineInternals;
    testEngine._state.status = "playing";
    testEngine.onTick(0);

    expect(scheduled.length).toBe(3); // note-on + visual note-off + sustained audio off
    scheduled[0]();
    expect(audioInstances[0].playNote).toHaveBeenCalled();

    scheduled[1]();
    expect(audioInstances[0].stopNote).not.toHaveBeenCalled();

    scheduled[2]();
    expect(audioInstances[0].stopNote).toHaveBeenCalledWith(60, "n1");
  });

  it("matches the transposed pitch instead of the source MIDI pitch", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("n1", 60, 1)]));
    engine.setTranspose(2);
    engine.setWaitMode(true);

    const testEngine = engine as unknown as TestEngineInternals;
    testEngine._state.status = "playing";
    testEngine.onTick(0);

    scheduled[0]();
    expect(engine.state.status).toBe("waiting");

    engine.onMidiInput(60, 80);
    expect(engine.state.status).toBe("waiting");

    engine.onMidiInput(62, 80);
    expect(engine.state.status).toBe("playing");
  });

  for (const disabled of ["left", "right"] as const) {
    it(`uses current hand selection at onset when ${disabled} is disabled after scheduling`, async () => {
      const engine = new SyncEngine();
      await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
      engine.setWaitMode(true);
      const internal = engine as unknown as TestEngineInternals;
      internal._state.status = "playing";
      internal.onTick(0); // Five-second lookahead is already scheduled.
      engine.setActiveHands(new Set(disabled === "left" ? ["right"] : ["left"]));
      scheduled[0]();
      expect(engine.state.status).toBe("waiting");
      engine.onMidiInput(disabled === "left" ? 72 : 48, 80);
      expect(engine.state.status).toBe("playing"); // No obsolete other-hand target.
      expect(audioInstances[0].playNote).not.toHaveBeenCalled();
    });
  }

  it("re-enabling a hand after lookahead makes it a target, not an autoplay note", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    engine.setWaitMode(true);
    engine.setActiveHands(new Set(["left"]));
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    engine.setActiveHands(new Set(["left", "right"]));
    scheduled[0]();
    engine.onMidiInput(48, 80);
    expect(engine.state.status).toBe("waiting");
    engine.onMidiInput(72, 80);
    expect(engine.state.status).toBe("playing");
    expect(audioInstances[0].playNote).not.toHaveBeenCalled();
  });

  it("uses the latest wait hand and plays same-onset accompaniment before pausing", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    engine.setWaitMode(true);
    engine.setWaitForHand("left");
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    engine.setWaitForHand("right");
    scheduled[0]();
    expect(audioInstances[0].playNote.mock.calls.map(([n]) => n.id)).toEqual(["left"]);
    expect(engine.state.status).toBe("waiting");
    engine.onMidiInput(72, 80);
    expect(engine.state.status).toBe("playing");
  });

  it("removes a disabled target from an already-waiting chord without losing correct hits", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("c", 60, 1), note("e", 64, 1)]));
    engine.setWaitMode(true);
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    engine.onMidiInput(60, 80);
    engine.setActiveHands(new Set(["right"]));
    expect(engine.state.status).toBe("waiting");
    engine.onMidiInput(64, 80);
    expect(engine.state.status).toBe("playing");
  });

  it("refreshes the current waiting chord when wait-for-hand changes", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    engine.setWaitMode(true);
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    engine.onMidiInput(48, 80);
    engine.setWaitForHand("left");
    expect(engine.state.status).toBe("playing");
    expect(engine.state.activeHands.has("right")).toBe(true); // Separate settings.
  });

  it("does not resume a manually paused transport when the hand selection changes", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    engine.setWaitMode(true);
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    engine.pause();
    mockTransport.start.mockClear();
    engine.setActiveHands(new Set(["left"]));
    engine.setWaitForHand("right");
    expect(engine.state.status).toBe("paused");
    expect(mockTransport.start).not.toHaveBeenCalled();
  });

  it("zero hand volume emits no score audio, while the other hand keeps its volume", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    engine.setHandVolume({ left: 0, right: 0.5 });
    // The pre-fix engine used two callbacks at the same onset. Execute all such
    // callbacks rather than assuming a particular number of scheduler entries.
    for (const [callback, delay] of mockTransport.scheduleOnce.mock.calls) {
      if (delay === "+1") callback();
    }
    expect(audioInstances[0].playNote.mock.calls.map(([n]) => [n.id, n.velocity])).toEqual([["right", 40]]);
  });

  it("zero volume does not remove a hand from the waiting target", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left")]));
    engine.setWaitMode(true);
    engine.setHandVolume({ left: 0, right: 1 });
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    expect(engine.state.status).toBe("waiting");
    engine.onMidiInput(48, 80);
    expect(engine.state.status).toBe("playing");
  });

  for (const method of ["hand-off", "zero-volume"] as const) {
    it(`immediately releases a ringing score-CC64 tail for ${method}, not the live key`, async () => {
      const engine = new SyncEngine();
      const source = doc([note("left", 60, 1, "left"), note("right", 72, 1, "right")]);
      source.sustainRanges = [{ startSeconds: 0, endSeconds: 5 }];
      await engine.loadDocument(source);
      const internal = engine as unknown as TestEngineInternals;
      internal._state.status = "playing";
      internal.onTick(0);
      for (const [callback, delay] of mockTransport.scheduleOnce.mock.calls) {
        if (delay === "+1" || delay === "+2") callback();
      }
      engine.setSustainPedal(true);
      await engine.playMidi(60, 90);
      engine.stopMidi(60);
      audioInstances[0].stopNote.mockClear();
      audioInstances[0].stopAll.mockClear();
      if (method === "hand-off") engine.setActiveHands(new Set(["right"]));
      else engine.setHandVolume({ left: 0, right: 1 });
      expect(audioInstances[0].stopNote.mock.calls).toEqual([[60, "left"]]);
      expect(audioInstances[0].stopAll).not.toHaveBeenCalled();
      expect(engine.state.sustainPedalDown).toBe(true);
      engine.setSustainPedal(false);
      expect(audioInstances[0].stopNote).toHaveBeenCalledWith(60);
    });
  }

  it("does not overwrite volume or wait preference when toggling score hands", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([]));
    engine.setHandVolume({ left: 0.3, right: 0.6 });
    engine.setWaitForHand("right");
    engine.setActiveHands(new Set(["left"]));
    engine.setActiveHands(new Set(["left", "right"]));
    expect(engine.state.handVolume).toEqual({ left: 0.3, right: 0.6 });
    expect(engine.state.waitForHand).toBe("right");
    expect(engine.state.status).toBe("stopped");
  });

  it("clears old waiting context after seek/stop and does not revive it on a hand change", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("left", 48, 1, "left"), note("right", 72, 1, "right")]));
    engine.setWaitMode(true);
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    engine.seek(6);
    engine.stop();
    mockTransport.start.mockClear();
    engine.setWaitForHand("left");
    engine.setActiveHands(new Set(["left"]));
    engine.onMidiInput(48, 80);
    expect(engine.state.status).toBe("stopped");
    expect(mockTransport.start).not.toHaveBeenCalled();
  });

  it("unknown-hand notes retain existing behavior instead of guessing from pitch", async () => {
    const engine = new SyncEngine();
    await engine.loadDocument(doc([note("unknown", 20, 1, "unknown")]));
    engine.setActiveHands(new Set(["right"]));
    engine.setHandVolume({ left: 0, right: 0 });
    const internal = engine as unknown as TestEngineInternals;
    internal._state.status = "playing";
    internal.onTick(0);
    scheduled[0]();
    expect(audioInstances[0].playNote.mock.calls.map(([n]) => n.id)).toEqual(["unknown"]);
  });
});
