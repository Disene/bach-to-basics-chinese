/** Runs real SyncEngine/MidiClock source, with Tone/audio/bus replaced by test doubles.
 * Uses the installed TypeScript compiler only to transpile (not full app typecheck).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const engineDir = process.env.B2B_ENGINE_DIR || path.resolve(__dirname, '../src/engine');
function harness() {
  const callbacks = [], events = [];
  const transport = { seconds:0, bpm:{value:120}, state:'stopped',
    scheduleOnce(cb, when){callbacks.push({cb,delay:Number(String(when).replace('+',''))});return callbacks.length},
    scheduleRepeat(){return 0}, cancel(){callbacks.length=0},
    start(){this.state='started'},pause(){this.state='paused'},stop(){this.state='stopped'},
  };
  const tone = {getTransport:()=>transport,start:async()=>{},Synth:class{toDestination(){return this}triggerAttackRelease(){}}};
  class AudioEngine {
    calls=[];
    async load(){} async wake(){} async setInstrument(){}
    playNote(n){this.calls.push(['score',n])}playMidi(m,v){this.calls.push(['live',m,v])}
    stopNote(m,id){this.calls.push(['stop',m,id])}stopAll(){this.calls.push(['all'])}
  }
  const cache={};
  function load(name){
    if(name==='tone')return tone;
    if(name==='./EventBus')return {__esModule:true,default:{emit:(...e)=>events.push(e)}};
    if(name==='./AudioEngine')return {AudioEngine};
    if(cache[name])return cache[name];
    const src=fs.readFileSync(path.join(engineDir,name.replace('./','')+'.ts'),'utf8');
    const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const mod={exports:{}};cache[name]=mod.exports;
    new Function('require','module','exports','requestAnimationFrame','cancelAnimationFrame',out)(load,mod,mod.exports,()=>1,()=>{});
    return mod.exports;
  }
  const {SyncEngine}=load('./SyncEngine');const e=new SyncEngine();
  return {e,callbacks,events,transport};
}
function note(id,midi,at=1,hand='right',end=at+1){return {id,midi,pitch:'C4',startTick:at*480,durationTick:(end-at)*480,startSeconds:at,endSeconds:end,hand,finger:null,velocity:80,channel:0}}
const doc = notes => ({id:'synthetic',title:'synthetic',sourceType:'midi',notes,musicXml:null,midiBuffer:null,
 tempoMap:[{tick:0,bpm:120}],timeSignatures:[{tick:0,numerator:4,denominator:4}],totalDuration:20,ppq:480,keySignature:null,
 youtubeId:null,youtubeSyncOffset:0,fingeringVersion:'none'});
async function setup(notes=[note('a',60)], options={}) {
 const h=harness();await h.e.loadDocument({...doc(notes),...options.document});h.e.setWaitMode(options.wait??true);
 if(options.transpose)h.e.setTranspose(options.transpose);
 if(options.speed)h.e.setTempoMultiplier(options.speed);
 if(options.waitHand)h.e.setWaitForHand(options.waitHand);
 if(options.offset)h.e.setRenderOffset(options.offset);
 h.e.audio.calls.length=0;h.e._state.status='playing';h.transport.start();h.e.onTick(0);
 return h;
}
function input(h,at,pitch,velocity=90){h.e.clock.seek(at);h.e.onMidiInput(pitch,velocity)}
function onset(h,index=0,at=1){const cb=h.callbacks[index]?.cb;assert.ok(cb);h.e.clock.seek(at);cb()}

for(const speed of [.25,.5,1,2]) {
 test(`100ms early correct input accepted at ${speed}x`,async()=>{
  const h=await setup(undefined,{speed});input(h,1-speed*.1,60);onset(h);
  assert.equal(h.e.state.status,'playing');assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,0);
 });
 test(`151ms early rejected at ${speed}x`,async()=>{
  const h=await setup(undefined,{speed});input(h,1-speed*.151,60);onset(h);assert.equal(h.e.state.status,'waiting');
 });
}
test('exact 150ms boundary accepted',async()=>{const h=await setup();input(h,.85,60);onset(h);assert.equal(h.e.state.status,'playing')});
test('wrong pitch and wrong octave do not clear a target',async()=>{const h=await setup();input(h,.9,61);input(h,.91,72);onset(h);assert.equal(h.e.state.status,'waiting')});
test('partial early chord only requires its remaining pitch',async()=>{
 const h=await setup([note('c',60),note('e',64),note('g',67)]);input(h,.9,60);input(h,.92,64);onset(h);
 assert.deepEqual([...h.e.waitingMidis],[67]);h.e.onMidiInput(67,90);assert.equal(h.e.state.status,'playing');
});
test('fully early chord retains visual cues but does not pause or auto-play',async()=>{
 const h=await setup([note('c',60),note('e',64),note('g',67)]);for(const p of [60,64,67])input(h,.9,p);onset(h);
 assert.equal(h.e.state.status,'playing');assert.equal(h.events.filter(x=>x[0]==='note:on').length,3);
 assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,0);
});
test('one early repeated pitch never pre-clears a later repeated onset',async()=>{
 const h=await setup([note('first',60,1),note('next',60,1.1)]);input(h,.95,60);input(h,.96,60);onset(h);
 assert.equal(h.e.state.status,'playing');onset(h,3,1.1);assert.equal(h.e.state.status,'waiting');
});
test('wrong input for a future chord is not accepted ahead of the next target',async()=>{
 const h=await setup([note('first',60,1),note('next',64,1.05)]);input(h,.95,64);onset(h);assert.deepEqual([...h.e.waitingMidis],[60]);
});
test('velocity zero/non-finite never completes waiting or early targets',async()=>{
 const h=await setup();for(const v of [0,-1,NaN,Infinity])input(h,.9,60,v);onset(h);
 for(const v of [0,-1,NaN,Infinity])h.e.onMidiInput(60,v);assert.equal(h.e.state.status,'waiting');
});
test('transposition selected before scheduling uses transposed target',async()=>{
 const h=await setup(undefined,{transpose:2});input(h,.9,60);onset(h);assert.equal(h.e.state.status,'waiting');h.e.onMidiInput(62,90);assert.equal(h.e.state.status,'playing');
 const h2=await setup(undefined,{transpose:2});input(h2,.9,62);onset(h2);assert.equal(h2.e.state.status,'playing');
});
test('changing active hand rebuilds pending early groups; old hand no longer required',async()=>{
 const h=await setup([note('l',48,1,'left'),note('r',60,1,'right')]);input(h,.88,60);h.e.setActiveHands(new Set(['left']));
 input(h,.9,48);onset(h);assert.equal(h.e.state.status,'playing');
});
test('changing waiting hand rebuilds pending targets without stopping accompaniment',async()=>{
 const h=await setup([note('l',48,1,'left'),note('r',60,1,'right')],{waitHand:'left'});
 h.e.setWaitForHand('right');input(h,.9,60);onset(h);assert.equal(h.e.state.status,'playing');
 assert.deepEqual(h.e.audio.calls.filter(x=>x[0]==='score').map(x=>x[1].midi),[48]);
});
test('partial waiting chord remains compatible with PR7 hand changes',async()=>{
 const h=await setup([note('l',48,1,'left'),note('c',60,1,'right'),note('e',64,1,'right')]);
 input(h,.9,60);onset(h);h.e.setActiveHands(new Set(['right']));assert.deepEqual([...h.e.waitingMidis],[64]);
 h.e.onMidiInput(64,90);assert.equal(h.e.state.status,'playing');
});
test('pause invalidates early credit and preserves paused state while hand changes',async()=>{
 const h=await setup();input(h,.9,60);h.e.pause();h.e.setWaitForHand('right');assert.equal(h.e.state.status,'paused');
 h.e._state.status='playing';h.transport.start();onset(h);assert.equal(h.e.state.status,'waiting');
});
test('count-in and stopped clock reject early input',async()=>{
 const h=await setup();h.e.countInTimeouts=[123];input(h,.9,60);h.e.countInTimeouts=[];h.transport.pause();input(h,.91,60);
 h.transport.start();onset(h);assert.equal(h.e.state.status,'waiting');
});
test('seek clears pending credit and does not skip reloaded target',async()=>{
 const h=await setup();input(h,.9,60);h.e.seek(0);h.e.onTick(0);onset(h);assert.equal(h.e.state.status,'waiting');
});
test('stop/document replacement cannot reuse earlier hits',async()=>{
 const h=await setup();input(h,.9,60);await h.e.loadDocument(doc([note('new',60)]));h.e._state.status='playing';h.transport.start();h.e.onTick(0);
 onset(h);assert.equal(h.e.state.status,'waiting');
});
test('tempo changes invalidate old credit and reschedule the target',async()=>{
 const h=await setup();input(h,.9,60);h.e.setTempoMultiplier(.5);h.e.onTick(h.e.state.currentSeconds);
 const first=h.callbacks[0];assert.ok(first);h.e.clock.seek(1);first.cb();assert.equal(h.e.state.status,'waiting');
});
test('positive audio offset does not make waiting start ahead of musical onset',async()=>{
 const h=await setup(undefined,{offset:180});assert.equal(h.callbacks[0].delay,1);input(h,.9,60);onset(h);assert.equal(h.e.state.status,'playing');
});
test('normal playback retains existing output-latency compensation',async()=>{
 const h=await setup(undefined,{wait:false,offset:180});assert.ok(Math.abs(h.callbacks[0].delay-.82)<1e-9);onset(h);
 assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,1);
});
test('0% remains silent without removing practice targets',async()=>{
 const h=await setup();h.e.setHandVolume({left:1,right:0});onset(h);assert.equal(h.e.state.status,'waiting');
 assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,0);
});
test('normal score playback is silent at 0%, enabled again for future notes',async()=>{
 const h=await setup([note('a',60),note('b',62,2)],{wait:false});h.e.setHandVolume({left:1,right:0});onset(h);assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,0);
 h.e.setHandVolume({left:1,right:.5});onset(h,3,2);assert.equal(h.e.audio.calls.find(x=>x[0]==='score')[1].velocity,40);
});
test('source sustain release and live CC64 remain separate',async()=>{
 const h=await setup([note('a',60,1,'right',1.2)],{wait:false,document:{sustainRanges:[{startSeconds:0,endSeconds:3}]}});
 onset(h);assert.equal(h.callbacks[2].delay,3);h.e.setSustainPedal(true);await h.e.playMidi(72);h.e.stopMidi(72);
 h.e.setHandVolume({left:1,right:0});assert.ok(h.e.audio.calls.some(x=>x[0]==='stop'&&x[2]==='a'));
 assert.equal(h.e.audio.calls.some(x=>x[0]==='stop'&&x[1]===72),false);
 h.e.setSustainPedal(false);assert.ok(h.e.audio.calls.some(x=>x[0]==='stop'&&x[1]===72));
});
test('wait off rebuilds scheduling and clears early state',async()=>{
 const h=await setup();input(h,.9,60);h.e.setWaitMode(false);h.e.onTick(h.e.state.currentSeconds);
 onset(h);assert.equal(h.e.state.status,'playing');assert.equal(h.e.audio.calls.filter(x=>x[0]==='score').length,1);
});
