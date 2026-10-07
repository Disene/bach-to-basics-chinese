import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_STORAGE_KEY, sanitizeRememberedSettings, readRememberedSettings,
  serializeRememberedSettings, getPreferenceStorage, connectSettingsPersistence,
} from '../src/store/settingsPersistence.ts';

function defaults() {
  return {
    showFingering: false, showFingeringOnNotes: false, showHandColors: true,
    useFlats: false, metronomeEnabled: false, showGrid: false,
    showMeasureNums: true, showKeySignature: true, sheetMusicWhiteBackground: false,
    scrollToSeek: false, showBeatLines: false, showSustainPedal: false,
    showNoteOutline: false, showSustainedNotes: false,
    theme: 'light', layoutMode: 'falling', colorTheme: 'cascade',
    customColors: { leftHand: '#9333ea', rightHand: '#22d3ee', unknown: '#a855f7' },
    noteFilter: 'all', noteLabelMode: 'c_only', fallingNotesLabelMode: 'all',
    pianoTheme: 'white', impactStyle: 'bloom', instrument: 'grand',
    viewportSeconds: 4, minNoteHeight: 8, noteCornerRadius: 4, renderOffset: 0,
    countInBars: 0,
    // Song-specific/legacy fields in the actual AppSettings must not leak out.
    activeHands: new Set(['left', 'right']), handVolume: { left: 1, right: 1 },
    transposeSemitones: 0, waitForHand: 'both', volume: 0.8,
    speedTrainer: { enabled: false, startPct: 60, endPct: 100, stepPct: 5, currentPct: 60 },
  };
}
function memory(settings, version = 1) {
  const data = new Map(settings === undefined ? [] : [
    [SETTINGS_STORAGE_KEY, JSON.stringify({ version, settings })],
  ]);
  const writes = [];
  return { data, writes,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); data.set(key, value); },
  };
}
function fakeStore(initial = {}) {
  const listeners = new Set();
  const actions = [];
  let state;
  const set = (patch) => {
    const prev = state;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state, prev);
  };
  state = {
    status: 'stopped', currentSeconds: 0, tempoMultiplier: 1, waitMode: false,
    loopStart: null, loopEnd: null, document: null, midiDeviceName: null,
    sustainPedalDown: false, settings: { ...defaults(), ...initial },
    updateSettings: (patch) => {
      actions.push(['settings', patch]);
      set({ settings: { ...state.settings, ...patch } });
    },
    setMetronome: (on) => {
      actions.push(['metronome', on]);
      set({ settings: { ...state.settings, metronomeEnabled: on } });
    },
  };
  return { getState: () => state, set, actions, listeners,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
}

