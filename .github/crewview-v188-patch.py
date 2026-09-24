from pathlib import Path

app_path=Path('app.js')
app=app_path.read_text()

# --- Replace single-roster cache with a month-keyed roster library ---
start=app.index('const ROSTER_CACHE_KEY="crewview-roster-cache-v1";')
end=app.index('\nfunction dayName',start)
cache_block=r'''const ROSTER_CACHE_KEY="crewview-roster-cache-v1";
const ROSTER_LIBRARY_KEY="crewview-roster-library-v2";
let activeRosterKey="";

function serializeRosterPeriod(period){
  if(!period) return null;
  return {
    start:period.start instanceof Date ? period.start.toISOString() : period.start,
    end:period.end instanceof Date ? period.end.toISOString() : period.end,
    startText:period.startText||"",
    endText:period.endText||"",
    key:period.key||""
  };
}
function deserializeRosterPeriod(period){
  if(!period) return null;
  const start=period.start ? new Date(period.start) : null;
  const end=period.end ? new Date(period.end) : null;
  if(!(start instanceof Date) || Number.isNaN(start.getTime()) || !(end instanceof Date) || Number.isNaN(end.getTime())) return null;
  const key=String(period.key||"").trim() || `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}`;
  return {
    start,
    end,
    startText:period.startText||"",
    endText:period.endText||"",
    key
  };
}

function blankRosterLibrary(){
  return {version:2,activeKey:"",rosters:{}};
}

function validRosterSnapshot(snapshot){
  return Boolean(snapshot && Array.isArray(snapshot.rows) && snapshot.rows.length);
}

function snapshotMonthKey(snapshot){
  if(!snapshot) return "";
  const explicit=String(snapshot.monthKey||snapshot.officialRosterPeriod?.key||"").trim();
  if(/^\d{4}-\d{2}$/.test(explicit)) return explicit;

  const counts=new Map();
  (snapshot.rows||[]).forEach(row=>{
    const match=String(row?._operationalDate||row?.date||row?._sourceDate||"").match(/\b\d{2}-([A-Za-z]{3})-(\d{4})\b/);
    if(!match) return;
    const months={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
    const month=months[match[1]];
    if(!month) return;
    const key=`${match[2]}-${month}`;
    counts.set(key,(counts.get(key)||0)+1);
  });
  return [...counts.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function rosterMonthLabel(key){
  const match=String(key||"").match(/^(\d{4})-(\d{2})$/);
  if(!match) return "Roster";
  const date=new Date(Number(match[1]),Number(match[2])-1,1);
  return date.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
}

function readLegacyRosterSnapshot(){
  try{
    const data=JSON.parse(localStorage.getItem(ROSTER_CACHE_KEY)||"null");
    return validRosterSnapshot(data) ? data : null;
  }catch(_error){
    return null;
  }
}

function persistRosterLibrary(library){
  try{
    localStorage.setItem(ROSTER_LIBRARY_KEY,JSON.stringify(library));
    return true;
  }catch(error){
    console.warn("CrewView could not save the roster library locally",error);
    return false;
  }
}

function loadRosterLibrary(){
  let library=blankRosterLibrary();
  try{
    const parsed=JSON.parse(localStorage.getItem(ROSTER_LIBRARY_KEY)||"null");
    if(parsed && parsed.rosters && typeof parsed.rosters==="object"){
      library={
        version:2,
        activeKey:String(parsed.activeKey||""),
        rosters:{...parsed.rosters}
      };
    }
  }catch(_error){}

  // Seamlessly migrate the previous single-month cache into the library.
  const legacy=readLegacyRosterSnapshot();
  if(legacy){
    const key=snapshotMonthKey(legacy);
    if(key){
      const existing=library.rosters[key];
      if(!existing || Number(legacy.savedAt||0)>Number(existing.savedAt||0)){
        library.rosters[key]={...legacy,monthKey:key};
      }
      if(!library.activeKey) library.activeKey=key;
      persistRosterLibrary(library);
    }
  }

  return library;
}

function savedRosterKeys(library=loadRosterLibrary()){
  return Object.keys(library.rosters||{})
    .filter(key=>validRosterSnapshot(library.rosters[key]))
    .sort();
}

function mirrorLegacyRoster(snapshot){
  try{
    if(snapshot) localStorage.setItem(ROSTER_CACHE_KEY,JSON.stringify(snapshot));
    else localStorage.removeItem(ROSTER_CACHE_KEY);
  }catch(_error){}
}

function buildRosterSnapshot(rows){
  const profile={};
  ["name","staff","rank","fleet","base"].forEach(id=>{
    profile[id]=($("#"+id)?.value||"").trim();
  });
  const monthKey=String(officialRosterPeriod?.key||"").trim();
  return {
    version:2,
    savedAt:Date.now(),
    monthKey,
    rows:Array.isArray(rows)?rows:[],
    officialFH,
    officialDH,
    officialRosterPeriod:serializeRosterPeriod(officialRosterPeriod),
    rosterTimeBasis,
    profile
  };
}

function saveRosterSnapshot(rows){
  const snapshot=buildRosterSnapshot(rows);
  const key=snapshot.monthKey || snapshotMonthKey(snapshot);
  if(!key){
    mirrorLegacyRoster(snapshot);
    return snapshot;
  }

  snapshot.monthKey=key;
  const library=loadRosterLibrary();
  library.rosters[key]=snapshot; // A newer revision replaces only this month.
  library.activeKey=key;
  activeRosterKey=key;
  persistRosterLibrary(library);
  mirrorLegacyRoster(snapshot);
  renderRosterMonthSwitcher();
  return snapshot;
}

function resolveRosterKey(library,requested=""){
  const keys=savedRosterKeys(library);
  if(!keys.length) return "";
  if(requested && library.rosters[requested]) return requested;
  if(library.activeKey && library.rosters[library.activeKey]) return library.activeKey;

  const now=new Date();
  const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  if(library.rosters[current]) return current;
  return keys[keys.length-1];
}

function loadRosterSnapshot(requestedKey=""){
  const library=loadRosterLibrary();
  const key=resolveRosterKey(library,requestedKey);
  if(!key) return null;
  library.activeKey=key;
  activeRosterKey=key;
  persistRosterLibrary(library);
  const snapshot=library.rosters[key];
  mirrorLegacyRoster(snapshot);
  return snapshot;
}

function clearRosterSnapshot(key=activeRosterKey){
  const library=loadRosterLibrary();
  const keysBefore=savedRosterKeys(library);
  const target=key && library.rosters[key] ? key : resolveRosterKey(library);
  if(target) delete library.rosters[target];

  const keys=savedRosterKeys(library);
  if(!keys.length){
    library.activeKey="";
    activeRosterKey="";
    persistRosterLibrary(library);
    mirrorLegacyRoster(null);
    renderRosterMonthSwitcher();
    return null;
  }

  const oldIndex=Math.max(0,keysBefore.indexOf(target));
  const nextKey=keys[Math.min(oldIndex,keys.length-1)] || keys[keys.length-1];
  library.activeKey=nextKey;
  activeRosterKey=nextKey;
  persistRosterLibrary(library);
  const next=library.rosters[nextKey];
  mirrorLegacyRoster(next);
  renderRosterMonthSwitcher();
  return next;
}

function renderRosterMonthSwitcher(){
  const bar=$("#rosterLibraryBar");
  const select=$("#rosterMonthSelect");
  const count=$("#rosterLibraryCount");
  const previous=$("#rosterMonthPrev");
  const next=$("#rosterMonthNext");
  if(!bar||!select) return;

  const library=loadRosterLibrary();
  const keys=savedRosterKeys(library);
  if(!keys.length){
    bar.classList.add("hidden");
    select.innerHTML="";
    return;
  }

  const selected=resolveRosterKey(library,activeRosterKey||library.activeKey);
  activeRosterKey=selected;
  bar.classList.remove("hidden");
  select.innerHTML="";
  keys.forEach(key=>{
    const option=document.createElement("option");
    option.value=key;
    option.textContent=rosterMonthLabel(key);
    select.appendChild(option);
  });
  select.value=selected;
  if(count) count.textContent=`${keys.length} saved`;

  const index=keys.indexOf(selected);
  if(previous) previous.disabled=index<=0;
  if(next) next.disabled=index<0 || index>=keys.length-1;
}

function switchSavedRoster(key){
  const cached=loadRosterSnapshot(key);
  if(!cached) return false;
  return applyRosterSnapshot(cached,{
    statusText:`Showing ${rosterMonthLabel(activeRosterKey)}.`,
    resetViewport:false
  });
}

function moveSavedRoster(direction){
  const library=loadRosterLibrary();
  const keys=savedRosterKeys(library);
  if(!keys.length) return false;
  const current=resolveRosterKey(library,activeRosterKey||library.activeKey);
  const index=keys.indexOf(current);
  const nextIndex=Math.max(0,Math.min(keys.length-1,index+Number(direction||0)));
  if(nextIndex===index) return false;
  return switchSavedRoster(keys[nextIndex]);
}
'''
app=app[:start]+cache_block+app[end:]

