import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import {
  PRACTICE_STORAGE_KEY, defaultPractice, sanitizePractice, capturePractice,
  practiceKey, connectPracticeMemory as installMemory,
} from '../src/store/practiceMemory.ts';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
// Deterministic digest scheduling for lifecycle tests; actual Web Crypto keys
// are tested directly in the first three cases. Deferred cases control races.
const connectPracticeMemory = (store, options = {}) => installMemory(store, {
  keyForDocument: async d => {
    const xml = d.sourceType === 'musicxml' ? d.musicXml : null;
    const data = xml ?? (d.midiBuffer && new Uint8Array(d.midiBuffer));
    if (!data) throw Error('No source');
    return (xml ? 'xml:' : 'midi:') + createHash('sha256').update(data).digest('hex');
  }, ...options,
});
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
const doc = (id, source = id, extra = {}) => ({ id, title: 'same title', sourceType: 'midi',
  musicXml: null, midiBuffer: new TextEncoder().encode(source).buffer,
  totalDuration: 60, notes: [{}], ...extra });
function storage(initial) {
  const map = new Map(initial ? [[PRACTICE_STORAGE_KEY, initial]] : []);
  const writes = [];
  return { map, writes, getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); writes.push([k,v]); } };
}
function fakeStore() {
  const listeners = new Set(), calls = []; let state;
  const set = patch => { const prev = state; state = { ...state, ...patch }; for (const cb of listeners) cb(state, prev); };
  const d = defaultPractice();
  state = { document: null, isLoadingDocument: false, status: 'stopped', currentSeconds: 0,
    tempoMultiplier: 1, loopStart: null, loopEnd: null, waitMode: false,
    settings: { theme: 'dark', instrument: 'bright', activeHands: new Set(d.activeHands),
      handVolume: d.handVolume, waitForHand: 'both', transposeSemitones: 0,
      speedTrainer: { ...d.speedTrainer, currentPct: 60 } },
    updateSettings(patch) { calls.push(['settings',patch]); set({ settings: { ...state.settings, ...patch } }); },
    setTempoMultiplier(value) { calls.push(['tempo', value]); set({ tempoMultiplier: value }); },
    setActiveHands(hands) { calls.push(['hands', [...hands]]); set({ settings: { ...state.settings, activeHands: hands } }); },
    setWaitMode(value) { calls.push(['wait',value]); set({ waitMode: value }); },
    setLoopPoints(a,b) { calls.push(['loop',a,b]); set({ loopStart:a,loopEnd:b }); },
    seek(value) { calls.push(['seek',value]); set({ currentSeconds: value }); },
  };
  const load = (d) => {
    set({ isLoadingDocument: true }); set({ document: d });
    // Reproduce the current application's set(document) -> loadDocument(stop)
    // -> finally(isLoading=false) order.
    set({ status: 'stopped', currentSeconds: 0 }); set({ isLoadingDocument: false });
  };
  return { getState: () => state, calls, set, load, listeners,
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); } };
}
const rows = s => JSON.parse(s.getItem(PRACTICE_STORAGE_KEY) ?? '{"entries":{}}').entries;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return {promise,resolve,reject}; };
const hashA = 'midi:' + 'a'.repeat(64), hashB = 'midi:' + 'b'.repeat(64);

