import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MidiConnection, MIDI_PREFERENCE_KEY, readMidiPreference, matchMidiPreference } from '../src/components/DevicePanel/midiConnection.ts';

const settle = () => new Promise((r) => setImmediate(r));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function port(id = 'a', name = 'Keystation 88 MK3') {
  return {
    id, name, manufacturer: 'M-Audio', connected: true, listeners: new Set(), opens: 0,
    isConnected() { return this.connected; },
    async open() { ++this.opens; if (this.error) throw this.error; if (this.delay) await this.delay; },
    listen(h) { this.listeners.add(h); return () => this.listeners.delete(h); },
    on(midi = 60, v = 90) { for (const h of this.listeners) h.noteOn(midi, v); },
    off(midi = 60) { for (const h of this.listeners) h.noteOff(midi); },
    pedal(down) { for (const h of this.listeners) h.pedal(down); },
  };
}
function setup(ports = [], saved = null) {
  const data = new Map(); if (saved) data.set(MIDI_PREFERENCE_KEY, JSON.stringify(saved));
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const driver = {
    supported: true, secure: true, ports, watchers: new Set(), enables: 0,
    async enable() { ++this.enables; if (this.error) throw this.error; if (this.delay) await this.delay; },
    inputs() { return this.ports; },
    watch(cb) { this.watchers.add(cb); return () => this.watchers.delete(cb); },
    change() { for (const cb of this.watchers) cb(); },
  };
  const calls = [], states = [];
  const sink = { async play(m, v) { calls.push(['play', m, v]); if (this.error) throw this.error; }, stop(m) { calls.push(['stop', m]); }, pedal(d) { calls.push(['pedal', d]); } };
  const controller = new MidiConnection(driver, sink, (s) => states.push(s), storage);
  return { controller, driver, sink, storage, calls, states };
}
const info = (p) => ({ id: p.id, name: p.name, manufacturer: p.manufacturer });

