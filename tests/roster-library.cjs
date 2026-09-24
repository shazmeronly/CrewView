const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('const ROSTER_CACHE_KEY="crewview-roster-cache-v1";');
const end=source.indexOf('\nfunction dayName',start);
assert.ok(start>=0 && end>start,'roster library block missing');
const block=source.slice(start,end);

const storage=new Map();
const fields={name:'Pilot',staff:'123',rank:'FO',fleet:'330',base:'KUL'};
const context=vm.createContext({
  console,Date,Intl,JSON,Map,Set,
  localStorage:{
    getItem:key=>storage.has(key)?storage.get(key):null,
    setItem:(key,value)=>storage.set(key,String(value)),
    removeItem:key=>storage.delete(key)
  },
  document:{createElement:()=>({value:'',textContent:''})},
  $:selector=>{
    const id=String(selector||'').replace(/^#/, '');
    if(id in fields) return {value:fields[id]};
    return null;
  },
  officialFH:'10:00',
  officialDH:'20:00',
  officialRosterPeriod:{start:new Date(2026,8,1),end:new Date(2026,8,30),startText:'01-Sep-2026',endText:'30-Sep-2026',key:'2026-09'},
  rosterTimeBasis:'SLT',
  applyRosterSnapshot:()=>true
});
vm.runInContext(block,context);

vm.runInContext('saveRosterSnapshot([{date:"01-Sep-2026",item:"MH1"}])',context);
assert.equal(vm.runInContext('savedRosterKeys().join(",")',context),'2026-09');

vm.runInContext('officialRosterPeriod={start:new Date(2026,9,1),end:new Date(2026,9,31),startText:"01-Oct-2026",endText:"31-Oct-2026",key:"2026-10"}; officialFH="11:00"; officialDH="21:00";',context);
vm.runInContext('saveRosterSnapshot([{date:"01-Oct-2026",item:"MH2"}])',context);
assert.equal(vm.runInContext('savedRosterKeys().join(",")',context),'2026-09,2026-10');
assert.equal(vm.runInContext('loadRosterSnapshot("2026-09").rows[0].item',context),'MH1');
assert.equal(vm.runInContext('loadRosterSnapshot("2026-10").rows[0].item',context),'MH2');

// A revised October roster replaces October only; September remains intact.
vm.runInContext('saveRosterSnapshot([{date:"02-Oct-2026",item:"MH22"}])',context);
assert.equal(vm.runInContext('savedRosterKeys().length',context),2);
assert.equal(vm.runInContext('loadRosterSnapshot("2026-10").rows[0].item',context),'MH22');
assert.equal(vm.runInContext('loadRosterSnapshot("2026-09").rows[0].item',context),'MH1');

// Clearing the active month leaves the other saved month available.
vm.runInContext('clearRosterSnapshot("2026-10")',context);
assert.equal(vm.runInContext('savedRosterKeys().join(",")',context),'2026-09');
console.log('PASS: CrewView saves, switches, replaces, and removes monthly rosters independently');
