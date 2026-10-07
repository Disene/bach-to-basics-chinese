/**
 * Wait-mode input buffer; integrated with the existing onset-driven engine.
 * Inspired by the early-input requirement in gigliof/bach-to-basics PR #45;
 * implemented separately to preserve the Chinese fork's onset-driven engine.
 * No device I/O, audio, storage, scoring, or React dependencies.
 */
export class EarlyWaitBuffer {
  private groups = new Map<number, { pitches: Set<number>; hits: Set<number> }>();

  constructor(readonly windowSeconds = 0.15) {
    if (!Number.isFinite(windowSeconds) || windowSeconds < 0 || windowSeconds > 0.3) {
      throw new RangeError("Early-input window must be between 0 and 0.3 seconds");
    }
  }

  register(onset: number, midi: number): void {
    if (!Number.isFinite(onset) || onset < 0 || !Number.isInteger(midi) || midi < 0 || midi > 127) {
      throw new RangeError("Invalid onset or MIDI pitch");
    }
    let group = this.groups.get(onset);
    if (!group) {
      group = { pitches: new Set(), hits: new Set() };
      this.groups.set(onset, group);
    }
    group.pitches.add(midi);
  }

  /** Call only for positive note-on input during playing (never during count-in). */
  credit(midi: number, velocity: number, documentSeconds: number, speed: number): boolean {
    if (!Number.isInteger(midi) || !Number.isFinite(velocity) || velocity <= 0 ||
        !Number.isFinite(documentSeconds) || !Number.isFinite(speed) || speed <= 0) return false;
    // Always target the next practiced onset, even when its chord is already
    // fully credited. One repeated key press must not pre-clear a later onset.
    let next = Infinity;
    for (const onset of this.groups.keys()) next = Math.min(next, onset);
    if (!Number.isFinite(next)) return false;
    const group = this.groups.get(next)!;
    const lead = (next - documentSeconds) / speed;
    if (lead < -1e-9 || lead > this.windowSeconds + 1e-9 || !group.pitches.has(midi)) return false;
    group.hits.add(midi);
    return true;
  }

  /** Called at the actual onset. Missing/cleared data never skips required notes. */
  consume(onset: number, currentlyRequired: ReadonlySet<number>): Set<number> {
    const hits = this.groups.get(onset)?.hits;
    this.groups.delete(onset);
    return new Set([...currentlyRequired].filter(midi => !hits?.has(midi)));
  }

  /** Clear on seek, stop, pause, document/mode/transpose/hand-policy changes. */
  clear(): void {
    this.groups.clear();
  }
}