test('same content renamed or reimported has stable identity; same title different bytes does not', async () => {
  assert.equal(await practiceKey(doc('a','notes')), await practiceKey(doc('b','notes',{ title:'renamed' })));
  assert.notEqual(await practiceKey(doc('a','notes')), await practiceKey(doc('b','other-notes')));
});
test('XML uses original XML, not generated MIDI or random document id', async () => {
  const a=doc('a','x',{sourceType:'musicxml',musicXml:'<score>one</score>'});
  const b=doc('b','y',{sourceType:'musicxml',musicXml:a.musicXml});
  assert.equal(await practiceKey(a), await practiceKey(b));
  assert.notEqual(await practiceKey(a), await practiceKey({...b,musicXml:'<score>two</score>'}));
});
test('missing stable source fails explicitly', async () => {
  await assert.rejects(practiceKey(doc('a','',{ midiBuffer:null, musicXml:null })));
});
test('sanitizes ranges, boundaries and no live state', () => {
  const p=sanitizePractice({ ...defaultPractice(), position:10, tempoMultiplier:99,
    loopStart:12,loopEnd:8,activeHands:[],handVolume:{left:-3,right:Infinity},
    transposeSemitones:22,status:'playing',sustainPedalDown:true,currentPct:199 },60);
  assert.equal(p.tempoMultiplier,2);assert.equal(p.loopStart,null);assert.equal(p.loopEnd,null);
  assert.deepEqual(p.activeHands,['left','right']);assert.deepEqual(p.handVolume,{left:0,right:1});
  assert.equal(p.transposeSemitones,6);assert.equal('status' in p,false);assert.equal('currentPct' in p.speedTrainer,false);
});
test('completed piece reopens at beginning', () => assert.equal(sanitizePractice({position:60},60).position,0));
test('new piece does not inherit previous loops, hands or speed; global settings stay', async () => {
  const s=fakeStore(), st=storage(), c=connectPracticeMemory(s,{storage:st});
  s.load(doc('A'));await settle();
  s.getState().setTempoMultiplier(.6);s.getState().setLoopPoints(8,16);s.getState().setActiveHands(new Set(['left']));
  s.load(doc('B'));await settle();
  assert.equal(s.getState().tempoMultiplier,1);assert.equal(s.getState().loopStart,null);
  assert.deepEqual([...s.getState().settings.activeHands],['left','right']);assert.equal(s.getState().settings.theme,'dark');
  c.dispose();
});
test('reimport restores tempo, loop, position, hands, wait preference and volume without playing', async () => {
  const st=storage(), s=fakeStore(), c=connectPracticeMemory(s,{storage:st});s.load(doc('A','notes'));await settle();
  const a=s.getState();a.setTempoMultiplier(.7);a.setLoopPoints(5,15);a.setActiveHands(new Set(['right']));a.setWaitMode(true);
  a.updateSettings({handVolume:{left:.4,right:0},waitForHand:'right',transposeSemitones:2});a.seek(8);c.dispose();
  const reopened=fakeStore(), calls=[];const r=connectPracticeMemory(reopened,{storage:st,notice:n=>calls.push(n)});
  reopened.load(doc('new-id','notes'));await settle();
  const x=reopened.getState();assert.equal(x.tempoMultiplier,.7);assert.equal(x.currentSeconds,8);
  assert.equal(x.loopStart,5);assert.equal(x.loopEnd,15);assert.equal(x.waitMode,true);
  assert.equal(x.settings.waitForHand,'right');assert.equal(x.settings.transposeSemitones,2);
  assert.deepEqual(x.settings.handVolume,{left:.4,right:0});assert.deepEqual([...x.settings.activeHands],['right']);
  assert.equal(x.status,'stopped');assert.ok(calls.includes('restored'));r.dispose();
});
test('XML placeholder is not restored until MIDI notes/engine loading have settled', async () => {
  const s=fakeStore(), st=storage(), c=connectPracticeMemory(s,{storage:st});
  const stub=doc('x','',{sourceType:'musicxml',musicXml:'<score/>',notes:[],totalDuration:0,midiBuffer:null});
  s.load(stub);await settle();assert.equal(s.calls.length,0);
  s.set({document:{...stub,notes:[{}],totalDuration:60,midiBuffer:new ArrayBuffer(1)}});
  s.set({currentSeconds:0,status:'stopped'});assert.equal(s.calls.length,0);
  await settle();assert.ok(s.calls.some(x=>x[0]==='seek'));c.dispose();
});
test('late MIDI-to-XML and fingering updates do not create another memory identity', async () => {
  let hashes=0;const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st,keyForDocument:async()=>{hashes++;return hashA;}});
  s.load(doc('A'));await settle();s.getState().seek(8);
  s.set({document:{...s.getState().document,musicXml:'converted',notes:[{finger:2}]}});await settle();
  assert.equal(hashes,1);assert.equal(s.getState().currentSeconds,8);c.dispose();
});
test('slow hash for an older document cannot overwrite new song', async () => {
  const da=deferred(), db=deferred(),s=fakeStore(),st=storage();
  const c=connectPracticeMemory(s,{storage:st,keyForDocument:d=>d.id==='A'?da.promise:db.promise});
  s.load(doc('A'));await settle();s.load(doc('B'));await settle();db.resolve(hashB);await settle();
  s.getState().setTempoMultiplier(.8);da.resolve(hashA);await settle();
  assert.equal(s.getState().tempoMultiplier,.8);assert.equal(s.getState().document.id,'B');c.dispose();
});
test('a user setting changed while hashing is not overwritten by late restoration', async () => {
  const d=deferred(),s=fakeStore(),st=storage();const c=connectPracticeMemory(s,{storage:st,keyForDocument:()=>d.promise});
  s.load(doc('A'));await settle();s.getState().setTempoMultiplier(.5);d.resolve(hashA);await settle();
  assert.equal(s.getState().tempoMultiplier,.5);c.dispose();
});
test('user playback during hashing is never paused or repositioned', async () => {
  const d=deferred(),s=fakeStore(),st=storage();const c=connectPracticeMemory(s,{storage:st,keyForDocument:()=>d.promise});
  s.load(doc('A'));await settle();s.set({status:'playing',currentSeconds:3});d.resolve(hashA);await settle();
  assert.equal(s.getState().status,'playing');assert.equal(s.getState().currentSeconds,3);assert.equal(s.calls.length,0);c.dispose();
});
test('disposal during hash does not call store actions', async () => {
  const d=deferred(),s=fakeStore(),c=connectPracticeMemory(s,{storage:storage(),keyForDocument:()=>d.promise});
  s.load(doc('A'));await settle();c.dispose();d.resolve(hashA);await settle();assert.equal(s.calls.length,0);
});
test('changed duration for same content drops stale loop/position', async () => {
  const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});
  s.load(doc('A'));await settle();s.getState().setLoopPoints(50,59);s.getState().seek(51);c.dispose();
  const s2=fakeStore(),c2=connectPracticeMemory(s2,{storage:st});s2.load(doc('B','A',{totalDuration:20}));await settle();
  assert.equal(s2.getState().loopEnd,null);assert.equal(s2.getState().currentSeconds,0);c2.dispose();
});
test('playback writes are throttled; pause flushes position', async () => {
  let time=0;const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st,now:()=>time});
  s.load(doc('A'));await settle();s.set({status:'playing'});const before=st.writes.length;
  for(let i=1;i<=100;i++){time=i*10;s.set({currentSeconds:i/100});}
  assert.equal(st.writes.length,before);s.set({status:'paused'});assert.equal(st.writes.length,before+1);
  assert.equal(Object.values(rows(st))[0].practice.position,1);c.dispose();
});
test('document switch flushes previous song, not newly reset zero', async () => {
  let time=0;const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st,now:()=>time});
  s.load(doc('A'));await settle();s.set({status:'playing',currentSeconds:8});time=100;
  s.set({currentSeconds:9});s.load(doc('B'));await settle();
  assert.equal(rows(st)[await practiceKey(doc('A'))].practice.position,9);c.dispose();
});
test('failed import does not reset previous active piece', async () => {
  const s=fakeStore(),c=connectPracticeMemory(s,{storage:storage()});s.load(doc('A'));await settle();s.getState().seek(5);
  s.set({isLoadingDocument:true});s.set({isLoadingDocument:false});await settle();
  assert.equal(s.getState().currentSeconds,5);c.dispose();
});
test('storage errors are non-blocking and report unavailable once', async () => {
  const notices=[],st={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  const s=fakeStore(),c=connectPracticeMemory(s,{storage:st,notice:n=>notices.push(n)});
  s.load(doc('A'));await settle();assert.doesNotThrow(()=>s.getState().seek(6));c.flush();
  assert.equal(s.getState().currentSeconds,6);assert.equal(notices.filter(n=>n==='unavailable').length,1);c.dispose();
});
test('future schemas and malformed JSON are preserved, not overwritten', async () => {
  for(const raw of ['{','{"version":2,"entries":{}}']){
    const st=storage(raw),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});s.load(doc('A'));await settle();
    s.getState().seek(5);c.dispose();assert.equal(st.getItem(PRACTICE_STORAGE_KEY),raw);
  }
});
test('only practice data is stored, no score bytes, names, live states or ramp progress', async () => {
  const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});s.load(doc('A','private-binary',{title:'private-name'}));await settle();
  s.set({midiDeviceName:'private-device',sustainPedalDown:true});c.flush();
  const raw=st.getItem(PRACTICE_STORAGE_KEY);for(const word of ['private','midiBuffer','musicXml','currentPct','sustainPedalDown','status'])assert.equal(raw.includes(word),false,word);
  c.dispose();
});
test('forget deletes only current entry and does not resave it during this session', async () => {
  const st=storage(),s=fakeStore(),notices=[],c=connectPracticeMemory(s,{storage:st,notice:n=>notices.push(n)});
  s.load(doc('A'));await settle();s.getState().seek(2);s.load(doc('B'));await settle();s.getState().seek(3);
  assert.equal(Object.keys(rows(st)).length,2);assert.equal(c.forgetCurrent(),true);
  s.set({status:'playing',currentSeconds:4});c.flush();c.dispose();assert.equal(Object.keys(rows(st)).length,1);
  assert.ok(rows(st)[await practiceKey(doc('A'))]);assert.ok(notices.includes('forgotten'));
});
test('merges other songs persisted since this tab opened', async () => {
  const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});s.load(doc('A'));await settle();
  st.setItem(PRACTICE_STORAGE_KEY,JSON.stringify({version:1,entries:{[hashB]:{duration:60,updatedAt:1,practice:defaultPractice()}}}));
  s.getState().seek(2);assert.ok(rows(st)[hashB]);assert.equal(Object.keys(rows(st)).length,2);c.dispose();
});
test('cap retained metadata at 100 entries by recent write time', async () => {
  const entries={};for(let i=0;i<100;i++)entries['midi:'+i.toString(16).padStart(64,'0')]={duration:60,updatedAt:i,practice:defaultPractice()};
  const st=storage(JSON.stringify({version:1,entries})),s=fakeStore(),c=connectPracticeMemory(s,{storage:st,now:()=>1000});
  s.load(doc('new'));await settle();s.getState().seek(3);assert.equal(Object.keys(rows(st)).length,100);
  assert.equal(rows(st)['midi:'+'0'.repeat(64)],undefined);c.dispose();
});
test('reset to beginning saves intentional zero; disposal is idempotent', async () => {
  const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});s.load(doc('A'));await settle();s.getState().seek(10);
  s.set({status:'stopped',currentSeconds:0});c.dispose();c.dispose();
  assert.equal(Object.values(rows(st))[0].practice.position,0);assert.equal(s.listeners.size,0);
});