test('round-trips supported preferences through a versioned allowlist', () => {
  const storage = memory();
  storage.setItem(SETTINGS_STORAGE_KEY, serializeRememberedSettings(defaults()));
  assert.deepEqual(readRememberedSettings(storage), sanitizeRememberedSettings(defaults()));
});
test('does not store song content, per-song controls or live performance state', () => {
  const serialized = JSON.parse(serializeRememberedSettings({ ...defaults(),
    status: 'playing', currentSeconds: 35, document: { title: 'private', musicXml: 'secret' },
    midiDeviceName: 'private-device', sustainPedalDown: true, waitMode: true,
    loopStart: 5, loopEnd: 10, tempoMultiplier: 0.5, waitingMidis: [60],
  }));
  for (const key of ['status', 'currentSeconds', 'document', 'midiDeviceName',
    'sustainPedalDown', 'waitMode', 'loopStart', 'loopEnd', 'tempoMultiplier',
    'waitingMidis', 'activeHands', 'handVolume', 'speedTrainer',
    'transposeSemitones', 'waitForHand', 'volume']) {
    assert.equal(Object.hasOwn(serialized.settings, key), false, key);
  }
});
test('invalid boolean strings and numeric strings are not coerced', () => {
  assert.deepEqual(sanitizeRememberedSettings({ showFingering: 'false', viewportSeconds: '4' }), {});
});
test('valid enum values survive and invalid enums are dropped', () => {
  assert.deepEqual(sanitizeRememberedSettings({ theme: 'dark', layoutMode: 'sheet',
    colorTheme: 'custom', noteFilter: 'black', instrument: 'invalid', impactStyle: 'invalid' }),
  { theme: 'dark', layoutMode: 'sheet', colorTheme: 'custom', noteFilter: 'black' });
});
test('all five instrument values survive validation', () => {
  for (const instrument of ['grand', 'bright', 'electric', 'harpsichord', 'honkytonk']) {
    assert.equal(sanitizeRememberedSettings({ instrument }).instrument, instrument);
  }
});
test('finite numeric preferences are bounded to the existing control ranges', () => {
  assert.deepEqual(sanitizeRememberedSettings({ viewportSeconds: -1, minNoteHeight: 500,
    noteCornerRadius: -10, renderOffset: 700 }),
  { viewportSeconds: 2, minNoteHeight: 24, noteCornerRadius: 0, renderOffset: 200 });
});
test('NaN and infinity are dropped', () => {
  assert.deepEqual(sanitizeRememberedSettings({ viewportSeconds: NaN, renderOffset: Infinity }), {});
});
test('count-in accepts exactly zero, one or two bars', () => {
  for (const countInBars of [0, 1, 2]) assert.equal(sanitizeRememberedSettings({ countInBars }).countInBars, countInBars);
  for (const countInBars of [-1, 0.5, 3, '1', true]) assert.deepEqual(sanitizeRememberedSettings({ countInBars }), {});
});
test('colors are copied and require three valid hex values', () => {
  const colors = { leftHand: '#112233', rightHand: '#AaBbCc', unknown: '#987654' };
  const parsed = sanitizeRememberedSettings({ customColors: colors });
  assert.deepEqual(parsed.customColors, colors);
  assert.notEqual(parsed.customColors, colors);
  for (const customColors of [{ leftHand: '#112233' }, { ...colors, unknown: 'url(http://invalid)' }, []]) {
    assert.deepEqual(sanitizeRememberedSettings({ customColors }), {});
  }
});
test('unknown and prototype-looking fields are ignored', () => {
  assert.deepEqual(sanitizeRememberedSettings(JSON.parse('{"__proto__":{"polluted":true},"constructor":{},"theme":"dark"}')), { theme: 'dark' });
  assert.equal({}.polluted, undefined);
});
test('null, arrays and primitive envelopes are ignored', () => {
  for (const raw of ['null', '[]', '42', '"text"', 'true']) {
    const storage = memory(); storage.data.set(SETTINGS_STORAGE_KEY, raw);
    assert.deepEqual(readRememberedSettings(storage), {});
  }
});
test('malformed, too large or unsupported-version records do not break startup', () => {
  for (const raw of ['{', 'x'.repeat(32_769), '{"version":2,"settings":{"theme":"dark"}}']) {
    const storage = memory(); storage.data.set(SETTINGS_STORAGE_KEY, raw);
    const store = fakeStore(); assert.doesNotThrow(() => connectSettingsPersistence(store, storage));
    assert.equal(store.getState().settings.theme, 'light');
    assert.equal(storage.data.get(SETTINGS_STORAGE_KEY), raw);
  }
});
test('partial v1 data merges with existing defaults', () => {
  const store = fakeStore(); connectSettingsPersistence(store, memory({ noteLabelMode: 'none' }));
  assert.equal(store.getState().settings.noteLabelMode, 'none');
  assert.equal(store.getState().settings.viewportSeconds, 4);
  assert.equal(store.getState().settings.instrument, 'grand');
});
test('no full record preserves the existing legacy/system theme', () => {
  const store = fakeStore({ theme: 'dark' }); const storage = memory();
  storage.data.set('b2b-theme', 'dark');
  connectSettingsPersistence(store, storage);
  assert.equal(store.getState().settings.theme, 'dark');
  assert.equal(store.actions.length, 0);
});
test('hydration uses the existing instrument/offset/count-in action and dedicated metronome action', () => {
  const store = fakeStore(); const storage = memory({ instrument: 'electric', renderOffset: 45, countInBars: 1, metronomeEnabled: true });
  connectSettingsPersistence(store, storage);
  assert.deepEqual(store.actions, [
    ['settings', { instrument: 'electric', renderOffset: 45, countInBars: 1 }],
    ['metronome', true],
  ]);
  assert.equal(store.getState().status, 'stopped');
  assert.equal(store.getState().document, null);
  assert.equal(store.getState().sustainPedalDown, false);
  assert.equal(storage.writes.length, 0);
});
test('one genuine setting change is saved and restored on a simulated reload', () => {
  const store = fakeStore(); const storage = memory();
  connectSettingsPersistence(store, storage);
  store.getState().updateSettings({ layoutMode: 'sheet', showFingering: true, instrument: 'bright' });
  assert.equal(storage.writes.length, 1);
  const reopened = fakeStore(); connectSettingsPersistence(reopened, storage);
  assert.equal(reopened.getState().settings.layoutMode, 'sheet');
  assert.equal(reopened.getState().settings.showFingering, true);
  assert.equal(reopened.getState().settings.instrument, 'bright');
  assert.equal(reopened.getState().status, 'stopped');
});
test('playback ticks and live pedal messages do not write storage', () => {
  const store = fakeStore(); const storage = memory(); connectSettingsPersistence(store, storage);
  for (let i = 0; i < 120; i++) store.set({ currentSeconds: i / 60, sustainPedalDown: i % 2 === 0 });
  assert.equal(storage.writes.length, 0);
});
test('song-specific changes and same-value settings do not write storage', () => {
  const store = fakeStore(); const storage = memory(); connectSettingsPersistence(store, storage);
  store.getState().updateSettings({ instrument: 'grand' });
  store.getState().updateSettings({ activeHands: new Set(['left']), transposeSemitones: 2 });
  assert.equal(storage.writes.length, 0);
});
test('existing reset flow replaces saved settings, not the connected-device preference', () => {
  const store = fakeStore(); const storage = memory({ layoutMode: 'sheet', showSustainPedal: true });
  storage.data.set('b2b-midi-input-v1', 'keep-device');
  connectSettingsPersistence(store, storage);
  store.set({ settings: defaults() });
  assert.equal(readRememberedSettings(storage).layoutMode, 'falling');
  assert.equal(readRememberedSettings(storage).showSustainPedal, false);
  assert.equal(storage.data.get('b2b-midi-input-v1'), 'keep-device');
  const reopened = fakeStore(); connectSettingsPersistence(reopened, storage);
  assert.equal(reopened.getState().settings.layoutMode, 'falling');
});
test('read errors do not prevent editing current preferences', () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() {} };
  const store = fakeStore(); assert.doesNotThrow(() => connectSettingsPersistence(store, storage));
  store.getState().updateSettings({ layoutMode: 'sheet' });
  assert.equal(store.getState().settings.layoutMode, 'sheet');
});
test('quota failure does not interrupt updates and saving can recover later', () => {
  const storage = memory(); const original = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  const store = fakeStore(); connectSettingsPersistence(store, storage);
  assert.doesNotThrow(() => store.getState().updateSettings({ layoutMode: 'sheet' }));
  assert.equal(store.getState().settings.layoutMode, 'sheet');
  storage.setItem = original;
  store.getState().updateSettings({ showGrid: true });
  assert.equal(readRememberedSettings(storage).layoutMode, 'sheet');
});
test('cleanup removes its subscription and prevents duplicate saving', () => {
  const store = fakeStore(); const storage = memory();
  const cleanup = connectSettingsPersistence(store, storage);
  assert.equal(store.listeners.size, 1); cleanup(); cleanup();
  store.getState().updateSettings({ theme: 'dark' });
  assert.equal(storage.writes.length, 0); assert.equal(store.listeners.size, 0);
});
test('SSR and a blocked localStorage property are safe', () => {
  assert.equal(getPreferenceStorage(), undefined);
  const store = fakeStore(); connectSettingsPersistence(store, undefined)();
  globalThis.window = { get localStorage() { throw new Error('blocked'); } };
  try { assert.equal(getPreferenceStorage(), undefined); } finally { delete globalThis.window; }
});