test('first visit enumerates available inputs without silently choosing one', async () => {
  const a = port(), b = port('b', 'Virtual MIDI'); const x = setup([a, b]);
  await x.controller.start();
  assert.equal(x.controller.state.phase, 'ready'); assert.equal(x.controller.state.inputs.length, 2);
  assert.equal(x.controller.state.selectedId, null); assert.equal(a.opens, 0);
});
test('empty list is distinct from permission failure and is retryable', async () => {
  const x = setup(); await x.controller.start(); assert.equal(x.controller.state.error, null);
  x.driver.ports = [port()]; await x.controller.retry(); assert.equal(x.controller.state.inputs.length, 1);
});
test('a manual choice opens the exact id, including duplicate names', async () => {
  const a = port('a'), b = port('b'); const x = setup([a, b]);
  await x.controller.start(); await x.controller.select('b');
  assert.equal(x.controller.state.selectedId, 'b'); assert.equal(a.opens, 0); assert.equal(b.opens, 1);
  assert.equal(readMidiPreference(x.storage).id, 'b');
});
test('last deliberately selected device is restored after a new controller mounts', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start();
  assert.equal(x.controller.state.selectedId, a.id);
});
test('changed id can restore only a unique exact name and manufacturer', () => {
  const original = port('old'), fresh = port('new');
  assert.equal(matchMidiPreference([fresh], info(original)), fresh);
  assert.equal(matchMidiPreference([fresh, port('third')], info(original)), null);
  assert.equal(matchMidiPreference([port('b', 'Other device')], info(original)), null);
});
test('corrupt or blocked local storage cannot break connection', async () => {
  const x = setup([port()]); x.storage.setItem(MIDI_PREFERENCE_KEY, '{broken');
  assert.equal(readMidiPreference(x.storage), null);
  assert.equal(readMidiPreference({ getItem() { throw new Error('blocked'); } }), null);
  await x.controller.start(); x.storage.setItem = () => { throw new Error('quota'); };
  await x.controller.select('a'); assert.equal(x.controller.state.selectedId, 'a');
});
test('missing remembered input never auto-switches to an unrelated input', async () => {
  const x = setup([port('b', 'Virtual MIDI')], info(port()));
  await x.controller.start(); assert.equal(x.controller.state.selectedId, null);
});
test('note-on/off and CC64 continue through existing audio and wait-mode sink', async () => {
  const a = port(); const x = setup([a]); await x.controller.start(); await x.controller.select('a');
  assert.equal(x.controller.state.pedal, null);
  a.on(64, 90); a.pedal(true); a.off(64); a.pedal(false);
  assert.deepEqual(x.calls, [['play', 64, 90], ['pedal', true], ['stop', 64], ['pedal', false]]);
  assert.equal(x.controller.state.lastNote, 64); assert.equal(x.controller.state.pedal, false);
});
test('zero-velocity note-on is a release, never a new target hit', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start(); a.on(60, 0);
  assert.deepEqual(x.calls, [['stop', 60]]);
});
test('physical disconnect removes listeners and releases held notes and pedal', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start(); a.on(); a.pedal(true);
  a.connected = false; x.driver.ports = []; x.driver.change(); await settle();
  assert.equal(x.controller.state.selectedId, null); assert.equal(x.controller.state.pedal, null);
  assert.equal(a.listeners.size, 0); assert.deepEqual(x.calls.slice(-2), [['pedal', false], ['stop', 60]]);
  assert.equal(readMidiPreference(x.storage).id, 'a');
});
test('replug binds new port object even when id stays the same', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start();
  a.connected = false; x.driver.ports = []; x.driver.change(); await settle();
  const replacement = port(); x.driver.ports = [replacement]; x.driver.change(); await settle();
  replacement.on(); assert.equal(x.controller.state.selectedId, 'a');
  assert.equal(replacement.listeners.size, 1); assert.equal(a.listeners.size, 0);
  assert.deepEqual(x.calls.at(-1), ['play', 60, 90]);
});
test('intentional disconnect stays disconnected on refresh and future startup', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start();
  x.controller.disconnect(); await x.controller.retry(); x.driver.change(); await settle();
  assert.equal(x.controller.state.selectedId, null); assert.equal(readMidiPreference(x.storage), null);
});
test('repeated selection and re-enumeration cannot duplicate note listeners', async () => {
  const a = port(); const x = setup([a]); await x.controller.start();
  await x.controller.select('a'); await x.controller.select('a'); await x.controller.retry();
  x.driver.change(); await settle(); a.on();
  assert.equal(a.listeners.size, 1); assert.equal(x.calls.filter((v) => v[0] === 'play').length, 1);
});
test('permission rejection stays visible and can be retried in the same page', async () => {
  const x = setup([port()]); x.driver.error = new DOMException('Denied', 'NotAllowedError');
  await x.controller.start(); assert.equal(x.controller.state.phase, 'error');
  assert.match(x.controller.state.error, /权限/);
  x.driver.error = null; await x.controller.retry(); assert.equal(x.controller.state.phase, 'ready');
});
test('unsupported and insecure contexts show explanations without asking for access', async () => {
  for (const key of ['supported', 'secure']) {
    const x = setup(); x.driver[key] = false; await x.controller.start();
    assert.equal(x.driver.enables, 0); assert.equal(x.controller.state.phase, 'error');
  }
});
test('a failed port open is not falsely shown as connected or retried forever', async () => {
  const a = port(); a.error = new Error('busy'); const x = setup([a], info(a));
  await x.controller.start(); assert.equal(x.controller.state.selectedId, null); assert.match(x.controller.state.error, /无法打开/);
  x.driver.change(); await settle(); assert.equal(a.opens, 1);
  a.error = null; await x.controller.retry(); assert.equal(x.controller.state.selectedId, 'a');
});
test('late open completion cannot overwrite a newer manual choice', async () => {
  const a = port(), b = port('b', 'Other input'), wait = deferred(); a.delay = wait.promise;
  const x = setup([a, b]); await x.controller.start(); const first = x.controller.select('a');
  await x.controller.select('b'); wait.resolve(); await first;
  assert.equal(x.controller.state.selectedId, 'b'); assert.equal(a.listeners.size, 0);
});
test('disconnect during open cancels the pending choice', async () => {
  const a = port(), wait = deferred(); a.delay = wait.promise;
  const x = setup([a]); await x.controller.start(); const task = x.controller.select('a');
  x.controller.disconnect(); wait.resolve(); await task;
  assert.equal(x.controller.state.selectedId, null); assert.equal(a.listeners.size, 0);
});
test('late enable completion after unmount does not register global listeners', async () => {
  const x = setup([port()]), wait = deferred(); x.driver.delay = wait.promise;
  const task = x.controller.start(); x.controller.dispose(); const count = x.states.length;
  wait.resolve(); await task; assert.equal(x.driver.watchers.size, 0); assert.equal(x.states.length, count);
});
test('dispose while opening prevents late note subscriptions', async () => {
  const a = port(), wait = deferred(); a.delay = wait.promise;
  const x = setup([a]); await x.controller.start(); const task = x.controller.select('a');
  x.controller.dispose(); wait.resolve(); await task; assert.equal(a.listeners.size, 0);
});
test('sound failure is handled separately from input discovery', async () => {
  const a = port(); const x = setup([a], info(a)); await x.controller.start();
  x.sink.error = new Error('sample unavailable'); a.on(); await settle();
  assert.equal(x.controller.state.selectedId, 'a'); assert.match(x.controller.state.error, /已收到 MIDI 按键/);
});
test('selected input listener removal does not remove another subscriber', async () => {
  const a = port(), external = {}; a.listeners.add(external);
  const x = setup([a], info(a)); await x.controller.start(); x.controller.dispose();
  assert.deepEqual([...a.listeners], [external]);
});
