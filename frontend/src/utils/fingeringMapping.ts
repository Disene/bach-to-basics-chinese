import type { Finger, NoteEvent } from "@bach-to-basics/shared";

export interface FingeringMark {
  midi: number;
  hand: "left" | "right";
  finger: Finger | null;
}

/**
 * Match MusicXML fingering marks back onto the MIDI NoteEvents used by playback.
 *
 * - Known-hand notes consume from the same hand + pitch queue.
 * - Single-track MIDI notes use hand="unknown" and consume from a pitch-only queue.
 * - One XML mark can never be assigned twice.
 */
export function applyFingeringMarks(notes: NoteEvent[], marks: FingeringMark[]): NoteEvent[] {
  const byHandPitch = new Map<string, FingeringMark[]>();
  const byPitch = new Map<number, FingeringMark[]>();

  for (const mark of marks) {
    const handKey = `${mark.hand}:${mark.midi}`;
    const handQueue = byHandPitch.get(handKey) ?? [];
    handQueue.push(mark);
    byHandPitch.set(handKey, handQueue);

    const pitchQueue = byPitch.get(mark.midi) ?? [];
    pitchQueue.push(mark);
    byPitch.set(mark.midi, pitchQueue);
  }

  const consumed = new Set<FingeringMark>();
  const takeNext = (queue: FingeringMark[] | undefined): FingeringMark | undefined => {
    if (!queue) return undefined;
    while (queue.length > 0 && consumed.has(queue[0])) queue.shift();
    const mark = queue.shift();
    if (mark) consumed.add(mark);
    return mark;
  };

  return notes.map((note) => {
    const mark =
      note.hand === "unknown"
        ? takeNext(byPitch.get(note.midi))
        : takeNext(byHandPitch.get(`${note.hand}:${note.midi}`));
    return mark ? { ...note, finger: mark.finger } : { ...note };
  });
}