# --- Replace upload / clear / restore handlers with multi-roster behavior ---
start=app.index('$("#pdfInput").addEventListener("change"')
end=app.index('\n// iOS may terminate',start)
handlers=r'''$("#pdfInput").addEventListener("change",async e=>{
  const files=[...(e.target.files||[])];
  if(!files.length) return;

  let completed=0;
  const failed=[];
  for(const file of files){
    try{
      status.textContent=`Reading ${file.name}...`;
      await parsePDF(file);
      completed+=1;
    }catch(err){
      console.error(err);
      failed.push(file.name);
    }
  }

  e.target.value="";
  renderRosterMonthSwitcher();
  if(failed.length){
    status.textContent=`Saved ${completed} roster${completed===1?"":"s"}. Could not read: ${failed.join(", ")}.`;
  }else if(files.length>1){
    status.textContent=`Saved ${completed} rosters. Showing ${rosterMonthLabel(activeRosterKey)}.`;
  }
});
$("#loadAnotherBtn")?.addEventListener("click",()=>$("#pdfInput")?.click());
$("#replaceRosterBtn")?.addEventListener("click",()=>$("#pdfInput")?.click());
$("#rosterAddBtn")?.addEventListener("click",()=>$("#pdfInput")?.click());
$("#rosterMonthSelect")?.addEventListener("change",event=>switchSavedRoster(event.currentTarget.value));
$("#rosterMonthPrev")?.addEventListener("click",()=>moveSavedRoster(-1));
$("#rosterMonthNext")?.addEventListener("click",()=>moveSavedRoster(1));
$("#headerClearBtn")?.addEventListener("click",()=>$("#clearBtn")?.click());
$("#clearBtn")?.addEventListener("click",event=>{
  event.preventDefault();

  const removedKey=activeRosterKey;
  const fallback=clearRosterSnapshot();
  if(fallback){
    applyRosterSnapshot(fallback,{
      statusText:`Removed ${rosterMonthLabel(removedKey)}. Showing ${rosterMonthLabel(activeRosterKey)}.`,
      resetViewport:false
    });
    return;
  }

  officialFH=null;
  officialDH=null;
  officialRosterPeriod=null;

  if(nextDutyTimer){
    clearInterval(nextDutyTimer);
    nextDutyTimer=null;
  }
  smartDutyRenderSignature="";
  activeSmartDutyState="next";

  setRows([]);

  ["name","staff","rank","fleet","base"].forEach(id=>{
    const input=$("#"+id);
    if(input) input.value="";
  });

  $("#fh").textContent="00:00";
  $("#dh").textContent="00:00";
  $("#off").textContent="0";

  closeDutyDetails();

  const nextCard=$("#nextDutyCard");
  if(nextCard) nextCard.classList.add("hidden");

  const compactProfile=$("#compactProfile");
  if(compactProfile) compactProfile.classList.add("hidden");

  document.body.classList.remove("roster-loaded");
  $("#uploadCard")?.removeAttribute("aria-hidden");
  $("#loadedRosterActions")?.setAttribute("aria-hidden","true");
  $("#viewSwitcher")?.classList.add("hidden");
  switchRosterView("classic");
  calendarCursor=null;
  selectedCalendarDuty=null;

  status.textContent="No roster loaded.";
  renderRosterMonthSwitcher();

  clearTimeout(validationToastTimer);
  $("#validationToast")?.classList.remove("show","leaving");
  $("#validationToast")?.classList.add("hidden");

  const validationResult=$("#validationResult");
  if(validationResult){
    validationResult.classList.add("hidden");
    validationResult.classList.remove("pass","fail","neutral");
    validationResult.innerHTML="";
  }

  requestAnimationFrame(()=>{
    $("#uploadCard")?.scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  });
});

function applyRosterSnapshot(cached,{statusText="Roster loaded.",resetViewport=false}={}){
  if(!cached || !Array.isArray(cached.rows) || !cached.rows.length) return false;

  officialFH=cached.officialFH||null;
  officialDH=cached.officialDH||null;
  officialRosterPeriod=deserializeRosterPeriod(cached.officialRosterPeriod);
  Object.entries(cached.profile||{}).forEach(([id,value])=>{
    const input=$("#"+id);
    if(input) input.value=value||"";
  });

  const storedTimeBasis=["LT","SLT","UTC"].includes(cached.rosterTimeBasis)
    ? cached.rosterTimeBasis
    : "LT";
  rosterTimeBasis=storedTimeBasis;

  // v185 could save an unlabeled UTC iFlight roster as LT. Re-run the new
  // calendar-anchor detector on cached rows so existing users are repaired.
  if(storedTimeBasis==="LT"){
    const redetected=detectRosterTimeBasis(cached.rows,"");
    if(redetected==="UTC") rosterTimeBasis="UTC";
  }

  const key=snapshotMonthKey(cached);
  if(key) activeRosterKey=key;

  setRows(annotateOperationalDates(cached.rows));
  updateRosterSourceNote();
  document.body.classList.add("roster-loaded");
  $("#uploadCard")?.setAttribute("aria-hidden","true");
  $("#loadedRosterActions")?.setAttribute("aria-hidden","false");
  $("#viewSwitcher")?.classList.remove("hidden");
  setPrimaryRosterViewVisibility("classic");
  document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");
  crewViewMode="classic";
  document.querySelectorAll(".view-tab[data-view]").forEach(tab=>tab.classList.toggle("active",tab.dataset.view==="classic"));

  if(officialRosterPeriod?.start){
    calendarCursor=new Date(
      officialRosterPeriod.start.getFullYear(),
      officialRosterPeriod.start.getMonth(),
      1
    );
  }
  selectedCalendarDuty=null;
  updateCompactProfile();
  renderRosterMonthSwitcher();
  status.textContent=statusText;
  requestAnimationFrame(()=>{
    if(resetViewport) resetInitialViewport();
    applyOperationalOverlayToClassic();
  });
  return true;
}

function restoreCachedRoster(){
  if(document.body.classList.contains("roster-loaded")) return false;
  const cached=loadRosterSnapshot();
  if(!cached){
    renderRosterMonthSwitcher();
    return false;
  }
  return applyRosterSnapshot(cached,{
    statusText:`Restored ${rosterMonthLabel(activeRosterKey)} from this device.`,
    resetViewport:true
  });
}
'''
app=app[:start]+handlers+app[end:]