test('a suspended previous-song import cannot overwrite current settings on completion', async () => {
  const d=deferred(),s=fakeStore(),st=storage();const c=connectPracticeMemory(s,{storage:st,keyForDocument:()=>d.promise});
  s.load(doc('A'));await settle();s.set({isLoadingDocument:true});d.resolve(hashA);await settle();
  assert.equal(s.calls.length,0);s.set({isLoadingDocument:false});await settle();
  assert.ok(s.calls.some(x=>x[0]==='seek'));c.dispose();
});
test('quota failure keeps practice usable and can recover on later save', async () => {
  const st=storage(), original=st.setItem, s=fakeStore();st.setItem=()=>{throw Error('quota');};
  const c=connectPracticeMemory(s,{storage:st});s.load(doc('A'));await settle();s.getState().seek(5);
  assert.equal(s.getState().currentSeconds,5);st.setItem=original;c.flush();
  assert.equal(Object.values(rows(st))[0].practice.position,5);c.dispose();
});
test('unknown extra fields in JSON are not restored, including prototype-like keys', async () => {
  const p=JSON.parse('{"__proto__":{"polluted":true},"status":"playing","waitMode":true}');
  const out=sanitizePractice(p,60);assert.equal(out.waitMode,true);assert.equal({}.polluted,undefined);
  assert.equal('status' in out,false);
});
test('large or invalid records never prevent current practice', async () => {
  const st=storage('x'.repeat(256001)),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});
  s.load(doc('A'));await settle();s.getState().setTempoMultiplier(.5);assert.equal(s.getState().tempoMultiplier,.5);
  c.dispose();assert.equal(st.getItem(PRACTICE_STORAGE_KEY).length,256001);
});
test('resumed speed trainer configuration keeps start/end/step but resets runtime ramp', async () => {
  const st=storage(),s=fakeStore(),c=connectPracticeMemory(s,{storage:st});s.load(doc('A'));await settle();
  s.getState().updateSettings({speedTrainer:{enabled:true,startPct:50,endPct:80,stepPct:5,currentPct:75}});
  c.dispose();const b=fakeStore(),cb=connectPracticeMemory(b,{storage:st});b.load(doc('new','A'));await settle();
  assert.deepEqual(b.getState().settings.speedTrainer,{enabled:true,startPct:50,endPct:80,stepPct:5,currentPct:50});cb.dispose();
});