app_path.write_text(app)

# --- Insert a compact roster library switcher and enable multi-file selection ---
index_path=Path('index.html')
index=index_path.read_text()
index=index.replace('aria-label="Replace roster" title="Replace roster"','aria-label="Add or update roster" title="Add or update roster"')
index=index.replace('<span aria-hidden="true">↻</span>','<span aria-hidden="true">＋</span>',1)
index=index.replace('<strong>Upload Current Roster</strong>','<strong>Upload Roster</strong>')
index=index.replace('>Load Current Roster</label>','>Add Roster</label>')
index=index.replace('<input id="pdfInput" type="file" accept="application/pdf,.pdf">','<input id="pdfInput" type="file" accept="application/pdf,.pdf" multiple>')
index=index.replace('>Load Another Roster</button>','>Add Another Roster</button>')
month_bar='''<div class="roster-library-bar hidden" id="rosterLibraryBar" aria-label="Saved rosters">\n  <button class="roster-month-nav" id="rosterMonthPrev" type="button" aria-label="Previous saved month">‹</button>\n  <div class="roster-month-picker">\n    <span>ROSTER</span>\n    <select id="rosterMonthSelect" aria-label="Choose saved roster month"></select>\n    <small id="rosterLibraryCount">0 saved</small>\n  </div>\n  <button class="roster-month-nav" id="rosterMonthNext" type="button" aria-label="Next saved month">›</button>\n  <button class="roster-add-btn" id="rosterAddBtn" type="button" aria-label="Add or update roster" title="Add or update roster">＋</button>\n</div>\n'''
needle='<main>\n<nav class="view-switcher hidden" id="viewSwitcher" aria-label="Roster view">'
if needle not in index:
    raise SystemExit('index main/view switcher insertion point not found')
index=index.replace(needle,'<main>\n'+month_bar+'<nav class="view-switcher hidden" id="viewSwitcher" aria-label="Roster view">',1)
index=index.replace('?v=187','?v=188')
index_path.write_text(index)

# --- Add responsive light/dark styling for the saved-roster bar ---
style_path=Path('style.css')
style=style_path.read_text()
style += r'''

/* v188 continuous saved-roster library */
.roster-library-bar{
  display:flex;
  align-items:center;
  gap:8px;
  margin:0 0 10px;
  padding:8px;
  border:1px solid var(--line);
  border-radius:14px;
  background:#fff;
  box-shadow:0 2px 10px #11223310;
}
.roster-month-picker{
  min-width:0;
  flex:1;
  display:grid;
  grid-template-columns:auto 1fr auto;
  align-items:center;
  gap:8px;
}
.roster-month-picker>span{
  font-size:10px;
  font-weight:800;
  letter-spacing:.09em;
  color:var(--muted);
}
.roster-month-picker select{
  min-width:0;
  width:100%;
  border:0;
  border-radius:9px;
  padding:8px 30px 8px 10px;
  background:#f3f6f9;
  color:var(--ink);
  font:inherit;
  font-weight:800;
  appearance:auto;
}
.roster-month-picker small{
  color:var(--muted);
  font-size:10px;
  white-space:nowrap;
}
.roster-month-nav,.roster-add-btn{
  width:38px;
  height:38px;
  flex:0 0 38px;
  border:1px solid var(--line);
  border-radius:10px;
  background:#f7f9fb;
  color:var(--ink);
  font-size:22px;
  font-weight:700;
  line-height:1;
}
.roster-month-nav:disabled{opacity:.3}
.roster-add-btn{background:var(--blue);color:#fff;border-color:transparent}
html[data-theme="dark"] .roster-library-bar{background:#111a24}
html[data-theme="dark"] .roster-month-picker select,
html[data-theme="dark"] .roster-month-nav{background:#0d1722;color:#e5edf6}
@media(max-width:640px){
  .roster-library-bar{gap:6px;padding:6px}
  .roster-month-picker{grid-template-columns:1fr auto;gap:2px 6px}
  .roster-month-picker>span{display:none}
  .roster-month-picker select{padding:8px;font-size:14px}
  .roster-month-picker small{font-size:9px}
  .roster-month-nav,.roster-add-btn{width:36px;height:36px;flex-basis:36px}
}
@media print{.roster-library-bar{display:none!important}}
'''
style_path.write_text(style)

# --- Bump service-worker cache ---
sw_path=Path('sw.js')
sw=sw_path.read_text()
if 'crewview-v187' not in sw:
    raise SystemExit('sw v187 marker not found')
sw=sw.replace('crewview-v187','crewview-v188').replace('?v=187','?v=188')
sw_path.write_text(sw)

# --- Regression test for month-keyed persistence and replacement ---
test_path=Path('tests/roster-library.cjs')
test_path.write_text(r'''const fs=require('node:fs');
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
''')
