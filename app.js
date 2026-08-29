
// Keep CrewView at the true top when the page is first opened or restored by iOS.
if("scrollRestoration" in history){
  history.scrollRestoration="manual";
}
function resetInitialViewport(){
  window.scrollTo({top:0,left:0,behavior:"auto"});
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
}
window.addEventListener("pageshow",()=>{
  resetInitialViewport();
  requestAnimationFrame(resetInitialViewport);
},{once:true});
document.addEventListener("DOMContentLoaded",()=>{
  resetInitialViewport();
  requestAnimationFrame(resetInitialViewport);
},{once:true});

const themeToggle=document.querySelector("#themeToggle");
const themeIcon=document.querySelector("#themeIcon");
const themeText=document.querySelector("#themeText");

function preferredTheme(){
  const saved=localStorage.getItem("crewview-theme");
  if(saved==="dark"||saved==="light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  if(themeIcon) themeIcon.textContent=theme==="dark"?"☀️":"🌙";
  if(themeText) themeText.textContent=theme==="dark"?"Light":"Dark";
  if(themeToggle) themeToggle.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent("crewview:theme-changed",{detail:{theme}})));
}
applyTheme(preferredTheme());
themeToggle?.addEventListener("click",()=>{
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
  localStorage.setItem("crewview-theme",next);
  applyTheme(next);
  requestAnimationFrame(syncCalendarThemeButton);
});

import { AIRPORT_TIMEZONES } from "./airport-timezones.js";
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

const $=s=>document.querySelector(s);
const tbody=$("#rosterTable tbody"), status=$("#status");
const cols=["date","day","dutyStart","item","dep","arr","dutyEnd","work","block","duty","ac"];
let officialFH=null, officialDH=null;
let officialRosterPeriod=null;
let rosterTimeBasis="LT"; // iFlight LT (base-local) | SLT (station-local) | UTC

const ROSTER_CACHE_KEY="crewview-roster-cache-v1";

function serializeRosterPeriod(period){
  if(!period) return null;
  return {
    start:period.start instanceof Date ? period.start.toISOString() : period.start,
    end:period.end instanceof Date ? period.end.toISOString() : period.end
  };
}
function deserializeRosterPeriod(period){
  if(!period) return null;
  const start=period.start ? new Date(period.start) : null;
  const end=period.end ? new Date(period.end) : null;
  return start instanceof Date && !Number.isNaN(start.getTime()) && end instanceof Date && !Number.isNaN(end.getTime())
    ? {start,end}
    : null;
}
function saveRosterSnapshot(rows){
  try{
    const profile={};
    ["name","staff","rank","fleet","base"].forEach(id=>{
      profile[id]=($("#"+id)?.value||"").trim();
    });
    localStorage.setItem(ROSTER_CACHE_KEY,JSON.stringify({
      version:1,
      savedAt:Date.now(),
      rows:Array.isArray(rows)?rows:[],
      officialFH,
      officialDH,
      officialRosterPeriod:serializeRosterPeriod(officialRosterPeriod),
      rosterTimeBasis,
      profile
    }));
  }catch(error){
    console.warn("CrewView could not save the parsed roster locally",error);
  }
}
function clearRosterSnapshot(){
  try{ localStorage.removeItem(ROSTER_CACHE_KEY); }catch(_error){}
}
function loadRosterSnapshot(){
  try{
    const data=JSON.parse(localStorage.getItem(ROSTER_CACHE_KEY)||"null");
    return data && Array.isArray(data.rows) && data.rows.length ? data : null;
  }catch(_error){
    return null;
  }
}

function dayName(dateStr){
  const m=dateStr.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/); if(!m)return "";
  const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const d=new Date(+m[3],months[m[2]],+m[1]); return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

let fitEnabled=true;
function applyOnePageFit(){
  const shell=$("#fitShell"), stage=$("#scaleStage"), table=$("#rosterTable");
  if(!shell||!stage||!table)return;
  document.body.classList.toggle("fit-mode",fitEnabled);
  stage.style.transform="none";
  stage.style.height="auto";
  if(!fitEnabled){
    $("#tableWrap").style.overflow="auto";
    $("#fitBtn").textContent="Fit One Page";
    return;
  }
  $("#tableWrap").style.overflow="hidden";
  requestAnimationFrame(()=>{
    const available=shell.clientWidth;
    const natural=stage.scrollWidth || table.scrollWidth;
    const scale=Math.min(1, available/natural);
    stage.style.transform=`scale(${scale})`;
    stage.style.height=`${stage.scrollHeight*scale}px`;
    $("#fitBtn").textContent="Full Size";
  });
}

function rowHTML(r={}){
  const continuation=r._overnightContinuation ? "1" : "";
  const actualDate=esc(r._actualDate||r.date||"");
  const actualDay=esc(r._actualDay||r.day||dayName(r._actualDate||r.date||"")||"");
  const syntheticCalendarRow=r._syntheticCalendarRow ? "1" : "";
  const layoverDay=r._layoverDay ? "1" : "";
  const visualOrder=Number.isFinite(r._visualOrder)
    ? String(r._visualOrder)
    : "";
  const dutyGroup=esc(r._dutyGroup||"");
  const hotel=esc(r._hotel||"");
  const sectorIndex=Number.isFinite(r._sectorIndex) ? String(r._sectorIndex) : "";
  const sectorCount=Number.isFinite(r._sectorCount) ? String(r._sectorCount) : "";

  return `<tr
    data-overnight-continuation="${continuation}"
    data-synthetic-calendar-row="${syntheticCalendarRow}"
    data-layover-day="${layoverDay}"
    data-visual-order="${visualOrder}"
    data-duty-group="${dutyGroup}"
    data-hotel="${hotel}"
    data-sector-index="${sectorIndex}"
    data-sector-count="${sectorCount}"
    data-actual-date="${actualDate}"
    data-actual-day="${actualDay}"
  >${cols.map(c=>
    `<td contenteditable="true" data-k="${c}">${esc(r[c]??"")}</td>`
  ).join("")}</tr>`;
}

function prepareClassicDisplayRows(rows){
  let previousDate="";

  return rows.map(sourceRow=>{
    const row={...sourceRow};
    const actualDate=String(row._actualDate||row.date||"").trim();
    const actualDay=String(row._actualDay||row.day||dayName(actualDate)||"").trim();

    row._actualDate=actualDate;
    row._actualDay=actualDay;

    // In the old roster layout, Date and Day are printed once for a calendar
    // date. Extra rows on that same date (for example an overnight arrival
    // followed by the next duty) keep their real date in data attributes but
    // show blank Date/Day cells.
    if(actualDate && actualDate===previousDate){
      row.date="";
      row.day="";
    }else{
      row.date=actualDate;
      row.day=actualDay;
      if(actualDate) previousDate=actualDate;
    }

    return row;
  });
}
function esc(v){return String(v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function classifyRows(){
  [...tbody.rows].forEach(tr=>{
    tr.classList.remove(
      "row-duty",
      "row-off",
      "row-training",
      "row-positioning",
      "row-standby",
      "row-leave",
      "row-layover",
      "row-empty",
      "row-overnight-continuation"
    );

    const value=key=>
      (tr.querySelector(`[data-k="${key}"]`)?.textContent||"").trim();

    const item=value("item").toUpperCase();
    const work=value("work").toUpperCase();

    const hasDutyContent=[
      "dutyStart","item","dep","arr","dutyEnd",
      "work","block","duty","ac"
    ].some(key=>value(key)!=="");

    const blankCalendarDay=!hasDutyContent;

    if(tr.dataset.overnightContinuation==="1"){
      tr.classList.add("row-overnight-continuation");
    }else if(
      tr.dataset.layoverDay==="1" ||
      item.includes("LAYOVER")
    ){
      tr.classList.add("row-layover");
    }else if(
      item==="DSA" ||
      item.includes("TRAIN") ||
      item.includes("SIM") ||
      item.includes("LPC") ||
      item.includes("OPC") ||
      item.includes("ETOPS") ||
      item.includes("LVO") ||
      item.includes("GROUND") ||
      item.includes("COURSE")
    ){
      tr.classList.add("row-training");
    }else if(
      /(?:^|\b)(?:STBY|STANDBY|SBY|RSV|ASB|HSB)(?:\b|$)/.test(item)
    ){
      tr.classList.add("row-standby");
    }else if(
      ["AL","CL","EL","MC","ML","PL","UL"].includes(item) ||
      item.includes("LEAVE")
    ){
      tr.classList.add("row-leave");
    }else if(
      item==="D" ||
      item==="OFF" ||
      item.startsWith("DO")
    ){
      tr.classList.add("row-off");
    }else if(blankCalendarDay){
      tr.classList.add("row-empty");
    }else if(work==="PS"){
      tr.classList.add("row-positioning");
    }else{
      tr.classList.add("row-duty");
    }
  });
}
function setRows(rows){
  const displayRows=prepareClassicDisplayRows(rows);
  tbody.innerHTML=displayRows.map(rowHTML).join("");
  applyOperationalOverlayToClassic();
  classifyRows();
  updateStats();
  renderNextDuty();
  renderCalendarView();
  setTimeout(applyOnePageFit,0);
}
function getRows(){
  return [...tbody.rows].map(tr=>{
    const row=Object.fromEntries(
      [...tr.cells].map(td=>[
        td.dataset.k,
        td.dataset.actualOverlay==="1"
          ? (td.dataset.scheduledValue||"")
          : td.textContent.trim()
      ])
    );

    // Rehydrate blank repeated Date/Day cells so Calendar view, countdowns,
    // statistics and PDF calculations still use the correct calendar date.
    row.date=row.date||tr.dataset.actualDate||"";
    row.day=row.day||tr.dataset.actualDay||dayName(row.date);
    row._actualDate=tr.dataset.actualDate||row.date||"";
    row._actualDay=tr.dataset.actualDay||row.day||dayName(row.date);

    row._overnightContinuation=tr.dataset.overnightContinuation==="1";
    row._syntheticCalendarRow=
      tr.dataset.syntheticCalendarRow==="1";
    row._layoverDay=tr.dataset.layoverDay==="1";
    if(tr.dataset.visualOrder!==""){
      row._visualOrder=Number(tr.dataset.visualOrder);
    }
    row._dutyGroup=tr.dataset.dutyGroup||"";
    row._hotel=tr.dataset.hotel||"";

    if(tr.dataset.sectorIndex!==""){
      row._sectorIndex=Number(tr.dataset.sectorIndex);
    }
    if(tr.dataset.sectorCount!==""){
      row._sectorCount=Number(tr.dataset.sectorCount);
    }

    return row;
  });
}
function toMinutes(t){let m=String(t||"").match(/(\d{1,3}):(\d{2})/);return m?(+m[1]*60+ +m[2]):0}
function hhmm(n){return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`}
function updateStats(){
  const rows=getRows();
  let fh=0;
  let dh=0;
  const rowsByDate=new Map();

  rows.forEach(row=>{
    fh+=toMinutes(row.block);
    dh+=toMinutes(row.duty);

    const date=String(row.date||"").trim();
    if(!date) return;

    if(!rowsByDate.has(date)) rowsByDate.set(date,[]);
    rowsByDate.get(date).push(row);
  });

  const offDates=new Set();

  rowsByDate.forEach((dateRows,date)=>{
    const hasRealDuty=dateRows.some(row=>{
      const item=String(row.item||"").trim().toUpperCase();

      return (
        !row._overnightContinuation &&
        item &&
        !["D","DO","DO1","OFF"].includes(item)
      );
    });

    const hasOffCode=dateRows.some(row=>{
      const item=String(row.item||"").trim().toUpperCase();

      return (
        !row._overnightContinuation &&
        ["D","DO","DO1","OFF"].includes(item)
      );
    });

    /*
     * A duplicated D placeholder must not count when the same date also has a
     * flight, training or other real duty. Layover dates remain blank.
     */
    if(hasOffCode && !hasRealDuty){
      offDates.add(date);
    }
  });

  $("#fh").textContent=officialFH || hhmm(fh);
  $("#dh").textContent=officialDH || hhmm(dh);
  $("#off").textContent=offDates.size;
}
tbody.addEventListener("input",()=>{classifyRows();updateStats();renderNextDuty();if(crewViewMode==="calendar")renderCalendarView();if(crewViewMode==="timeline")renderTimelineView()});


function updateCompactProfile(){
  const name=($("#name")?.value||"").trim();
  const staff=($("#staff")?.value||"").trim();
  const rank=($("#rank")?.value||"").trim();
  const fleet=($("#fleet")?.value||"").trim();
  const base=($("#base")?.value||"").trim();

  const compact=$("#compactProfile");
  if(!compact) return;

  $("#compactName").textContent=name||"Crew Member";
  $("#compactMeta").textContent=[staff,rank,fleet,base].filter(Boolean).join(" · ");
  compact.classList.toggle("hidden",!name);
}


function parseOfficialRosterPeriod(text){
  const match=String(text||"").match(
    /Roster Report\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{2}-[A-Za-z]{3}-\d{4})/i
  );

  if(!match) return null;

  const start=parseRosterDate(match[1]);
  const end=parseRosterDate(match[2]);

  return start&&end
    ? {
        start,
        end,
        startText:fmtDate(start),
        endText:fmtDate(end),
        key:`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}`
      }
    : null;
}

function flightAirport(value){
  return String(value||"").trim().split(/\s+/)[0]||"";
}

function dateKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function markLayoverCalendarRows(rows,base){
  const output=rows.map(row=>({...row}));
  const flights=output
    .filter(row=>
      /^MH\d+/i.test(String(row.item||"").trim()) &&
      parseRosterDate(row.date)
    )
    .sort((a,b)=>parseRosterDate(a.date)-parseRosterDate(b.date));

  const layoverDates=new Set();

  for(let index=0;index<flights.length-1;index++){
    const outbound=flights[index];
    const inbound=flights[index+1];

    const outboundDate=parseRosterDate(outbound.date);
    const inboundDate=parseRosterDate(inbound.date);
    if(!outboundDate||!inboundDate) continue;

    const awayStation=flightAirport(outbound.arr);
    const nextDeparture=flightAirport(inbound.dep);

    if(
      !awayStation ||
      awayStation===base ||
      nextDeparture!==awayStation
    ) continue;

    const cursor=new Date(outboundDate);
    cursor.setDate(cursor.getDate()+1);

    while(cursor<inboundDate){
      layoverDates.add(dateKey(cursor));
      cursor.setDate(cursor.getDate()+1);
    }
  }

  output.forEach(row=>{
    const date=parseRosterDate(row.date);
    if(!date || !layoverDates.has(dateKey(date))) return;

    if(row._syntheticCalendarRow){
      row._layoverDay=true;
      row.item="";
    }
  });

  return output;
}

function rosterFingerprint(rows){
  return rows.map(row=>[
    row.date,
    row.dutyStart,
    row.item,
    row.dep,
    row.arr,
    row.dutyEnd,
    row.block,
    row.duty,
    row.ac
  ].map(value=>String(value||"").trim()).join("|"));
}

const VALIDATION_FIXTURES={
  "2026-06":{
    label:"June 2026",
    fh:"86:16",
    dh:"131:16",
    required:[
      ["31-May-2026","MH6244","KUL 12:53","BOM 17:46","18:31"],
      ["02-Jun-2026","MH195","BOM 02:00","KUL 07:18","08:03"],
      ["03-Jun-2026","MH782","KUL 15:06","BKK 17:20",""],
      ["03-Jun-2026","MH783","BKK 18:20","KUL 20:36","21:21"],
      ["30-Jun-2026","330BLP1Z","KUL 08:30","KUL 17:30","17:30"]
    ]
  },
  "2026-07":{
    label:"July 2026",
    fh:"39:56",
    dh:"103:39",
    required:[
      ["01-Jul-2026","330BLP23","KUL 13:00","KUL 17:00","17:30"],
      ["11-Jul-2026","S2-330","KUL 06:00","KUL 07:45","07:45"],
      ["11-Jul-2026","330BLP32","KUL 08:45","KUL 11:30","12:00"],
      ["29-Jul-2026","MH318","KUL 23:45","",""],
      ["31-Jul-2026","MH319","PKX 10:15","KUL 16:17","17:02"]
    ]
  },
  "2026-08":{
    label:"August 2026",
    fh:"65:39",
    dh:"111:04",
    required:[
      ["01-Aug-2026","MH147","KUL 20:34","",""],
      ["06-Aug-2026","MH127","KUL 19:30","",""],
      ["17-Aug-2026","DSA","KUL 08:30","KUL 17:30","17:30"],
      ["31-Aug-2026","MH191","DEL 01:30","KUL 06:55","07:40"]
    ]
  }
};

function validateKnownRoster(rows){
  const fixture=officialRosterPeriod
    ? VALIDATION_FIXTURES[officialRosterPeriod.key]
    : null;

  const issues=[];
  const fingerprints=rosterFingerprint(rows);

  // Generic integrity check for every roster revision: only rows inside the
  // official roster period belong to the printed monthly FH / DH totals.
  // Carry-over return sectors from the next month remain visible in CrewView
  // but must not contaminate this month's validation.
  const validationRows=rows.filter(row=>{
    if(!officialRosterPeriod) return true;
    const date=parseRosterDate(row.date);
    if(!date) return false;
    return date>=officialRosterPeriod.start && date<=officialRosterPeriod.end;
  });

  const parsedFH=hhmm(
    validationRows.reduce((sum,row)=>sum+toMinutes(row.block),0)
  );
  const parsedDH=hhmm(
    validationRows.reduce((sum,row)=>sum+toMinutes(row.duty),0)
  );

  if(officialFH && parsedFH!==officialFH){
    issues.push(`Parsed flying hours ${parsedFH} do not match roster total ${officialFH}`);
  }
  if(officialDH && parsedDH!==officialDH){
    issues.push(`Parsed duty hours ${parsedDH} do not match roster total ${officialDH}`);
  }

  // Exact fixtures are revision-specific. Only run their required-row checks
  // when the current PDF has the same official monthly totals as that fixture.
  // Airline rosters are amended during the month, so a newer revision must not
  // be flagged as broken simply because its legitimate totals/times changed.
  const sameKnownRevision=Boolean(
    fixture &&
    (!fixture.fh || !officialFH || fixture.fh===officialFH) &&
    (!fixture.dh || !officialDH || fixture.dh===officialDH)
  );

  if(sameKnownRevision){
    fixture.required.forEach(([date,item,dep,arr,end])=>{
      const found=fingerprints.some(line=>{
        const fields=line.split("|");
        return (
          fields[0]===date &&
          fields[2]===item &&
          (!dep || fields[3]===dep) &&
          (!arr || fields[4]===arr) &&
          (!end || fields[5]===end)
        );
      });

      if(!found){
        issues.push(`${date}: missing or incorrect ${item}`);
      }
    });
  }

  const duplicateKeys=new Set();
  const duplicates=[];

  rows.forEach(row=>{
    if(row._overnightContinuation) return;

    const key=[
      row.date,
      row.dutyStart,
      row.item,
      row.dep,
      row.arr
    ].join("|");

    if(duplicateKeys.has(key) && String(row.item||"").trim()){
      duplicates.push(`${row.date} ${row.item}`);
    }
    duplicateKeys.add(key);
  });

  if(duplicates.length){
    issues.push(`Duplicate rows: ${[...new Set(duplicates)].join(", ")}`);
  }

  const revisedKnownMonth=Boolean(fixture && !sameKnownRevision);
  const label=fixture?.label || "Roster";

  return {
    known:Boolean(fixture),
    revised:revisedKnownMonth,
    passed:issues.length===0,
    label,
    issues,
    message:issues.length
      ? `${label} validation found ${issues.length} issue${issues.length===1?"":"s"}.`
      : revisedKnownMonth
        ? `${label} revised roster validated successfully.`
        : fixture
          ? `${label} validation passed.`
          : "Roster converted and integrity checks passed."
  };
}

function updateRosterSourceNote(){
  const note=$("#rosterSourceNote");
  if(!note) return;

  const now=new Date();
  const historical=Boolean(
    officialRosterPeriod?.end &&
    officialRosterPeriod.end < new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
  );

  note.textContent=
    "Roster Block Hours and Roster Duty Hours come from the uploaded PDF. " +
    "Live iFlight Actual Roster totals can differ after operational updates.";
}

function renderValidation(result){
  const element=$("#validationResult");
  if(!element) return;

  element.classList.remove("hidden","pass","fail","neutral");
  element.classList.add(
    result.known
      ? (result.passed?"pass":"fail")
      : "neutral"
  );

  if(result.passed){
    element.innerHTML=`<strong>✓ ${esc(result.message)}</strong>`;
  }else{
    element.innerHTML=`
      <strong>⚠ ${esc(result.message)}</strong>
      <ul>${result.issues.map(issue=>`<li>${esc(issue)}</li>`).join("")}</ul>
    `;
  }
}

function parseHeader(text){
  const head=String(text||"").replace(/\s+/g," ").trim();
  officialRosterPeriod=parseOfficialRosterPeriod(head);

  // This roster PDF places the crew profile BEFORE "Roster Report" in its
  // internal text order, even though it is visually shown on the same header.
  // Search the complete extracted text instead of only the text after the date range.
  let person=head.match(
    /([A-Z][A-Z .'-]{5,}?)\s*\|\s*(\d{5,})\s*\|\s*([A-Z0-9]{2,5})\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,4})(?=\s|Roster Report|FH|$)/i
  );

  // Fallback when PDF.js drops the vertical bars.
  if(!person){
    person=head.match(
      /([A-Z][A-Z .'-]{5,}?)\s+(\d{5,})\s+([A-Z0-9]{2,5})\s+([A-Z]{3})\s+([A-Z]{2,4})(?=\s+Roster Report|\s+FH\s*:|$)/i
    );
  }

  if(person){
    $("#name").value=person[1].trim().replace(/\s{2,}/g," ");
    $("#staff").value=person[2].trim();
    $("#fleet").value=person[3].trim();
    $("#base").value=person[4].trim();
    $("#rank").value=person[5].trim();
  }

  const fh=head.match(/\bFH\s*:\s*(\d+:\d{2})/i);
  const dh=head.match(/\bDH\s*:\s*(\d+:\d{2})/i);
  if(fh){officialFH=fh[1];$("#fh").textContent=officialFH;}
  if(dh){officialDH=dh[1];$("#dh").textContent=officialDH;}
  updateCompactProfile();
  updateRosterSourceNote();
}
function closest(items, xMin,xMax, y, tol=9){
  return items.filter(i=>i.x>=xMin&&i.x<xMax&&Math.abs(i.y-y)<=tol)
              .sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ").trim();
}
function cleanTime(v){return v.replace(/\s+/g,"").replace("(+ 1)","(+1)")}

/*
 * Some iFlight multi-sector rows omit Duty Report / Duty Hrs on the second
 * sector. On those continuation rows the PDF columns can shift one cell left:
 *   Duty End -> block, Flying Hrs -> duty.
 * Detect that layout by checking whether the parsed "block" is actually a
 * clock time shortly after arrival, then restore the values to their correct
 * columns. This keeps normal single-sector and already-correct rows untouched.
 */
function normalizePilotContinuationColumns(rows){
  const clockMinutes=value=>{
    const matches=[...String(value||"").matchAll(/(\d{1,2}):(\d{2})/g)];
    if(!matches.length) return null;
    const match=matches[matches.length-1];
    const hours=Number(match[1]);
    const minutes=Number(match[2]);
    if(hours>23 || minutes>59) return null;
    return hours*60+minutes;
  };

  return rows.map(sourceRow=>{
    const row={...sourceRow};
    const isFlight=/^MH\d{2,4}$/i.test(String(row.item||"").trim());

    /*
     * Do not depend on continuation metadata here. Some iFlight revisions
     * parse the second sector without _pilotContinuation/_sectorIndex even
     * though its columns are visibly shifted. The row values themselves are
     * the reliable signal:
     *   - flight row
     *   - no parsed Duty End
     *   - both "block" and "duty" populated
     *   - "block" is actually a clock shortly after arrival
     */
    if(
      !isFlight ||
      row._overnightContinuation ||
      !String(row.block||"").trim() ||
      !String(row.duty||"").trim()
    ) return row;

    const arrival=clockMinutes(row.arr);
    const candidateDutyEnd=clockMinutes(row.block);
    const parsedDutyEnd=clockMinutes(row.dutyEnd);

    /*
     * September-style second sector:
     *   Arr/End   Duty End   Block Hrs   Duty Hrs
     *   KUL16:00  16:45      16:45       02:55
     *
     * Duty End has already landed in the correct column, but the same clock
     * is duplicated into Block Hrs and the real Flying Hrs is shifted into
     * Duty Hrs. Detect that duplicate explicitly.
     */
    if(
      parsedDutyEnd!==null &&
      candidateDutyEnd!==null &&
      parsedDutyEnd===candidateDutyEnd
    ){
      row.block=row.duty;
      row.duty="";
      return row;
    }

    // Older shifted layout: Duty End was not populated at all.
    if(String(row.dutyEnd||"").trim()) return row;
    if(arrival===null || candidateDutyEnd===null) return row;

    const minutesAfterArrival=(candidateDutyEnd-arrival+1440)%1440;

    // A normal post-flight duty end is expected shortly after arrival. The
    // wide 3-hour ceiling also covers unusual delays without confusing a real
    // flight-duration value for a clock time.
    if(minutesAfterArrival<=180){
      row.dutyEnd=row.block;
      row.block=row.duty;
      row.duty="";
    }

    return row;
  });
}
function buildRows(items,w,h,pageNumber=1){
  const X={
    date:[0.02,0.09],
    activity:[0.09,0.18],
    dutyStart:[0.185,0.225],
    item:[0.235,0.285],
    work:[0.33,0.36],
    dep:[0.40,0.46],
    arr:[0.465,0.52],
    dutyEnd:[0.56,0.61],
    block:[0.61,0.64],
    duty:[0.64,0.68],
    ac:[0.72,0.755]
  };

  const inColumn=(item,name)=>
    item.x>=w*X[name][0] &&
    item.x<w*X[name][1];

  const col=(name,y,tolerance=7)=>
    items
      .filter(item=>
        inColumn(item,name) &&
        Math.abs(item.y-y)<=tolerance
      )
      .sort((a,b)=>a.x-b.x)
      .map(item=>item.s)
      .join(" ")
      .replace(/\s+/g," ")
      .trim();

  /*
   * Critical rule:
   * Use the PDF's original content sequence to decide which printed date a
   * flight belongs to. The PDF text stream lists:
   *
   * 03-Jun date → MH782 → MH783 → 04-Jun date
   *
   * even though MH783 and the 04-Jun date can be very close vertically.
   * Y-coordinate clustering alone therefore attached MH783 to 04-Jun.
   */
  const structuralItems=items
    .filter(item=>{
      const isDate=
        inColumn(item,"date") &&
        /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(item.s);

      const isFlight=
        inColumn(item,"item") &&
        /^MH\d{2,4}$/i.test(item.s);

      return isDate || isFlight;
    })
    .sort((a,b)=>
      Number(a.sourceIndex??0)-Number(b.sourceIndex??0)
    );

  const rows=[];
  let currentDate="";
  let lastDateSourceIndex=-1;
  let visualOrder=0;

  structuralItems.forEach(anchor=>{
    const isDate=/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(anchor.s);
    const isFlight=/^MH\d{2,4}$/i.test(anchor.s);

    if(isDate){
      currentDate=anchor.s;
      lastDateSourceIndex=Number(anchor.sourceIndex??lastDateSourceIndex);

      /*
       * Create date-only rows (D, DO, training/ground duty) here. Flight rows
       * are created when their MH anchor is reached later in the source stream.
       */
      const y=anchor.y;
      const activity=col("activity",y,7);
      const dutyStart=cleanTime(col("dutyStart",y,7));
      const flightOnSameLine=col("item",y,4).match(/^MH\d{2,4}$/i);

      if(!flightOnSameLine){
        let item="";
        const activityCode=activity.trim().split(/\s+/)[0]||"";

        if(
          /^(?:D|DO\d?|DSA|OFF|AL|SL|S\d+-\d+|\d{3}BLP[A-Z0-9-]*)$/i
            .test(activityCode)
        ){
          item=activityCode;
        }

        if(item){
          let dep=col("dep",y,9).replace(/\s+/g," ").trim();
          let arr=cleanNextDayMarker(
            col("arr",y,11).replace(/\s+/g," ").trim()
          );
          let dutyEnd=cleanNextDayMarker(
            cleanTime(col("dutyEnd",y,11))
          );
          let block=cleanTime(col("block",y,7));
          let duty=cleanTime(col("duty",y,7));
          let ac=col("ac",y,7).trim();

          if(/^(D|DO|DO1|OFF)$/i.test(item)){
            dep="";
            arr="";
            dutyEnd="";
            block="";
            duty="";
            ac="";
          }

          rows.push({
            date:currentDate,
            day:dayName(currentDate),
            dutyStart:/^(D|DO|DO1|OFF)$/i.test(item) ? "" : dutyStart,
            item,
            dep,
            arr,
            dutyEnd,
            work:"",
            block,
            duty,
            ac,
            _printedDate:true,
            _pageNumber:pageNumber,
            _visualOrder:visualOrder++
          });
        }
      }

      return;
    }

    if(!isFlight || !currentDate) return;

    const y=anchor.y;
    const item=anchor.s.trim();
    const dutyStart=cleanTime(col("dutyStart",y,7));
    const work=col("work",y,7).trim();
    const dep=col("dep",y,9).replace(/\s+/g," ").trim();
    const arr=cleanNextDayMarker(
      col("arr",y,11).replace(/\s+/g," ").trim()
    );
    const dutyEnd=cleanNextDayMarker(
      cleanTime(col("dutyEnd",y,11))
    );
    const block=cleanTime(col("block",y,7));
    const duty=cleanTime(col("duty",y,7));
    const ac=col("ac",y,7).trim();

    const printedDateOnLine=items.some(itemCandidate=>
      inColumn(itemCandidate,"date") &&
      /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(itemCandidate.s) &&
      Math.abs(itemCandidate.y-y)<=4
    );

    const isContinuation=!printedDateOnLine;

    rows.push({
      date:currentDate,
      day:dayName(currentDate),
      dutyStart:isContinuation ? "" : dutyStart,
      item,
      dep,
      arr,
      dutyEnd,
      work,
      block,
      duty:isContinuation ? "" : duty,
      ac,
      _pilotContinuation:isContinuation,
      _printedDate:printedDateOnLine,
      _pageNumber:pageNumber,
      _sourceIndex:Number(anchor.sourceIndex??lastDateSourceIndex),
      _dutyGroup:`PILOT|${currentDate}`,
      _sectorIndex:visualOrder,
      _visualOrder:visualOrder++
    });
  });

  return rows;
}


function buildPairingRows(items,w,h,pageNumber=1){
  const inRange=(item,left,right)=>
    item.x>=w*left && item.x<w*right;

  const textAt=(left,right,y,tolerance=7)=>
    items
      .filter(item=>
        inRange(item,left,right) &&
        Math.abs(item.y-y)<=tolerance
      )
      .sort((a,b)=>a.x-b.x)
      .map(item=>item.s)
      .join(" ")
      .replace(/\s+/g," ")
      .trim();

  /*
   * PDF.js may place the date and flight number from the SAME printed row
   * on slightly different baselines. Treating them as separate anchors caused:
   * - the second sector to move to the next date;
   * - duplicated dates;
   * - MH604 / MH2614 / MH2594 / MH2593 to appear out of sequence.
   *
   * We therefore cluster nearby date/flight anchors into one physical row.
   */
  const rawAnchors=items
    .filter(item=>{
      if(item.y<h*0.075) return false;

      const isDate=
        /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(item.s) &&
        item.x<w*0.09;

      const isFlight=
        /^MH\d{2,4}$/i.test(item.s) &&
        inRange(item,0.238,0.285);

      return isDate || isFlight;
    })
    .sort((a,b)=>a.y-b.y);

  const clusters=[];

  rawAnchors.forEach(anchor=>{
    const last=clusters[clusters.length-1];

    if(last && Math.abs(anchor.y-last.meanY)<=10){
      last.items.push(anchor);
      last.meanY=
        last.items.reduce((sum,item)=>sum+item.y,0) /
        last.items.length;
    }else{
      clusters.push({
        items:[anchor],
        meanY:anchor.y
      });
    }
  });

  const physicalRows=clusters.map((cluster,index)=>{
    const flightAnchor=cluster.items.find(item=>/^MH\d{2,4}$/i.test(item.s));
    const dateAnchor=cluster.items.find(item=>/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(item.s));

    return {
      y:flightAnchor?.y ?? dateAnchor?.y ?? cluster.meanY,
      explicitDate:dateAnchor?.s || "",
      visualOrder:index
    };
  });

  const rows=[];
  let currentDate="";
  let currentDuty=null;
  let sectorIndex=0;

  physicalRows.forEach(({y,explicitDate,visualOrder})=>{
    if(explicitDate && explicitDate!==currentDate){
      currentDate=explicitDate;

      // A newly printed date starts a new roster date. Continuation sectors
      // have no printed date, so resetting here is safe and deterministic.
      currentDuty=null;
      sectorIndex=0;
    }

    if(!currentDate) return;

    /*
     * Exact column boundaries measured from the supplied 1200-point roster PDF.
     * The previous ranges overlapped several columns, causing values such as
     * "13:35MH2634" and pairing references to be merged into the wrong cells.
     */
    const activity=textAt(0.095,0.185,y,7);
    const report=cleanTime(textAt(0.190,0.222,y,7));
    const item=textAt(0.238,0.285,y,7);
    const work=textAt(0.330,0.365,y,7);

    const dep=textAt(0.400,0.455,y,7);
    const arr=cleanNextDayMarker(
      textAt(0.465,0.520,y,11)
    );

    const dutyEnd=cleanNextDayMarker(
      cleanTime(textAt(0.555,0.600,y,11))
    );

    const block=cleanTime(textAt(0.600,0.642,y,7));
    const duty=cleanTime(textAt(0.640,0.690,y,7));
    const ac=textAt(0.720,0.765,y,7);

    const isFlight=/^MH\d{2,4}$/i.test(item);
    const cleanActivity=activity.split(/\s+/)[0]||"";
    const offCode=/^(D|DO)$/i.test(cleanActivity);

    if(offCode){
      rows.push({
        date:currentDate,
        day:dayName(currentDate),
        dutyStart:"",
        item:"D",
        dep:"",
        arr:"",
        dutyEnd:"",
        work:"",
        block:"",
        duty:"",
        ac:"",
        _visualOrder:visualOrder
      });
      return;
    }

    if(isFlight){
      if(report){
        currentDuty={
          date:currentDate,
          day:dayName(currentDate),
          group:
            `${currentDate}|${report}|${item}|P${pageNumber}|${visualOrder}`
        };
        sectorIndex=0;
      }else if(currentDuty){
        sectorIndex+=1;
      }else{
        // Page-boundary fallback. It remains on the latest explicitly printed date.
        currentDuty={
          date:currentDate,
          day:dayName(currentDate),
          group:
            `${currentDate}|CONT|${item}|P${pageNumber}|${visualOrder}`
        };
        sectorIndex=0;
      }

      rows.push({
        date:currentDuty.date,
        day:currentDuty.day,
        dutyStart:sectorIndex===0 ? report : "",
        item,
        dep,
        arr,
        dutyEnd,
        work,
        block,
        duty:sectorIndex===0 ? duty : "",
        ac,
        _dutyGroup:currentDuty.group,
        _sectorIndex:sectorIndex,
        _visualOrder:visualOrder
      });

      if(dutyEnd){
        currentDuty=null;
        sectorIndex=0;
      }
      return;
    }

    // Date-only OFF/ground/standby/training row.
    if(explicitDate){
      const groundItem=cleanActivity || "DUTY";

      rows.push({
        date:currentDate,
        day:dayName(currentDate),
        dutyStart:report,
        item:groundItem,
        dep,
        arr,
        dutyEnd,
        work,
        block,
        duty,
        ac,
        _visualOrder:visualOrder
      });
    }
  });

  const counts=new Map();
  rows.forEach(row=>{
    if(row._dutyGroup){
      counts.set(
        row._dutyGroup,
        (counts.get(row._dutyGroup)||0)+1
      );
    }
  });
  rows.forEach(row=>{
    if(row._dutyGroup){
      row._sectorCount=counts.get(row._dutyGroup)||1;
    }
  });

  return rows;
}

function parseRosterDate(s){
  const m=String(s||"").match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if(!m)return null;
  const mm={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}[m[2]];
  return mm===undefined?null:new Date(+m[3],mm,+m[1]);
}
function fmtDate(d){
  const mon=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  return `${String(d.getDate()).padStart(2,"0")}-${mon}-${d.getFullYear()}`;
}

function cleanNextDayMarker(value){
  return String(value||"")
    .replace(/\s*\(\s*\+\s*1\s*\)\s*/g,"(+1)")
    .trim();
}

function withoutNextDayMarker(value){
  return cleanNextDayMarker(value).replace(/\(\+1\)/g,"").trim();
}

function followingRosterDate(dateText){
  const d=parseRosterDate(dateText);
  if(!d) return dateText;
  d.setDate(d.getDate()+1);
  return fmtDate(d);
}

/*
  Read explicit (+1) timings directly from the PDF text layer.
  This avoids relying only on the visual column parser.
*/
function extractOvernightMap(pdfText){
  const text=String(pdfText||"").replace(/\s+/g," ");
  const map=new Map();

  const re=/(\d{2}-[A-Za-z]{3}-\d{4})\s+(?:(?:\d{3}-\d{2}\/\d{8}\/F)\s+)?(\d{2}:\d{2})\s+(MH\d{2,4})\s+(OP|PS)\s+([A-Z]{3})\s+(\d{2}:\d{2})\s+([A-Z]{3})\s+(\d{2}:\d{2})\s*\(\s*\+\s*1\s*\)\s+(\d{2}:\d{2})\s*\(\s*\+\s*1\s*\)/g;

  let m;
  while((m=re.exec(text))!==null){
    map.set(`${m[1]}|${m[3]}`,{
      arrival:`${m[7]} ${m[8]}`,
      dutyEnd:m[9]
    });
  }
  return map;
}

function applyClassicOvernightTiming(rows,pdfText){
  const source=rows.map(r=>({...r}));
  const overnightMap=extractOvernightMap(pdfText);
  const continuations=new Map();

  for(const row of source){
    const key=`${row.date}|${row.item}`;
    const fromText=overnightMap.get(key);

    const arrHasMarker=/\(\s*\+\s*1\s*\)/.test(row.arr||"");
    const endHasMarker=/\(\s*\+\s*1\s*\)/.test(row.dutyEnd||"");

    const arrival=fromText?.arrival || (arrHasMarker ? withoutNextDayMarker(row.arr) : "");
    const dutyEnd=fromText?.dutyEnd || (endHasMarker ? withoutNextDayMarker(row.dutyEnd) : "");

    if(!arrival && !dutyEnd) continue;

    const nextDate=followingRosterDate(row.date);
    const continuation={
      date:nextDate,
      day:dayName(nextDate),
      dutyStart:"",
      item:"",
      dep:"",
      arr:arrival,
      dutyEnd:dutyEnd,
      work:"",
      block:"",
      duty:"",
      ac:"",
      _overnightContinuation:true
    };

    row.arr="";
    row.dutyEnd="";

    if(!continuations.has(nextDate)) continuations.set(nextDate,[]);
    continuations.get(nextDate).push(continuation);
  }

  const result=[];
  const handled=new Set();

  for(let i=0;i<source.length;i++){
    const row=source[i];
    const date=row.date;
    const extras=continuations.get(date)||[];

    if(extras.length && !handled.has(date)){
      const sameDate=[];
      let j=i;
      while(j<source.length && source[j].date===date){
        sameDate.push(source[j]);
        j++;
      }

      const hasVisibleContent=r=>[
        r.dutyStart,r.item,r.dep,r.arr,r.dutyEnd,
        r.work,r.block,r.duty,r.ac
      ].some(v=>String(v||"").trim());

      const first=sameDate[0];
      const blank=!hasVisibleContent(first);

      if(blank){
        first.arr=extras[0].arr;
        first.dutyEnd=extras[0].dutyEnd;
        first._overnightContinuation=true;
        result.push(first);

        extras.slice(1).forEach(extra=>result.push({...extra,date:"",day:""}));
        sameDate
          .slice(1)
          .filter(hasVisibleContent)
          .forEach(r=>result.push({...r,date:"",day:""}));
      } else {
        // Arrival line first, then only real duties beneath it. Completely
        // empty calendar placeholders are discarded so they cannot create a
        // full-height blank row between the continuation and the next date.
        result.push({...extras[0],date,day:dayName(date)});
        extras.slice(1).forEach(extra=>result.push({...extra,date:"",day:""}));
        sameDate
          .filter(hasVisibleContent)
          .forEach(r=>result.push({...r,date:"",day:""}));
      }

      handled.add(date);
      i=j-1;
      continue;
    }

    result.push(row);
  }

  for(const [date,extras] of continuations.entries()){
    if(handled.has(date) || source.some(r=>r.date===date)) continue;
    extras.forEach((extra,index)=>{
      result.push({...extra,date:index===0?date:"",day:index===0?dayName(date):""});
    });
  }

  return result;
}



function moveExplicitNextDayTimings(rows){
  const source=rows.map(row=>({...row}));
  const additions=new Map();

  const nextDateString=dateText=>{
    const date=parseRosterDate(dateText);
    if(!date) return "";
    date.setDate(date.getDate()+1);
    return fmtDate(date);
  };

  const hasPlusOne=value=>
    /\(\+1\)/.test(String(value||""));

  source.forEach((row,index)=>{
    const arrival=String(row.arr||"").trim();
    const dutyEnd=String(row.dutyEnd||"").trim();

    if(!hasPlusOne(arrival) && !hasPlusOne(dutyEnd)) return;

    const nextDate=nextDateString(row.date);
    if(!nextDate) return;

    const continuation={
      date:nextDate,
      day:dayName(nextDate),
      dutyStart:"",
      item:"",
      dep:"",
      arr:arrival,
      dutyEnd:dutyEnd,
      work:"",
      block:"",
      duty:"",
      ac:"",
      _overnightContinuation:true,
      _sourceDutyGroup:row._dutyGroup||"",
      _sourceIndex:index
    };

    // Remove next-day values from the departure-date row.
    row.arr="";
    row.dutyEnd="";

    if(!additions.has(nextDate)) additions.set(nextDate,[]);
    additions.get(nextDate).push(continuation);
  });

  const result=[];
  const insertedDates=new Set();

  source.forEach(row=>{
    const date=row.date;
    const continuations=additions.get(date)||[];

    if(continuations.length && !insertedDates.has(date)){
      // Continuation information appears first on the next calendar date.
      continuations.forEach((continuation,index)=>{
        result.push({
          ...continuation,
          date:index===0 ? date : "",
          day:index===0 ? dayName(date) : ""
        });
      });
      insertedDates.add(date);
    }

    result.push(row);
  });

  // Handle a continuation whose next date was absent from the original month rows.
  for(const [date,continuations] of additions.entries()){
    if(insertedDates.has(date)) continue;

    continuations.forEach((continuation,index)=>{
      result.push({
        ...continuation,
        date:index===0 ? date : "",
        day:index===0 ? dayName(date) : ""
      });
    });
  }

  return result;
}



function removeOffPlaceholdersOnDutyDates(rows){
  const dutyDates=new Set(
    rows
      .filter(row=>{
        const item=String(row.item||"").trim().toUpperCase();

        return (
          row.date &&
          !row._overnightContinuation &&
          item &&
          !["D","DO","DO1","OFF"].includes(item)
        );
      })
      .map(row=>row.date)
  );

  return rows.filter(row=>{
    if(!dutyDates.has(row.date)) return true;

    const item=String(row.item||"").trim().toUpperCase();
    return !["D","DO","DO1","OFF"].includes(item);
  });
}

function removeCompletelyBlankRows(rows){
  return rows.filter(row=>{
    return [
      row.date,row.day,row.dutyStart,row.item,row.dep,row.arr,row.dutyEnd,
      row.work,row.block,row.duty,row.ac
    ].some(value=>String(value||"").trim()!=="");
  });
}

function removeSyntheticOffRowsOnOvernightDates(rows){
  const overnightDates=new Set(
    rows
      .filter(row=>row._overnightContinuation && row.date)
      .map(row=>row.date)
  );

  return rows.filter(row=>{
    if(!overnightDates.has(row.date)) return true;
    if(row._overnightContinuation) return true;

    const item=String(row.item||"").trim().toUpperCase();
    const noRosterContent=
      !String(row.dutyStart||"").trim() &&
      !String(row.dep||"").trim() &&
      !String(row.arr||"").trim() &&
      !String(row.dutyEnd||"").trim() &&
      !String(row.work||"").trim() &&
      !String(row.block||"").trim() &&
      !String(row.duty||"").trim() &&
      !String(row.ac||"").trim();

    // When an overnight continuation already represents this date, remove the
    // synthetic calendar placeholder for the same date. Layover placeholders
    // have their temporary "D" cleared again before this function runs, so
    // checking only item === "D" leaves a second empty row (a visible gap).
    // A genuine full layover day is preserved because it has no continuation
    // row on that date.
    const redundantSyntheticPlaceholder=
      row._syntheticCalendarRow===true &&
      noRosterContent &&
      (item==="" || item==="D");

    return !redundantSyntheticPlaceholder;
  });
}

function markRemainingBlankDaysAsOff(rows){
  return rows.map(row=>{
    if(row._overnightContinuation) return row;

    const hasDutyInformation=[
      row.dutyStart,
      row.item,
      row.dep,
      row.arr,
      row.dutyEnd,
      row.work,
      row.block,
      row.duty,
      row.ac
    ].some(value=>String(value||"").trim()!=="");

    if(!hasDutyInformation){
      return {
        ...row,
        item:"D",
        _syntheticCalendarRow:
          row._syntheticCalendarRow===true
      };
    }

    return row;
  });
}


function normalizePairingDutySequence(rows){
  const normalized=[];
  let activeDuty=null;
  let sectorIndex=0;

  rows.forEach((sourceRow,visualIndex)=>{
    const row={...sourceRow};
    const item=String(row.item||"").trim().toUpperCase();
    const report=String(row.dutyStart||"").trim();
    const isFlight=/^MH\d{2,4}$/.test(item);
    const isOff=item==="D" || item==="DO" || item==="OFF";
    const isGroundDuty=!isFlight && !isOff && (
      item ||
      report ||
      String(row.dep||"").trim() ||
      String(row.arr||"").trim() ||
      String(row.dutyEnd||"").trim()
    );

    if(isOff){
      activeDuty=null;
      sectorIndex=0;
      row.item="D";
      normalized.push(row);
      return;
    }

    if(isFlight && report){
      // A report time always starts a new duty.
      activeDuty={
        date:row.date,
        day:row.day||dayName(row.date),
        group:`${row.date}|${report}|${item}|${visualIndex}`
      };
      sectorIndex=0;

      row.date=activeDuty.date;
      row.day=activeDuty.day;
      row._dutyGroup=activeDuty.group;
      row._sectorIndex=0;
      normalized.push(row);
      return;
    }

    if(isFlight && activeDuty){
      // A flight without a new report time is a continuation sector of the
      // currently active duty, regardless of a nearby printed date label.
      sectorIndex+=1;
      row.date=activeDuty.date;
      row.day=activeDuty.day;
      row.dutyStart="";
      row._dutyGroup=activeDuty.group;
      row._sectorIndex=sectorIndex;
      normalized.push(row);

      // Duty end on a sector closes that duty.
      if(String(row.dutyEnd||"").trim()){
        activeDuty=null;
        sectorIndex=0;
      }
      return;
    }

    if(isGroundDuty){
      activeDuty=null;
      sectorIndex=0;
      normalized.push(row);
      return;
    }

    normalized.push(row);
  });

  const counts=new Map();
  normalized.forEach(row=>{
    if(row._dutyGroup){
      counts.set(
        row._dutyGroup,
        (counts.get(row._dutyGroup)||0)+1
      );
    }
  });

  normalized.forEach(row=>{
    if(row._dutyGroup){
      row._sectorCount=counts.get(row._dutyGroup)||1;
    }
  });

  return normalized;
}

function fillEveryDay(rows=getRows(),period=officialRosterPeriod){
  const valid=rows
    .map(row=>({row,date:parseRosterDate(row.date)}))
    .filter(entry=>entry.date);

  if(!valid.length){
    status.textContent="Load a roster first.";
    return rows;
  }

  const mainStart=period?.start || valid.reduce(
    (earliest,current)=>current.date<earliest?current.date:earliest,
    valid[0].date
  );
  const mainEnd=period?.end || new Date(
    mainStart.getFullYear(),
    mainStart.getMonth()+1,
    0
  );

  const byDate=new Map();
  const carryIn=[];
  const carryOut=[];

  valid.forEach(({row,date})=>{
    if(date<mainStart){
      carryIn.push({...row,date:fmtDate(date),day:dayName(fmtDate(date))});
      return;
    }

    if(date>mainEnd){
      carryOut.push({...row,date:fmtDate(date),day:dayName(fmtDate(date))});
      return;
    }

    const key=fmtDate(date);
    if(!byDate.has(key)) byDate.set(key,[]);
    byDate.get(key).push(row);
  });

  const full=[...carryIn.sort(
    (a,b)=>parseRosterDate(a.date)-parseRosterDate(b.date)
  )];

  const cursor=new Date(mainStart);
  while(cursor<=mainEnd){
    const key=fmtDate(cursor);
    const entries=byDate.get(key);

    if(entries?.length){
      entries.forEach(row=>full.push({
        ...row,
        date:key,
        day:dayName(key)
      }));
    }else{
      full.push({
        date:key,
        day:dayName(key),
        _syntheticCalendarRow:true
      });
    }

    cursor.setDate(cursor.getDate()+1);
  }

  carryOut
    .sort((a,b)=>parseRosterDate(a.date)-parseRosterDate(b.date))
    .forEach(row=>full.push(row));

  return full;
}


function allTimeTokens(text){
  return [...String(text||"").matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?/g)]
    .map(match=>match[0]);
}


function extractPilotHotelAssignments(pdfText){
  const text=String(pdfText||"").replace(/\s+/g," ").trim();
  const dates=[...text.matchAll(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g)];
  const assignments=[];
  dates.forEach((match,index)=>{
    const date=match[0];
    const chunk=text.slice(match.index,index+1<dates.length?dates[index+1].index:text.length);
    const flight=(chunk.match(/\b(MH\d{2,4})\b/i)||[])[1];
    if(!flight) return;
    const hit=chunk.match(/\b(?:339|333|332|359|350|330|73H|738|737|7M8|A3[2359])\b\s+(.+?)\s+(?:SYSTEM|ACARS|AODB)\b/i);
    if(!hit) return;
    const hotel=String(hit[1]||"").replace(/\s+/g," ").trim();
    if(!hotel||/^\d/.test(hotel)||/\b(?:Updated|ACY|SDC)\b/i.test(hotel)) return;
    assignments.push({date,item:flight.toUpperCase(),hotel});
  });
  return assignments;
}
function applyPilotHotelAssignments(rows,pdfText){
  const assignments=extractPilotHotelAssignments(pdfText);
  return rows.map(row=>{
    const date=String(row?.date||"").trim();
    const item=String(row?.item||"").trim().toUpperCase();
    if(!item) return row;

    const exact=assignments.find(x=>x.date===date && x.item===item);
    const byFlight=assignments.find(x=>x.item===item);
    const hit=exact||byFlight;

    return hit?{...row,_hotel:hit.hotel}:row;
  });
}

function parseMultiSectorRosterText(pdfText){
  const text=String(pdfText||"").replace(/\s+/g," ").trim();

  // Cabin-crew reports identify these columns in their extracted text.
  const looksLikeMultiSector=
    /Pairing\/Activity/i.test(text) &&
    /Duty\s+Report/i.test(text) &&
    /Dep\s+Stn\s*\/\s*Dep\s+Time/i.test(text);

  if(!looksLikeMultiSector) return [];

  const dateMatches=[
    ...text.matchAll(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g)
  ];

  const rows=[];

  for(let index=0; index<dateMatches.length; index++){
    const dateMatch=dateMatches[index];
    const date=dateMatch[0];
    const start=dateMatch.index + date.length;
    const end=index+1<dateMatches.length
      ? dateMatches[index+1].index
      : text.length;

    let chunk=text.slice(start,end).trim();

    // Remove page/header fragments accidentally captured between dated duties.
    chunk=chunk
      .replace(/Date Item Duty Report[\s\S]*?Updated Date/gi," ")
      .replace(/\s+/g," ")
      .trim();

    if(!chunk) continue;

    // OFF days and days off.
    const off=chunk.match(/^(D|DO)\b/i);
    if(off){
      rows.push({
        date,
        day:dayName(date),
        dutyStart:"",
        item:"D",
        dep:"",
        arr:"",
        dutyEnd:"",
        work:"",
        block:"",
        duty:"",
        ac:""
      });
      continue;
    }

    const sectorMatches=[
      ...chunk.matchAll(
        /(MH\d{2,4})\s+(OP|PS)\s+([A-Z]{3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g
      )
    ];

    if(sectorMatches.length){
      const beforeFirst=chunk.slice(0,sectorMatches[0].index);
      const reportTimes=allTimeTokens(beforeFirst);
      const report=reportTimes.length ? reportTimes[reportTimes.length-1] : "";

      // Aircraft normally appears after each sector's timing information.
      const aircraftMatches=[
        ...chunk.matchAll(/\b(359|333|332|339|73H|7M8|738|737|330|350|A3[2359])\b/g)
      ];
      const defaultAircraft=aircraftMatches.length
        ? aircraftMatches[aircraftMatches.length-1][1]
        : "";

      const dutyGroup=`${date}|${report}|${sectorMatches[0][1]}`;

      sectorMatches.forEach((match,sectorIndex)=>{
        const sectorEnd=match.index+match[0].length;
        const nextSectorStart=sectorIndex+1<sectorMatches.length
          ? sectorMatches[sectorIndex+1].index
          : chunk.length;
        const tail=chunk.slice(sectorEnd,nextSectorStart);
        const tailTimes=allTimeTokens(tail);

        const isLast=sectorIndex===sectorMatches.length-1;
        let dutyEnd="";
        let block="";
        let duty="";

        if(isLast){
          // Last sector format:
          // arrival, duty debrief/end, sector flying hours, total duty hours.
          dutyEnd=tailTimes[0]||"";
          block=tailTimes[1]||"";
          duty=tailTimes[2]||"";
        }else{
          // Intermediate sector format:
          // arrival, sector flying hours, sometimes total duty hours.
          block=tailTimes[0]||"";
          duty=tailTimes[1]||"";
        }

        rows.push({
          date,
          day:dayName(date),
          dutyStart:sectorIndex===0 ? report : "",
          item:match[1],
          dep:`${match[3]} ${match[4]}`,
          arr:`${match[5]} ${match[6]}`,
          dutyEnd,
          work:match[2],
          block,
          duty:sectorIndex===0 ? duty : "",
          ac:defaultAircraft,
          _dutyGroup:dutyGroup,
          _sectorIndex:sectorIndex,
          _sectorCount:sectorMatches.length
        });
      });

      continue;
    }

    // Non-flight duties such as AS4NB or S4NBA.
    const ground=chunk.match(
      /^([A-Z0-9-]+)\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/
    );

    if(ground){
      rows.push({
        date,
        day:dayName(date),
        dutyStart:ground[2],
        item:ground[1],
        dep:`${ground[3]} ${ground[4]}`,
        arr:`${ground[5]} ${ground[6]}`,
        dutyEnd:ground[7],
        work:"",
        block:"",
        duty:"",
        ac:""
      });
    }
  }

  return rows;
}


function recoverPilotRowsByDateSegments(pdfText){
  const text=String(pdfText||"")
    .replace(/\s+/g," ")
    .trim();

  const dateMatches=[
    ...text.matchAll(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g)
  ];

  const recovered=[];

  for(let dateIndex=0;dateIndex<dateMatches.length;dateIndex++){
    const date=dateMatches[dateIndex][0];
    const start=dateMatches[dateIndex].index+date.length;
    const end=dateIndex+1<dateMatches.length
      ? dateMatches[dateIndex+1].index
      : text.length;

    const chunk=text.slice(start,end);

    /*
     * Recover every flight inside the dated section—not only the first one.
     * Continuation sectors such as MH783 have no second date or report time,
     * so they inherit the section date.
     */
    const flightPattern=
      /(?:(\d{1,2}:\d{2})\s+)?(MH\d{2,4})\s+(OP|PS|SFP)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+(?:(\d{1,2}:\d{2}(?:\(\+1\))?)\s+)?(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(?:(?:SFP|M)\s+)?([A-Z0-9]{3})/g;

    let flightMatch;
    let sectorIndex=0;
    let firstReport="";

    while((flightMatch=flightPattern.exec(chunk))!==null){
      const report=flightMatch[1]||"";
      if(report) firstReport=report;

      recovered.push({
        date,
        day:dayName(date),
        dutyStart:sectorIndex===0 ? (report||firstReport) : "",
        item:flightMatch[2],
        work:flightMatch[3],
        dep:`${flightMatch[4]} ${flightMatch[5]}`,
        arr:`${flightMatch[6]} ${flightMatch[7]}`,
        dutyEnd:flightMatch[8]||"",
        block:flightMatch[9],
        duty:sectorIndex===0 ? flightMatch[10] : "",
        ac:flightMatch[11],
        _recoveredFromText:true,
        _sectorIndex:sectorIndex
      });

      sectorIndex+=1;
    }

    /*
     * Recover non-flight duties such as 330BLP1Z, S2-330 and DSA.
     * These rows have no MH flight number but still contain a complete
     * report/departure/arrival/duty-end sequence.
     */
    const groundPattern=
      /\b([A-Z0-9-]{3,})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/g;

    let groundMatch;
    while((groundMatch=groundPattern.exec(chunk))!==null){
      const code=groundMatch[1].toUpperCase();

      if(
        /^MH\d+$/i.test(code) ||
        ["D","DO","DO1","OFF"].includes(code)
      ) continue;

      recovered.push({
        date,
        day:dayName(date),
        dutyStart:groundMatch[2],
        item:code,
        dep:`${groundMatch[3]} ${groundMatch[4]}`,
        arr:`${groundMatch[5]} ${groundMatch[6]}`,
        dutyEnd:groundMatch[7],
        work:"",
        block:"",
        duty:groundMatch[8],
        ac:"",
        _recoveredFromText:true
      });
    }
  }

  return recovered;
}

function restoreMissingPilotDates(rows,pdfText){
  const recovered=recoverPilotRowsByDateSegments(pdfText);
  if(!recovered.length) return rows;

  const output=[...rows];

  recovered.forEach(recoveredRow=>{
    const item=String(recoveredRow.item||"").trim().toUpperCase();

    const visualMatch=output.find(current=>
      String(current.item||"").trim().toUpperCase()===item &&
      current._recoveredFromText!==true
    );

    if(visualMatch){
      /*
       * Keep the physical parser authoritative for DATE assignment, but use
       * the dated text row as authoritative for operational numeric values.
       * This corrects cases where close PDF columns cause block/duty values
       * to be read from the neighbouring field.
       */
      visualMatch.dutyStart=
        recoveredRow.dutyStart || visualMatch.dutyStart || "";
      visualMatch.dep=recoveredRow.dep || visualMatch.dep || "";
      visualMatch.arr=recoveredRow.arr || visualMatch.arr || "";
      visualMatch.dutyEnd=
        recoveredRow.dutyEnd || visualMatch.dutyEnd || "";
      visualMatch.work=recoveredRow.work || visualMatch.work || "";
      visualMatch.block=recoveredRow.block || visualMatch.block || "";
      visualMatch.duty=recoveredRow.duty || visualMatch.duty || "";
      visualMatch.ac=recoveredRow.ac || visualMatch.ac || "";
      return;
    }

    /*
     * If the visual parser placed a continuation sector on the following date,
     * remove that misplaced copy before restoring the text-derived row.
     */
    for(let index=output.length-1;index>=0;index--){
      const current=output[index];
      const currentItem=String(current.item||"").trim().toUpperCase();

      if(
        currentItem===item &&
        current.date!==recoveredRow.date &&
        current._recoveredFromText===true
      ){
        output.splice(index,1);
      }
    }

    const existingIndex=output.findIndex(current=>
      current.date===recoveredRow.date &&
      String(current.item||"").trim().toUpperCase()===item
    );

    if(existingIndex>=0){
      const current=output[existingIndex];

      /*
       * Preserve clean coordinate-derived values. Text recovery fills only
       * genuinely empty fields because PDF text order may not reflect columns.
       */
      output[existingIndex]={
        ...current,
        dutyStart:recoveredRow.dutyStart || current.dutyStart || "",
        dep:recoveredRow.dep || current.dep || "",
        arr:recoveredRow.arr || current.arr || "",
        dutyEnd:recoveredRow.dutyEnd || current.dutyEnd || "",
        work:recoveredRow.work || current.work || "",
        block:recoveredRow.block || current.block || "",
        duty:recoveredRow.duty || current.duty || "",
        ac:recoveredRow.ac || current.ac || ""
      };
      return;
    }

    // Remove a synthetic placeholder for the recovered date.
    for(let index=output.length-1;index>=0;index--){
      const current=output[index];

      if(
        current.date===recoveredRow.date &&
        current._syntheticCalendarRow
      ){
        output.splice(index,1);
      }
    }

    output.push(recoveredRow);
  });

  return output;
}

function recoverMissingFlightRows(text, existingRows){
  const recovered=[];
  const normalized=String(text||"").replace(/\s+/g," ").trim();

  // Text-layer fallback for flight rows that sit very close to a PDF page edge.
  // Example: 31-Aug-2026 00:30 MH191 OP DEL 01:30 KUL 06:55 07:40 05:25 07:10 333
  const re=/(\d{2}-[A-Za-z]{3}-\d{4})\s+(?:(?:\d{3}-\d{2}\/\d{8}\/F)\s+)?(\d{2}:\d{2})\s+(MH\d{2,4})\s+(OP|PS)\s+([A-Z]{3})\s+(\d{2}:\d{2})\s+([A-Z]{3})\s+(\d{2}:\d{2}(?:\(\+1\))?)\s+(\d{2}:\d{2}(?:\(\+1\))?)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([A-Z0-9]{3})/g;
  let m;
  while((m=re.exec(normalized))!==null){
    const row={
      date:m[1], day:dayName(m[1]), dutyStart:m[2], item:m[3],
      work:m[4], dep:`${m[5]} ${m[6]}`, arr:`${m[7]} ${m[8]}`,
      dutyEnd:m[9], block:m[10], duty:m[11], ac:m[12]
    };
    const exists=existingRows.some(r=>r.date===row.date && r.item===row.item);
    if(!exists) recovered.push(row);
  }
  return recovered;
}


let nextDutyTimer=null;
let activeNextDuty=null;

function baseAirportCode(){
  return String($("#base")?.value||"KUL").trim().toUpperCase() || "KUL";
}

function addRosterDays(dateText,days){
  const d=parseRosterDate(dateText);
  if(!d) return dateText;
  d.setDate(d.getDate()+Number(days||0));
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function parseStationClock(value){
  const text=String(value||"").trim();
  const station=(text.match(/\b([A-Z]{3})\b/)||[])[1]||"";
  const tm=text.match(/(\d{1,2}):(\d{2})/);
  if(!tm) return null;
  return {
    station:station.toUpperCase(),
    time:`${String(tm[1]).padStart(2,"0")}:${tm[2]}`,
    nextDay:/\(\+1\)/.test(text)
  };
}

function fixedClockElapsedMinutes(depText,arrText){
  const dep=parseStationClock(depText), arr=parseStationClock(arrText);
  if(!dep||!arr) return null;
  const [dh,dm]=dep.time.split(":").map(Number);
  const [ah,am]=arr.time.split(":").map(Number);
  let diff=(ah*60+am)-(dh*60+dm)+(arr.nextDay?1440:0);
  while(diff<0) diff+=1440;
  return diff;
}

function localClockElapsedMinutes(row){
  const dep=parseStationClock(row?.dep), arr=parseStationClock(row?.arr);
  if(!dep||!arr||!dep.station||!arr.station) return null;
  const depMs=zonedWallTimeToUtcMs(row.date,dep.time,airportTimezone(dep.station));
  const arrDate=addRosterDays(row.date,arr.nextDay?1:0);
  let arrMs=zonedWallTimeToUtcMs(arrDate,arr.time,airportTimezone(arr.station));
  if(!Number.isFinite(depMs)||!Number.isFinite(arrMs)) return null;
  while(arrMs<depMs) arrMs+=86400000;
  return Math.round((arrMs-depMs)/60000);
}

function detectRosterTimeBasis(rows,pdfText){
  const text=String(pdfText||"");
  // Use an explicit label when the exporter includes one.
  if(/(?:^|\s)SLT(?:\s|$)/i.test(text)) return "SLT";
  if(/(?:^|\s)UTC(?:\s|$)|\bZULU\b/i.test(text)) return "UTC";

  let localEvidence=0, fixedEvidence=0;
  (rows||[]).forEach(row=>{
    if(!/^MH\d+/i.test(String(row?.item||""))) return;
    const block=toMinutes(row?.block);
    if(!(block>0)) return;
    const fixed=fixedClockElapsedMinutes(row.dep,row.arr);
    const local=localClockElapsedMinutes(row);
    if(!Number.isFinite(fixed)||!Number.isFinite(local)) return;
    const fixedErr=Math.abs(fixed-block);
    const localErr=Math.abs(local-block);
    // Only count a sample when the timezone interpretation clearly separates.
    if(localErr<=4 && fixedErr>=20) localEvidence++;
    if(fixedErr<=4 && localErr>=20) fixedEvidence++;
  });

  // iFlight SLT means each station's local clock, so timezone-aware elapsed
  // time matches the published block time on cross-zone sectors.
  if(localEvidence>fixedEvidence && localEvidence>0) return "SLT";

  /*
   * iFlight LT is a single local reference (the crew/base local clock), so
   * simple wall-clock subtraction matches block time. UTC is also fixed-zone;
   * therefore an unlabeled UTC PDF is mathematically indistinguishable from
   * LT from the rows alone. Explicit UTC labels are handled above.
   */
  if(fixedEvidence>0) return "LT";
  return "LT";
}

function rosterScheduledUtcMs(dateText,timeText,airport=""){
  const time=String(timeText||"").match(/(\d{1,2}):(\d{2})/);
  const date=rosterDateComponents(dateText);
  if(!time||!date) return null;
  if(rosterTimeBasis==="UTC") return Date.UTC(date.year,date.month-1,date.day,Number(time[1]),Number(time[2]),0,0);
  const zone=rosterTimeBasis==="SLT"
    ? airportTimezone(airport||baseAirportCode())
    : airportTimezone(baseAirportCode());
  return zonedWallTimeToUtcMs(dateText,`${time[1]}:${time[2]}`,zone);
}

function dutyDateTime(row){
  if(!row?.date || !row?.dutyStart) return null;
  const dep=(parseStationClock(row.dep)||{}).station || baseAirportCode();
  const ms=rosterScheduledUtcMs(row.date,row.dutyStart,dep);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function routeFromRow(row){
  const dep=(row.dep||"").trim().split(/\s+/)[0]||"";
  const arr=(row.arr||"").trim().split(/\s+/)[0]||"";
  return dep&&arr ? `${dep} → ${arr}` : (dep||arr||"—");
}

function formatCountdown(ms){
  if(ms<=0) return "REPORT NOW";
  const total=Math.floor(ms/1000);
  const days=Math.floor(total/86400);
  const hours=Math.floor((total%86400)/3600);
  const mins=Math.floor((total%3600)/60);
  const secs=total%60;
  return days>0
    ? `${days}d ${String(hours).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m`
    : `${String(hours).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s`;
}

function isOvernightContinuationRow(row, previousDuty){
  if(!row) return false;
  if(row._overnightContinuation) return true;

  const noNewDuty=!String(row.item||"").trim() && !String(row.dutyStart||"").trim();
  const hasArrival=Boolean(
    String(row.arr||"").trim() || String(row.dutyEnd||"").trim()
  );

  if(!noNewDuty || !hasArrival) return false;

  // The continuation should be on the next calendar date.
  if(previousDuty?.date && row.date){
    return row.date===followingRosterDate(previousDuty.date);
  }

  // Fallback for a second line where date/day are intentionally blank.
  return true;
}

function isSectorContinuation(row,firstDuty){
  if(!row || !firstDuty) return false;

  if(
    firstDuty._dutyGroup &&
    row._dutyGroup &&
    row._dutyGroup===firstDuty._dutyGroup
  ){
    return true;
  }

  // Fallback for editable/manual rows: same date, another flight number,
  // and no new report time means another sector in the same duty.
  return (
    row.date===firstDuty.date &&
    !String(row.dutyStart||"").trim() &&
    /^MH\d+/i.test(String(row.item||"").trim())
  );
}

function buildCompleteDuty(rows,index){
  const duty={...rows[index]};
  const sectors=[];

  if(/^MH\d+/i.test(String(duty.item||"").trim())){
    sectors.push({
      item:duty.item,
      dep:duty.dep,
      arr:duty.arr,
      block:duty.block,
      work:duty.work,
      ac:duty.ac
    });
  }

  let finalRow=duty;
  let scan=index+1;

  while(scan<rows.length){
    const candidate=rows[scan];

    if(isSectorContinuation(candidate,duty)){
      sectors.push({
        item:candidate.item,
        dep:candidate.dep,
        arr:candidate.arr,
        block:candidate.block,
        work:candidate.work,
        ac:candidate.ac||duty.ac
      });
      finalRow=candidate;
      scan++;
      continue;
    }

    if(isOvernightContinuationRow(candidate,finalRow)){
      finalRow=candidate;
      scan++;
      continue;
    }

    break;
  }

  duty._sectors=sectors;
  duty._sectorCount=sectors.length||1;

  if(sectors.length){
    duty._displayItems=sectors.map(s=>s.item).filter(Boolean).join(" · ");
    duty._routeAirports=[];

    sectors.forEach((sector,sectorIndex)=>{
      const dep=String(sector.dep||"").trim().split(/\s+/)[0]||"";
      const arr=String(sector.arr||"").trim().split(/\s+/)[0]||"";

      if(sectorIndex===0 && dep) duty._routeAirports.push(dep);
      if(arr) duty._routeAirports.push(arr);
    });

    duty._arrival=finalRow.arr || sectors[sectors.length-1]?.arr || duty.arr || "";
  }else{
    duty._displayItems=duty.item||"";
    duty._routeAirports=[];
    duty._arrival=finalRow.arr||duty.arr||"";
  }

  duty._arrivalDate=
    finalRow.date ||
    duty.date;

  duty._arrivalDay=
    finalRow.day ||
    (duty._arrivalDate ? dayName(duty._arrivalDate) : "");

  duty._finalDutyEnd=
    finalRow.dutyEnd ||
    duty.dutyEnd ||
    "";

  // Total block hours across every sector.
  const totalBlock=sectors.reduce(
    (sum,sector)=>sum+toMinutes(sector.block),
    0
  );
  if(totalBlock>0) duty._totalBlock=hhmm(totalBlock);

  // Use the first available total duty-hours value in the grouped rows.
  for(let i=index;i<scan;i++){
    if(toMinutes(rows[i].duty)>0){
      duty._totalDuty=rows[i].duty;
      break;
    }
  }

  return duty;
}

function isSmartNonWorkingItem(item){
  return ["D","DO","DO1","OFF"].includes(String(item||"").trim().toUpperCase());
}

function smartCrewRole(){
  const rank=($("#rank")?.value||"").trim().toUpperCase();
  if(["FO","SO","CPT","CAPT","CMDR","SFO"].includes(rank)) return "pilot";
  if(["FS","FSS","LS","CSS","IFS","IFM","CCM"].includes(rank)) return "cabin";
  return "crew";
}

function smartDutyIsFlight(row){
  if(!row) return false;
  if((row._sectors||[]).some(sector=>/^MH\d+/i.test(String(sector.item||"").trim()))) return true;
  return /^MH\d+/i.test(String(row.item||"").trim());
}

function smartDutyEndDateTime(row){
  if(!row?._dt) return null;

  // Roster Duty Hours are the safest way to create an absolute end instant,
  // because departure/arrival clocks may be in different local time zones.
  const dutyMinutes=toMinutes(row._totalDuty||row.duty);
  if(dutyMinutes>0){
    return new Date(row._dt.getTime()+dutyMinutes*60000);
  }

  const endText=String(row._finalDutyEnd||row.dutyEnd||"").trim();
  if(!endText) return new Date(row._dt.getTime()+12*3600000);

  const endDate=parseRosterDate(row._arrivalDate||row.date);
  const match=endText.match(/(\d{1,2}):(\d{2})/);
  if(!endDate||!match) return new Date(row._dt.getTime()+12*3600000);

  endDate.setHours(Number(match[1]),Number(match[2]),0,0);
  while(endDate<=row._dt) endDate.setDate(endDate.getDate()+1);
  return endDate;
}

function smartDutyKey(row){
  const staff=($("#staff")?.value||"").trim()||"crew";
  const item=row?._displayItems||row?.item||"Duty";
  const route=(row?._routeAirports||[]).join("-")||routeFromRow(row||{});
  return [staff,row?.date||"",row?.dutyStart||"",item,route]
    .map(value=>String(value||"").trim())
    .join("|");
}

const SMART_DUTY_STORAGE_KEY="crewview-operational-times-v2-utc";
const SMART_DUTY_TIME_MODE_KEY="crewview-operational-display-mode-v1";
const SMART_DUTY_FIELDS=["pushback","airborne","landing","onChocks","dutyEnd"];

function airportTimezone(code){
  const iata=String(code||"").trim().toUpperCase();
  return AIRPORT_TIMEZONES[iata] || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function knownAirportTimezone(code){
  const iata=String(code||"").trim().toUpperCase();
  return AIRPORT_TIMEZONES[iata] || "";
}

function timezoneOffsetMinutesAt(timestamp,timeZone){
  if(!Number.isFinite(Number(timestamp)) || !timeZone) return null;
  try{
    const instant=Math.floor(Number(timestamp)/1000)*1000;
    const parts=timePartsInZone(instant,timeZone);
    const wallAsUtc=Date.UTC(
      Number(parts.year),Number(parts.month)-1,Number(parts.day),
      Number(parts.hour),Number(parts.minute),Number(parts.second||0),0
    );
    return Math.round((wallAsUtc-instant)/60000);
  }catch(_error){
    return null;
  }
}

function formatUtcOffsetMinutes(minutes){
  if(!Number.isFinite(Number(minutes))) return "";
  const value=Math.round(Number(minutes));
  if(value===0) return "UTC";
  const sign=value>0?"+":"−";
  const absolute=Math.abs(value);
  const hours=Math.floor(absolute/60);
  const mins=absolute%60;
  return `UTC ${sign}${hours}${mins?`:${String(mins).padStart(2,"0")}`:""}`;
}

function formatTimezoneDifferenceMinutes(minutes,homeAirport){
  if(!Number.isFinite(Number(minutes))) return "";
  const value=Math.round(Number(minutes));
  const home=String(homeAirport||baseAirportCode()||"KUL").toUpperCase();
  if(value===0) return `same as ${home}`;
  const absolute=Math.abs(value);
  const hours=Math.floor(absolute/60);
  const mins=absolute%60;
  const duration=[hours?`${hours}h`:"",mins?`${mins}m`:""].filter(Boolean).join(" ");
  return `${duration} ${value>0?"ahead of":"behind"} ${home}`;
}

function airportTimezoneDisplay(airport,timestamp){
  const code=String(airport||"").trim().toUpperCase();
  if(!code) return null;

  const zone=knownAirportTimezone(code);
  if(!zone) return null;

  const at=Number(timestamp);
  if(!Number.isFinite(at)) return null;

  const offset=timezoneOffsetMinutesAt(at,zone);
  if(!Number.isFinite(offset)) return null;

  const home=baseAirportCode();
  const homeZone=knownAirportTimezone(home) || airportTimezone(home);
  const homeOffset=timezoneOffsetMinutesAt(at,homeZone);
  const difference=Number.isFinite(homeOffset)?offset-homeOffset:null;

  return {
    airport:code,
    zone,
    offsetMinutes:offset,
    offsetLabel:formatUtcOffsetMinutes(offset),
    homeAirport:home,
    differenceMinutes:difference,
    differenceLabel:Number.isFinite(difference)
      ? formatTimezoneDifferenceMinutes(difference,home)
      : ""
  };
}

function dutyDepartureAirport(row){
  const route=(row?._routeAirports||[]).filter(Boolean);
  return String(route[0] || airportCode(row?.dep) || "").toUpperCase();
}

function dutyArrivalAirport(row){
  const route=(row?._routeAirports||[]).filter(Boolean);
  return String(route[route.length-1] || airportCode(row?._arrival||row?.arr) || "").toUpperCase();
}

function smartDutyEventAirport(row,field){
  return ["pushback","airborne"].includes(field)
    ? dutyDepartureAirport(row)
    : dutyArrivalAirport(row);
}

function smartDutyEventTimezone(row,field){
  return airportTimezone(smartDutyEventAirport(row,field));
}

function rosterDateComponents(dateText){
  const match=String(dateText||"").match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if(!match) return null;
  const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const month=months[match[2]];
  if(!month) return null;
  return {year:Number(match[3]),month,day:Number(match[1])};
}

function timePartsInZone(timestamp,timeZone){
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{
      timeZone,
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",
      hourCycle:"h23"
    }).formatToParts(new Date(timestamp));
    return Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
  }catch(_error){
    const d=new Date(timestamp);
    return {
      year:String(d.getUTCFullYear()),
      month:String(d.getUTCMonth()+1).padStart(2,"0"),
      day:String(d.getUTCDate()).padStart(2,"0"),
      hour:String(d.getUTCHours()).padStart(2,"0"),
      minute:String(d.getUTCMinutes()).padStart(2,"0"),
      second:String(d.getUTCSeconds()).padStart(2,"0")
    };
  }
}

function zonedWallTimeToUtcMs(dateText,timeText,timeZone){
  const date=rosterDateComponents(dateText);
  const time=String(timeText||"").match(/(\d{1,2}):(\d{2})/);
  if(!date||!time) return null;

  const target=Date.UTC(date.year,date.month-1,date.day,Number(time[1]),Number(time[2]),0,0);
  let guess=target;

  // Resolve the local wall-clock value into an absolute instant. Iteration
  // handles non-integer offsets and daylight-saving changes via Intl/IANA data.
  for(let index=0;index<3;index++){
    const parts=timePartsInZone(guess,timeZone);
    const shown=Date.UTC(
      Number(parts.year),Number(parts.month)-1,Number(parts.day),
      Number(parts.hour),Number(parts.minute),Number(parts.second||0),0
    );
    guess+=target-shown;
  }
  return guess;
}

function smartDutyReportUtcMs(row){
  if(!row) return null;
  const airport=dutyDepartureAirport(row)||baseAirportCode();
  const resolved=rosterScheduledUtcMs(row.date,row.dutyStart,airport);
  if(Number.isFinite(resolved)) return resolved;
  const fallback=row._dt||dutyDateTime(row);
  return fallback instanceof Date ? fallback.getTime() : null;
}

function smartDutyEndUtcMs(row){
  const report=smartDutyReportUtcMs(row);
  if(!Number.isFinite(report)) return null;
  const dutyMinutes=toMinutes(row?._totalDuty||row?.duty);
  if(dutyMinutes>0) return report+dutyMinutes*60000;
  return report+12*3600000;
}

function formatUtcHHMM(timestamp){
  if(!Number.isFinite(Number(timestamp))) return "—";
  const d=new Date(Number(timestamp));
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

function rosterDateKeyFromParts(parts){
  if(!parts) return null;
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day));
}

function localDateDelta(row,timestamp,timeZone){
  const base=rosterDateComponents(row?.date);
  if(!base || !Number.isFinite(Number(timestamp))) return 0;
  const local=timePartsInZone(Number(timestamp),timeZone);
  const baseKey=Date.UTC(base.year,base.month-1,base.day);
  const localKey=rosterDateKeyFromParts(local);
  return Math.round((localKey-baseKey)/86400000);
}

function formatLocalOperationalTime(row,field,event){
  if(!event || !Number.isFinite(event.at)) return "Local —";
  const airport=event.airport || smartDutyEventAirport(row,field);
  const timezone=event.timezone || airportTimezone(airport);
  const parts=timePartsInZone(event.at,timezone);
  const delta=localDateDelta(row,event.at,timezone);
  const marker=delta===0 ? "" : delta>0 ? ` (+${delta})` : ` (${delta})`;
  return `${parts.hour}:${parts.minute}${marker}${airport?` ${airport}`:""}`;
}

function loadOperationalStore(){
  try{
    const parsed=JSON.parse(localStorage.getItem(SMART_DUTY_STORAGE_KEY)||"{}");
    return parsed && typeof parsed==="object" ? parsed : {};
  }catch(_error){
    return {};
  }
}

function saveOperationalStore(store){
  try{
    localStorage.setItem(SMART_DUTY_STORAGE_KEY,JSON.stringify(store));
  }catch(error){
    console.warn("CrewView could not save UTC operational times",error);
  }
}

function normalizeStoredUtcTime(value){
  const raw=String(value||"").trim();
  if(/^\d{4}$/.test(raw)){
    const hh=Number(raw.slice(0,2));
    const mm=Number(raw.slice(2));
    if(hh<=23 && mm<=59) return `${raw.slice(0,2)}:${raw.slice(2)}`;
  }
  if(/^\d{1,2}:\d{2}$/.test(raw)){
    const [h,m]=raw.split(":").map(Number);
    if(h<=23 && m<=59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return "";
}

function plausibleOperationalEpoch(value){
  const n=Number(value);
  return Number.isFinite(n) && n>=Date.UTC(2000,0,1) && n<=Date.UTC(2100,0,1);
}

function repairOperationalRecord(row,record){
  if(!row || !record || typeof record!=="object") return {record:record||{},changed:false};
  const fixed={...record};
  const report=smartDutyReportUtcMs(row);
  let previous=Number.isFinite(report) ? report : null;
  let changed=false;

  for(const field of SMART_DUTY_FIELDS){
    const source=fixed[field];
    if(!source) continue;
    const sourceObj=typeof source==="string" ? {time:source} : {...source};
    const time=normalizeStoredUtcTime(sourceObj.utcTime||sourceObj.time||"");
    if(!time) continue;

    let at=Number(sourceObj.at);
    const atIsPlausible=plausibleOperationalEpoch(at);
    const atMatches=atIsPlausible && formatUtcHHMM(at)===time;

    if(!atMatches){
      const base=Number.isFinite(previous) ? previous : (Number.isFinite(report) ? report : Date.now());
      const baseDay=Date.UTC(new Date(base).getUTCFullYear(),new Date(base).getUTCMonth(),new Date(base).getUTCDate());
      const candidates=[];
      for(let delta=-1;delta<=3;delta++){
        const candidate=utcTimestampForDay(baseDay+delta*86400000,time);
        if(Number.isFinite(candidate)) candidates.push(candidate);
      }
      if(Number.isFinite(previous)){
        const after=candidates.filter(v=>v>=previous).sort((a,b)=>a-b);
        at=after.length ? after[0] : candidates.sort((a,b)=>Math.abs(a-base)-Math.abs(b-base))[0];
      }else{
        at=candidates.sort((a,b)=>Math.abs(a-base)-Math.abs(b-base))[0];
      }
      changed=true;
    }

    const airport=sourceObj.airport||smartDutyEventAirport(row,field);
    fixed[field]={...sourceObj,utcTime:time,time,at:Number.isFinite(at)?Math.floor(at/60000)*60000:null,airport,timezone:sourceObj.timezone||airportTimezone(airport)};
    if(Number.isFinite(fixed[field].at)) previous=fixed[field].at;
  }

  const chocks=fixed.onChocks;
  if(chocks && plausibleOperationalEpoch(chocks.at)){
    const duty=fixed.dutyEnd;
    if(!duty || (duty.source==="auto-onchocks-plus-45" && !plausibleOperationalEpoch(duty.at))){
      const dutyEndAt=chocks.at+45*60000;
      const airport=smartDutyEventAirport(row,"dutyEnd");
      fixed.dutyEnd={utcTime:formatUtcHHMM(dutyEndAt),time:formatUtcHHMM(dutyEndAt),at:dutyEndAt,source:"auto-onchocks-plus-45",airport,timezone:airportTimezone(airport)};
      fixed.completedAt=dutyEndAt;
      changed=true;
    }
  }

  return {record:fixed,changed};
}

function operationalRecord(row){
  if(!row) return {};
  const store=loadOperationalStore();
  const key=smartDutyKey(row);
  const repaired=repairOperationalRecord(row,store[key]||{});
  if(repaired.changed){
    store[key]=repaired.record;
    saveOperationalStore(store);
  }
  return repaired.record;
}

function operationalEvent(record,field){
  const value=record?.[field];
  if(!value) return {time:"",at:null,source:"",airport:"",timezone:""};
  if(typeof value==="string") return {time:value,at:null,source:"legacy",airport:"",timezone:""};
  return {
    time:String(value.utcTime||value.time||""),
    at:Number.isFinite(Number(value.at)) ? Number(value.at) : null,
    source:String(value.source||""),
    airport:String(value.airport||""),
    timezone:String(value.timezone||"")
  };
}

function currentUtcHHMM(){
  const now=new Date();
  return `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;
}

function clockMinutes(value){
  const match=String(value||"").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1])*60+Number(match[2]) : null;
}

function utcTimestampForDay(dayMs,timeText){
  const minutes=clockMinutes(timeText);
  if(minutes===null) return null;
  const d=new Date(dayMs);
  return Date.UTC(
    d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),
    Math.floor(minutes/60),minutes%60,0,0
  );
}

function previousOperationalTimestamp(record,field){
  const index=SMART_DUTY_FIELDS.indexOf(field);
  for(let cursor=index-1;cursor>=0;cursor--){
    const event=operationalEvent(record,SMART_DUTY_FIELDS[cursor]);
    if(Number.isFinite(event.at)) return event.at;
  }
  return null;
}

function inferManualUtcTimestamp(row,field,timeText,record){
  const minutes=clockMinutes(timeText);
  if(minutes===null) return null;

  const report=smartDutyReportUtcMs(row);
  const previous=previousOperationalTimestamp(record,field);
  const anchor=Number.isFinite(previous) ? previous : (Number.isFinite(report) ? report : Date.now());
  const anchorDay=Date.UTC(
    new Date(anchor).getUTCFullYear(),
    new Date(anchor).getUTCMonth(),
    new Date(anchor).getUTCDate()
  );

  const candidates=[];
  for(let delta=-1;delta<=3;delta++){
    const candidate=utcTimestampForDay(anchorDay+delta*86400000,timeText);
    if(Number.isFinite(candidate)) candidates.push(candidate);
  }

  if(Number.isFinite(previous)){
    const afterPrevious=candidates.filter(value=>value>=previous).sort((a,b)=>a-b);
    if(afterPrevious.length) return afterPrevious[0];
  }

  if(Number.isFinite(report)){
    // Pushback can occasionally occur shortly before the exact recorded report
    // instant in manually edited test data, so allow a small guard band.
    const minimum=report-3*3600000;
    const afterReport=candidates.filter(value=>value>=minimum).sort((a,b)=>a-b);
    if(afterReport.length) return afterReport[0];
  }

  return candidates.sort((a,b)=>Math.abs(a-anchor)-Math.abs(b-anchor))[0]||null;
}

function setOperationalEvent(row,field,time,{capturedNow=false}={}){
  if(!row) return;
  const store=loadOperationalStore();
  const key=smartDutyKey(row);
  const record={...(store[key]||{})};
  const clean=String(time||"").trim();

  if(clean){
    // Operational records are minute-precision. Do not let hidden seconds from
    // a "Now" tap change Taxi/Block/Duty totals by one minute.
    let rawAt=capturedNow ? Date.now() : inferManualUtcTimestamp(row,field,clean,record);
    if(!capturedNow && !plausibleOperationalEpoch(rawAt)){
      const report=smartDutyReportUtcMs(row);
      const base=Number.isFinite(report)?report:Date.now();
      const baseDay=Date.UTC(new Date(base).getUTCFullYear(),new Date(base).getUTCMonth(),new Date(base).getUTCDate());
      const candidate=utcTimestampForDay(baseDay,clean);
      rawAt=Number.isFinite(candidate)?candidate:null;
    }
    const at=Number.isFinite(rawAt) ? Math.floor(rawAt/60000)*60000 : null;
    const shownTime=Number.isFinite(at) ? formatUtcHHMM(at) : clean;
    const airport=smartDutyEventAirport(row,field);
    record[field]={
      utcTime:shownTime,
      time:shownTime,
      at,
      source:capturedNow ? "now" : "manual-utc",
      airport,
      timezone:airportTimezone(airport)
    };

    // Company roster duty debrief is 45 minutes after block-in. Once On Chocks
    // is entered, pre-fill Duty End/Released to the latest time: On Chocks +45.
    // It remains editable if an actual release time later differs.
    if(field==="onChocks" && Number.isFinite(at)){
      const dutyEndAt=at+45*60000;
      const dutyEndAirport=smartDutyEventAirport(row,"dutyEnd");
      record.dutyEnd={
        utcTime:formatUtcHHMM(dutyEndAt),
        time:formatUtcHHMM(dutyEndAt),
        at:dutyEndAt,
        source:"auto-onchocks-plus-45",
        airport:dutyEndAirport,
        timezone:airportTimezone(dutyEndAirport)
      };
      record.completedAt=dutyEndAt;
    }
  }else{
    delete record[field];
    if(field==="onChocks" && record.dutyEnd?.source==="auto-onchocks-plus-45"){
      delete record.dutyEnd;
      record.completedAt=null;
    }
  }

  record.updatedAt=Date.now();
  if(field==="dutyEnd"){
    record.completedAt=clean ? (record[field]?.at||Date.now()) : null;
  }

  store[key]=record;
  saveOperationalStore(store);
  applyOperationalOverlayToClassic();
}

function resetOperationalRecord(row){
  if(!row) return;
  const store=loadOperationalStore();
  delete store[smartDutyKey(row)];
  saveOperationalStore(store);
  applyOperationalOverlayToClassic();
}

function durationBetweenOperationalEvents(startEvent,endEvent){
  if(!startEvent || !endEvent) return null;
  if(Number.isFinite(startEvent.at) && Number.isFinite(endEvent.at)){
    // Normalize legacy v91-v94 records too, so previously captured hidden
    // seconds cannot produce 07:34 when the displayed UTC times are 02:02-09:37.
    const startAt=Math.floor(startEvent.at/60000)*60000;
    const endAt=Math.floor(endEvent.at/60000)*60000;
    if(endAt>=startAt) return {minutes:(endAt-startAt)/60000,exact:true};
  }
  return null;
}

function formatOperationalDuration(result){
  if(!result || !Number.isFinite(result.minutes)) return "—";
  return hhmm(Math.max(0,result.minutes));
}

function rosterDutyMinutes(row){
  return toMinutes(row?._totalDuty||row?.duty);
}

function formatSignedMinutes(minutes){
  if(!Number.isFinite(minutes)) return "—";
  const sign=minutes>0?"+":minutes<0?"-":"±";
  return `${sign}${hhmm(Math.abs(Math.round(minutes)))}`;
}

function operationalMetrics(row,record){
  const pushback=operationalEvent(record,"pushback");
  const airborne=operationalEvent(record,"airborne");
  const landing=operationalEvent(record,"landing");
  const onChocks=operationalEvent(record,"onChocks");
  const dutyEnd=operationalEvent(record,"dutyEnd");
  const reportAt=smartDutyReportUtcMs(row);
  const reportEvent=Number.isFinite(reportAt)?{at:reportAt,time:formatUtcHHMM(reportAt)}:null;
  const actualDuty=durationBetweenOperationalEvents(reportEvent,dutyEnd);
  const rosterMinutes=rosterDutyMinutes(row);
  return {
    taxiOut:durationBetweenOperationalEvents(pushback,airborne),
    airTime:durationBetweenOperationalEvents(airborne,landing),
    taxiIn:durationBetweenOperationalEvents(landing,onChocks),
    block:durationBetweenOperationalEvents(pushback,onChocks),
    actualDuty,
    rosterDuty:rosterMinutes>0?{minutes:rosterMinutes,exact:true}:null,
    dutyDifference:actualDuty && rosterMinutes>0 ? actualDuty.minutes-rosterMinutes : null
  };
}

function classicOperationalRecord(row){
  if(!row) return {};
  const direct=operationalRecord(row);
  if(Object.keys(direct).length) return direct;

  // Completed-duty objects include route metadata that simple Classic rows do
  // not always have (especially for overnight sectors). Match the stable duty
  // identity first, then use the saved UTC record regardless of route suffix.
  const staff=(($("#staff")?.value||"").trim()||"crew");
  const prefix=[staff,row.date||"",row.dutyStart||"",row.item||""].map(v=>String(v||"").trim()).join("|")+"|";
  const store=loadOperationalStore();
  const match=Object.keys(store).find(key=>key.startsWith(prefix));
  return match ? (store[match]||{}) : {};
}

function scheduledClassicRow(tr){
  const row=Object.fromEntries([...tr.cells].map(td=>[
    td.dataset.k,
    td.dataset.actualOverlay==="1" ? (td.dataset.scheduledValue||"") : td.textContent.trim()
  ]));
  row.date=row.date||tr.dataset.actualDate||"";
  row.day=row.day||tr.dataset.actualDay||dayName(row.date);
  row._actualDate=tr.dataset.actualDate||row.date||"";
  row._actualDay=tr.dataset.actualDay||row.day||dayName(row.date);
  row._overnightContinuation=tr.dataset.overnightContinuation==="1";
  return row;
}

function setClassicActualCell(tr,key,value){
  const td=tr?.querySelector(`[data-k="${key}"]`);
  if(!td || !value) return;
  if(td.dataset.actualOverlay!=="1") td.dataset.scheduledValue=td.textContent.trim();
  td.dataset.actualOverlay="1";
  td.textContent=value;
  td.title=td.dataset.scheduledValue ? `Scheduled: ${td.dataset.scheduledValue}` : "Actual operational value";
}

function clearClassicActualOverlay(){
  [...tbody.rows].forEach(tr=>[...tr.cells].forEach(td=>{
    if(td.dataset.actualOverlay==="1"){
      td.textContent=td.dataset.scheduledValue||"";
      delete td.dataset.actualOverlay;
      delete td.dataset.scheduledValue;
      td.removeAttribute("title");
    }
  }));
}

function classicActualStationTime(row,field,event){
  if(!event || !Number.isFinite(event.at)) return "";
  const airport=event.airport || smartDutyEventAirport(row,field);
  const timezone=event.timezone || airportTimezone(airport);
  const parts=timePartsInZone(event.at,timezone);
  const delta=localDateDelta(row,event.at,timezone);
  const marker=delta===0 ? "" : delta>0 ? `(+${delta})` : `(${delta})`;
  return `${airport||""} ${parts.hour}:${parts.minute}${marker} ACT`.trim();
}

function applyOperationalOverlayToClassic(){
  if(!tbody) return;
  clearClassicActualOverlay();

  let previousDuty=null;
  let previousRecord=null;

  [...tbody.rows].forEach(tr=>{
    const row=scheduledClassicRow(tr);
    const isFlight=/^MH\d+/i.test(String(row.item||"").trim());

    if(isFlight && String(row.dutyStart||"").trim()){
      previousDuty=row;
      previousRecord=classicOperationalRecord(row);
      const record=previousRecord;
      const pushback=operationalEvent(record,"pushback");
      const onChocks=operationalEvent(record,"onChocks");
      const dutyEnd=operationalEvent(record,"dutyEnd");
      const metrics=operationalMetrics(row,record);

      if(Number.isFinite(pushback.at)) setClassicActualCell(tr,"dep",classicActualStationTime(row,"pushback",pushback));
      if(Number.isFinite(onChocks.at) && String(row.arr||"").trim()) setClassicActualCell(tr,"arr",classicActualStationTime(row,"onChocks",onChocks));
      if(metrics.block) setClassicActualCell(tr,"block",`${formatOperationalDuration(metrics.block)} ACT`);
      if(metrics.actualDuty) setClassicActualCell(tr,"duty",`${formatOperationalDuration(metrics.actualDuty)} ACT`);
      if(Number.isFinite(dutyEnd.at) && String(row.dutyEnd||"").trim()) setClassicActualCell(tr,"dutyEnd",classicActualStationTime(row,"dutyEnd",dutyEnd).replace(/^\S+\s+/,""));
      return;
    }

    // Overnight arrival/duty-end values live on the following continuation
    // row in Classic view, but belong to the preceding flight's UTC record.
    if(row._overnightContinuation && previousDuty && previousRecord){
      const onChocks=operationalEvent(previousRecord,"onChocks");
      const dutyEnd=operationalEvent(previousRecord,"dutyEnd");
      if(Number.isFinite(onChocks.at)) setClassicActualCell(tr,"arr",classicActualStationTime(previousDuty,"onChocks",onChocks));
      if(Number.isFinite(dutyEnd.at)) setClassicActualCell(tr,"dutyEnd",classicActualStationTime(previousDuty,"dutyEnd",dutyEnd).replace(/^\S+\s+/,""));
    }
  });

  if(fitEnabled) setTimeout(applyOnePageFit,0);
}

function smartDutyPhase(row,record,role){
  if(role==="pilot" && smartDutyIsFlight(row)){
    const dutyEndEvent=operationalEvent(record,"dutyEnd");
    if(Number.isFinite(dutyEndEvent.at) && dutyEndEvent.at<=Date.now()) return "COMPLETED";
    if(operationalEvent(record,"onChocks").time) return "POST FLIGHT";
    if(operationalEvent(record,"landing").time) return "TAXI IN";
    if(operationalEvent(record,"airborne").time) return "AIRBORNE";
    if(operationalEvent(record,"pushback").time) return "TAXI OUT";
    return "REPORTED";
  }

  const item=String(row?.item||"").trim().toUpperCase();
  if(/^MH\d+/.test(item)) return "FLIGHT DUTY";
  if(item==="OFF01" || item==="OF1" || item.includes("OFFICE")) return "OFFICE DUTY";
  if(item.includes("SIM") || item.includes("LPC") || item.includes("OPC")) return "SIMULATOR";
  if(item==="DSA" || item.includes("TRAIN")) return "TRAINING";
  return "DUTY IN PROGRESS";
}

function getSmartDutyCandidates(rows){
  const candidates=[];
  const seen=new Set();

  rows.forEach((row,index)=>{
    if(
      row._overnightContinuation ||
      !String(row.dutyStart||"").trim() ||
      (
        !String(row.item||"").trim() &&
        (String(row.arr||"").trim() || String(row.dutyEnd||"").trim())
      ) ||
      (
        !String(row.dutyStart||"").trim() &&
        /^MH\d+/i.test(String(row.item||"").trim())
      )
    ) return;

    const item=String(row.item||"").trim();
    if(!item || isSmartNonWorkingItem(item)) return;

    const report=dutyDateTime(row);
    if(!report) return;

    const duty={...buildCompleteDuty(rows,index),_dt:report};
    duty._smartKey=smartDutyKey(duty);
    duty._reportUtcMs=smartDutyReportUtcMs(duty);
    duty._estimatedEndUtcMs=smartDutyEndUtcMs(duty);
    duty._estimatedEnd=Number.isFinite(duty._estimatedEndUtcMs)
      ? new Date(duty._estimatedEndUtcMs)
      : smartDutyEndDateTime(duty);

    if(seen.has(duty._smartKey)) return;
    seen.add(duty._smartKey);
    candidates.push(duty);
  });

  return candidates.sort((a,b)=>
    (a._reportUtcMs||a._dt.getTime())-(b._reportUtcMs||b._dt.getTime())
  );
}

function getUpcomingDuty(rows){
  const nowMs=Date.now();
  return getSmartDutyCandidates(rows).find(duty=>(duty._reportUtcMs||duty._dt.getTime())>nowMs)||null;
}

function getSmartDutySelection(rows){
  const now=new Date();
  const nowMs=now.getTime();

  if(
    officialRosterPeriod?.end &&
    officialRosterPeriod.end < new Date(now.getFullYear(),now.getMonth(),now.getDate())
  ){
    return null;
  }

  const candidates=getSmartDutyCandidates(rows);
  if(!candidates.length) return null;

  const reportMs=duty=>duty._reportUtcMs||duty._dt.getTime();
  const endMs=duty=>duty._estimatedEndUtcMs||duty._estimatedEnd?.getTime()||reportMs(duty)+12*3600000;

  const future=candidates.find(duty=>reportMs(duty)>nowMs)||null;

  // The duty remains active until an actual Duty End/Released time is entered,
  // or until the scheduled roster duty end is reached. On Chocks is a flight
  // milestone, not the end of the crew duty period.
  const active=[...candidates].reverse().find(duty=>{
    const start=reportMs(duty);
    if(start>nowMs) return false;
    const record=operationalRecord(duty);
    const actualDutyEnd=operationalEvent(record,"dutyEnd");
    if(Number.isFinite(actualDutyEnd.at) && actualDutyEnd.at<=nowMs) return false;
    return nowMs<=endMs(duty);
  });

  if(active) return {row:active,state:"active"};

  // If a completed outstation duty has a rostered layover, Smart Duty becomes
  // a dedicated LAYOVER card from Duty End until the following Report Time.
  const layoverDuty=[...candidates].reverse().find(duty=>{
    if(reportMs(duty)>nowMs) return false;
    const l=layoverForDuty(duty);
    return l && Number.isFinite(l.start) && Number.isFinite(l.end) && l.start<=nowMs && nowMs<l.end;
  });
  if(layoverDuty) return {row:layoverDuty,state:"layover",layover:layoverForDuty(layoverDuty)};

  const completed=[...candidates].reverse().find(duty=>{
    if(reportMs(duty)>nowMs) return false;
    const record=operationalRecord(duty);
    const actualDutyEnd=operationalEvent(record,"dutyEnd");
    const completionMs=
      (Number.isFinite(actualDutyEnd.at) ? actualDutyEnd.at : null) ||
      (Number(record.completedAt)||null) ||
      endMs(duty);
    return completionMs && completionMs<=nowMs;
  });

  if(completed){
    const record=operationalRecord(completed);
    const actualDutyEnd=operationalEvent(record,"dutyEnd");
    const completionMs=
      (Number.isFinite(actualDutyEnd.at) ? actualDutyEnd.at : null) ||
      (Number(record.completedAt)||null) ||
      endMs(completed);
    const since=nowMs-completionMs;

    // Keep Completed Duty visible for exactly 3 hours after Duty End / Released.
    // After that, always advance to the next rostered duty regardless of how far away it is.
    if(since<=3*3600000){
      return {row:completed,state:"completed"};
    }
  }

  if(future) return {row:future,state:"next"};
  return null;
}

function shortDuration(ms){
  const total=Math.max(0,Math.floor(ms/60000));
  const hours=Math.floor(total/60);
  const mins=total%60;
  return `${String(hours).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m`;
}

function smartDutyTimeDisplayMode(){
  const value=localStorage.getItem(SMART_DUTY_TIME_MODE_KEY);
  return ["utc","local","both"].includes(value) ? value : "both";
}

function applySmartDutyTimeDisplayMode(mode){
  const value=["utc","local","both"].includes(mode) ? mode : "both";
  localStorage.setItem(SMART_DUTY_TIME_MODE_KEY,value);
  const panel=$("#pilotOpsPanel");
  if(panel){
    panel.dataset.timeMode=value;
    panel.classList.remove("ops-mode-utc","ops-mode-local","ops-mode-both");
    panel.classList.add(`ops-mode-${value}`);
  }
  document.querySelectorAll("[data-ops-time-mode]").forEach(button=>{
    button.classList.toggle("active",button.dataset.opsTimeMode===value);
    button.setAttribute("aria-pressed",button.dataset.opsTimeMode===value?"true":"false");
  });
}

function setSmartDutyOperationalInputs(row){
  const record=operationalRecord(row);
  const fieldIds={
    pushback:"#opsPushback",
    airborne:"#opsAirborne",
    landing:"#opsLanding",
    onChocks:"#opsOnChocks",
    dutyEnd:"#opsDutyEnd"
  };
  const localIds={
    pushback:"#opsPushbackLocal",
    airborne:"#opsAirborneLocal",
    landing:"#opsLandingLocal",
    onChocks:"#opsOnChocksLocal",
    dutyEnd:"#opsDutyEndLocal"
  };

  Object.entries(fieldIds).forEach(([field,selector])=>{
    const event=operationalEvent(record,field);
    const input=$(selector);
    if(input && document.activeElement!==input){
      input.value=event.time||"";
    }
    const local=$(localIds[field]);
    if(local){
      local.textContent=formatLocalOperationalTime(row,field,event);
      local.classList.toggle("has-time",Number.isFinite(event.at));
    }
  });

  const reportMs=smartDutyReportUtcMs(row);
  const reportAirport=dutyDepartureAirport(row);
  const reportZone=airportTimezone(reportAirport);
  const reportEvent=Number.isFinite(reportMs)
    ? {at:reportMs,airport:reportAirport,timezone:reportZone}
    : null;
  $("#opsReportUtc").textContent=Number.isFinite(reportMs)?`${formatUtcHHMM(reportMs)} UTC`:"—";
  $("#opsReportLocal").textContent=reportEvent
    ? formatLocalOperationalTime(row,"pushback",reportEvent)
    : "Local —";

  const metrics=operationalMetrics(row,record);
  $("#actualTaxiOut").textContent=formatOperationalDuration(metrics.taxiOut);
  $("#actualAirTime").textContent=formatOperationalDuration(metrics.airTime);
  $("#actualTaxiIn").textContent=formatOperationalDuration(metrics.taxiIn);
  $("#actualBlockTime").textContent=formatOperationalDuration(metrics.block);
  $("#rosterDutyTime").textContent=metrics.rosterDuty?hhmm(metrics.rosterDuty.minutes):"—";
  $("#actualDutyTime").textContent=formatOperationalDuration(metrics.actualDuty);
  $("#actualDutyDifference").textContent=formatSignedMinutes(metrics.dutyDifference);

  const timezoneStatus=$("#opsTimezoneStatus");
  if(timezoneStatus){
    const dep=dutyDepartureAirport(row);
    const arr=dutyArrivalAirport(row);
    const depKnown=Boolean(AIRPORT_TIMEZONES[dep]);
    const arrKnown=Boolean(AIRPORT_TIMEZONES[arr]);
    timezoneStatus.textContent=depKnown&&arrKnown
      ? `${dep} ${airportTimezone(dep)} · ${arr} ${airportTimezone(arr)}`
      : "Airport timezone not found for one station; device timezone fallback is being used.";
    timezoneStatus.classList.toggle("warning",!(depKnown&&arrKnown));
  }

  applySmartDutyTimeDisplayMode(smartDutyTimeDisplayMode());
}

let smartDutyRenderSignature="";
let activeSmartDutyState="next";
let smartDutyExpanded=false;
let smartDutyExpandedKey="";

function setSmartDutyExpanded(expanded){
  const card=$("#nextDutyCard");
  if(!card) return;

  smartDutyExpanded=Boolean(expanded);
  const canExpand=!(["next","layover"].includes(activeSmartDutyState));
  card.classList.toggle("smart-duty-expanded",smartDutyExpanded&&canExpand);

  const expandBtn=$("#smartDutyExpandBtn");
  if(expandBtn){
    expandBtn.classList.toggle("hidden",!canExpand||smartDutyExpanded);
    expandBtn.setAttribute("aria-expanded",smartDutyExpanded&&canExpand ? "true" : "false");
  }

  const collapseBtn=$("#smartDutyCollapseBtn");
  if(collapseBtn){
    collapseBtn.classList.toggle("hidden",!canExpand||!smartDutyExpanded);
  }

  const label=$("#smartDutyExpandLabel");
  if(label){
    label.textContent=
      activeSmartDutyState==="active" ? "Open Active Duty" :
      activeSmartDutyState==="completed" ? "Open Completed Duty" :
      "Open Duty";
  }
}


function renderSmartDutyStateOverview(row,state,dutyLayover){
  const depText=String(row.dep||"");
  const arrText=String(row._arrival||row.arr||"");
  const dutyEndText=String(row._finalDutyEnd||row.dutyEnd||"");
  const depDate=row.date;
  const arrDate=smartDutyDateForNextDay(row.date,arrText);
  const endDate=smartDutyDateForNextDay(row.date,dutyEndText);

  $("#smartDutyDepTime").textContent=smartDutyClockParts(depText);
  $("#smartDutyDepDate").textContent=smartDutyShortDate(depDate);
  $("#smartDutyArrTime").textContent=smartDutyClockParts(arrText);
  $("#smartDutyArrDate").textContent=smartDutyShortDate(arrDate);
  $("#smartDutyEndTime").textContent=smartDutyClockParts(dutyEndText);
  $("#smartDutyEndDate").textContent=smartDutyShortDate(endDate);

  if(dutyLayover){
    const nextParts=formatLayoverLocal(dutyLayover.end,dutyLayover.airport).split(" ");
    $("#smartDutyNextReportTime").textContent=nextParts.pop()||"—";
    $("#smartDutyNextReportDate").textContent=smartDutyShortDate(nextParts.join(" "));
  }else{
    $("#smartDutyNextReportTime").textContent="—";
    $("#smartDutyNextReportDate").textContent="—";
  }

  $("#smartDutyProductivityAllowance").textContent=moneyRM(productivityAllowanceForDuty(row));
  $("#smartDutyLayoverAllowance").textContent=moneyRM(dutyLayover?.amount||0);

  const routeStatus=$("#smartDutyRouteStatus");
  const timingRow=$("#smartDutyTimingRow");
  routeStatus?.classList.toggle("hidden",state!=="active");
  timingRow?.classList.toggle("hidden",state==="active");

  if(state==="active"){
    const record=operationalRecord(row);
    const pushback=operationalEvent(record,"pushback");
    const landing=operationalEvent(record,"landing");
    const dep=Number.isFinite(pushback.at) ? `${pushback.time} UTC` : `Dep ${smartDutyClockParts(depText)}`;
    const arr=Number.isFinite(landing.at) ? `${landing.time} UTC` : `Arr ${smartDutyClockParts(arrText)}`;
    $("#smartDutyRouteStatusLeft").textContent=dep;
    $("#smartDutyRouteStatusRight").textContent=arr;
    $("#smartDutyRouteStatusCenter").textContent=smartDutyPhase(row,record,smartCrewRole());
  }

  const overview=$("#smartDutyStateOverview");
  overview?.classList.toggle("layover-state",state==="layover");
}

function refreshSmartDutyCard(force=false){
  const card=$("#nextDutyCard");
  if(!card) return;

  const selection=getSmartDutySelection(getRows());
  if(!selection){
    card.classList.add("hidden");
    card.classList.remove("smart-duty-expanded");
    activeNextDuty=null;
    smartDutyExpanded=false;
    smartDutyExpandedKey="";
    smartDutyRenderSignature="";
    return;
  }

  const {row,state,layover:selectionLayover}=selection;
  const role=smartCrewRole();
  const dutyKey=row._smartKey||smartDutyKey(row);
  const signature=`${dutyKey}|${state}|${role}`;
  const changed=force || signature!==smartDutyRenderSignature;

  // A newly selected duty starts compact. The crew member can tap the card
  // to reveal the full Active/Completed Duty workspace when needed.
  if(smartDutyExpandedKey!==dutyKey){
    smartDutyExpanded=false;
    smartDutyExpandedKey=dutyKey;
  }

  activeNextDuty=row;
  activeSmartDutyState=state;

  if(changed){
    smartDutyRenderSignature=signature;
    card.classList.remove("hidden","soon","urgent","current","state-next","state-active","state-completed","state-layover");
    card.classList.add(`state-${state}`);

    $("#smartDutyEyebrow").textContent=
      state==="active" ? "ACTIVE DUTY" :
      state==="completed" ? "COMPLETED DUTY" :
      state==="layover" ? "LAYOVER" :
      "NEXT DUTY";

    $("#smartDutyRole").textContent=
      role==="pilot" ? "PILOT" : role==="cabin" ? "CABIN" : "CREW";

    $("#nextDutyItem").textContent=row._displayItems||row.item||"Duty";

    const routeAirports=(row._routeAirports||[]).filter(Boolean);
    const departureAirport=(row.dep||"").trim().split(/\s+/)[0]||"";
    const arrivalAirport=(row._arrival||row.arr||"").trim().split(/\s+/)[0]||"";
    $("#nextDutyRoute").textContent=
      routeAirports.length>1
        ? routeAirports.join(" → ")
        : (departureAirport&&arrivalAirport
            ? `${departureAirport} → ${arrivalAirport}`
            : (departureAirport||arrivalAirport||"—"));

    $("#smartDutyRightLabel").textContent="REPORT";
    $("#nextDutyReport").textContent=row.dutyStart||"—";
    $("#nextDutyDate").textContent=`${row.date} · ${row.day||dayName(row.date)}`;
    $("#nextDutyEnd").textContent=row._finalDutyEnd||row.dutyEnd||"—";
    $("#nextDutyAircraft").textContent=row.ac||"—";
    const dutyLayover=selectionLayover||layoverForDuty(row);
    renderSmartDutyStateOverview(row,state,dutyLayover);
    $("#smartDutyLayoverStrip")?.classList.toggle("hidden",!dutyLayover);
    if(dutyLayover){
      $("#smartDutyLayoverStation").textContent=`Layover in ${dutyLayover.airport}`;
      $("#smartDutyHotel").textContent=dutyLayover.hotel||"Hotel not listed";
      const remain=Math.max(0,Math.round((Number(dutyLayover.end)-Date.now())/60000));
      $("#smartDutyLayoverDuration").textContent=state==="layover"?`${hhmm(remain)} remaining`:hhmm(dutyLayover.durationMinutes);
    }
    if(state==="layover" && dutyLayover){
      $("#nextDutyItem").textContent=dutyLayover.airport;
      $("#nextDutyRoute").textContent=dutyLayover.region;
      $("#smartDutyRightLabel").textContent="NEXT REPORT";
      $("#nextDutyReport").textContent=formatLayoverLocal(dutyLayover.end,dutyLayover.airport).split(" ").pop();
      $("#nextDutyDate").textContent=`Until next report · ${formatLayoverLocal(dutyLayover.end,dutyLayover.airport)}`;
      $("#nextDutyEnd").textContent=formatLayoverLocal(dutyLayover.start,dutyLayover.airport).split(" ").pop();
      $("#nextDutyAircraft").textContent=moneyRM(dutyLayover.amount);
    }

    const livePanel=$("#smartDutyLivePanel");
    livePanel?.classList.toggle("hidden",state==="next"||state==="layover");

    const pilotPanel=$("#pilotOpsPanel");
    const cabinPanel=$("#cabinDutyPanel");
    const showPilotOps=role==="pilot" && smartDutyIsFlight(row) && state!=="next";
    const showCabin=role==="cabin" && state!=="next";
    pilotPanel?.classList.toggle("hidden",!showPilotOps);
    cabinPanel?.classList.toggle("hidden",!showCabin);

    if(showPilotOps) setSmartDutyOperationalInputs(row);

    if(showCabin){
      const arr=String(row._arrival||row.arr||"").trim();
      $("#cabinDutyMessage").textContent=
        state==="completed" ? "Duty completed" : smartDutyPhase(row,{},role);
      $("#cabinDutyNextMilestone").textContent=
        state==="completed"
          ? "CrewView will move to your next report automatically."
          : (arr ? `Scheduled arrival ${arr} · Duty end ${row._finalDutyEnd||row.dutyEnd||"—"}` : `Scheduled duty end ${row._finalDutyEnd||row.dutyEnd||"—"}`);
    }
  }

  setSmartDutyExpanded(smartDutyExpanded);

  const now=new Date();
  const reportMs=row._reportUtcMs||smartDutyReportUtcMs(row)||row._dt.getTime();
  const endMs=row._estimatedEndUtcMs||smartDutyEndUtcMs(row)||row._estimatedEnd?.getTime()||reportMs+12*3600000;
  const record=operationalRecord(row);

  card.classList.remove("soon","urgent");

  if(state==="next"){
    const diff=reportMs-now.getTime();
    if(diff<=6*3600000) card.classList.add("urgent");
    else if(diff<=24*3600000) card.classList.add("soon");

    $("#smartDutyCountdownLabel").textContent="In";
    $("#nextDutyCountdown").textContent=formatCountdown(diff);
    const windowMs=48*3600000;
    const pct=Math.max(0,Math.min(100,(1-(diff/windowMs))*100));
    $("#nextDutyProgress").style.width=`${pct}%`;
    return;
  }

  const completionMs=state==="completed"
    ? (
        (Number.isFinite(operationalEvent(record,"dutyEnd").at)
          ? operationalEvent(record,"dutyEnd").at
          : null) ||
        (Number(record.completedAt)||null) ||
        endMs
      )
    : null;
  const elapsed=Math.max(0,(completionMs||now.getTime())-reportMs);
  const remaining=Math.max(0,endMs-now.getTime());
  $("#smartDutyElapsed").textContent=shortDuration(elapsed);
  $("#smartDutyRemaining").textContent=state==="completed" ? "00h 00m" : shortDuration(remaining);
  $("#smartDutyPhase").textContent=
    state==="completed" ? "COMPLETED" : smartDutyPhase(row,record,role);

  if(role==="pilot" && smartDutyIsFlight(row)){
    setSmartDutyOperationalInputs(row);
  }

  renderSmartDutyStateOverview(row,state,selectionLayover||layoverForDuty(row));

  if(state==="active"){
    $("#smartDutyCountdownLabel").textContent="Elapsed";
    $("#nextDutyCountdown").textContent=shortDuration(elapsed);
    const span=Math.max(1,endMs-reportMs);
    const pct=Math.max(0,Math.min(100,(elapsed/span)*100));
    $("#nextDutyProgress").style.width=`${pct}%`;
  }else{
    const dutyEndEvent=operationalEvent(record,"dutyEnd");
    $("#smartDutyCountdownLabel").textContent="Finished";
    $("#nextDutyCountdown").textContent=dutyEndEvent.time ? `${dutyEndEvent.time} UTC` : (row._finalDutyEnd||row.dutyEnd||"—");
    $("#nextDutyProgress").style.width="100%";
  }
}

function renderNextDuty(){
  refreshSmartDutyCard(true);
  if(nextDutyTimer) clearInterval(nextDutyTimer);
  nextDutyTimer=setInterval(()=>refreshSmartDutyCard(false),1000);
}

function fullAirportTiming(value){
  return String(value||"").trim()||"—";
}

function openDutyDetails(){
  if(!activeNextDuty) return;

  const row=activeNextDuty;
  const departure=row.dep||"";
  const arrival=row._arrival||row.arr||"";
  const depAirport=String(departure).trim().split(/\s+/)[0]||"";
  const arrAirport=String(arrival).trim().split(/\s+/)[0]||"";
  const routeAirports=(row._routeAirports||[]).filter(Boolean);

  $("#dutyDetailTitle").textContent=
    row._displayItems||row.item||"Duty";
  $("#dutyDetailRoute").textContent=
    routeAirports.length>1
      ? routeAirports.join(" → ")
      : (depAirport&&arrAirport ? `${depAirport} → ${arrAirport}` : "—");

  $("#detailDate").textContent=
    `${row.date} · ${row.day||dayName(row.date)}`;
  $("#detailReport").textContent=row.dutyStart||"—";
  $("#detailDeparture").textContent=fullAirportTiming(departure);
  $("#detailArrival").textContent=fullAirportTiming(arrival);
  $("#detailDutyEnd").textContent=
    row._finalDutyEnd||row.dutyEnd||"—";
  $("#detailAircraft").textContent=row.ac||"—";
  $("#detailBlock").textContent=row._totalBlock||row.block||"—";
  $("#detailDutyHours").textContent=row._totalDuty||row.duty||"—";
  $("#detailWorkType").textContent=row.work||"—";
  $("#detailCountdown").textContent=
    activeSmartDutyState==="active"
      ? "DUTY ACTIVE"
      : activeSmartDutyState==="completed"
        ? "COMPLETED"
        : formatCountdown(row._dt-new Date());

  const sectorSection=$("#dutySectorSection");
  const sectorList=$("#dutySectorList");
  const sectors=row._sectors||[];

  if(sectorSection && sectorList){
    sectorSection.classList.toggle("hidden",sectors.length<2);
    sectorList.innerHTML=sectors.map((sector,index)=>`
      <div class="duty-sector-row">
        <span class="duty-sector-number">${index+1}</span>
        <strong>${esc(sector.item||"Sector")}</strong>
        <span>${esc(sector.dep||"—")} → ${esc(sector.arr||"—")}</span>
        <small>${esc(sector.block||"")}</small>
      </div>
    `).join("");
  }

  const productivityAmount=productivityAllowanceForDuty(row);
  const dutyLayover=layoverForDuty(row);
  const layoverAmount=Number(dutyLayover?.amount||0);
  const totalAllowance=productivityAmount+layoverAmount;
  const grade=$("#payGrade")?.value||inferredPayGrade();

  $("#detailProductivityAllowance").textContent=moneyRM(productivityAmount);
  $("#detailProductivityFormula").textContent=productivityAmount>0
    ? `${row._totalDuty||row.duty||"—"} eligible roster duty · ${grade}`
    : "This duty is not eligible for the current productivity estimate.";
  $("#detailLayoverAllowance").textContent=moneyRM(layoverAmount);
  $("#detailLayoverFormula").textContent=dutyLayover
    ? `${layoverMealsShort(dutyLayover)} · ${dutyLayover.region}`
    : "No qualifying layover detected for this duty.";
  $("#detailTotalAllowance").textContent=moneyRM(totalAllowance);

  document.querySelectorAll("[data-duty-detail-tab]").forEach(button=>{
    const active=button.dataset.dutyDetailTab==="overview";
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  $("#dutyDetailOverviewPanel")?.classList.remove("hidden");
  $("#dutyDetailEarningsPanel")?.classList.add("hidden");

  $("#dutyDetailBackdrop").classList.remove("hidden");
  $("#dutyDetailSheet").classList.remove("hidden");
  document.body.classList.add("duty-details-open");
  $("#dutyDetailClose").focus();
}

function openDutyDetailsFor(row){
  if(!row) return;
  activeNextDuty=row;
  openDutyDetails();
}

function closeDutyDetails(){
  $("#dutyDetailBackdrop").classList.add("hidden");
  $("#dutyDetailSheet").classList.add("hidden");
  document.body.classList.remove("duty-details-open");
  $("#nextDutyCard")?.focus();
}

$("#smartDutyExpandBtn")?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();
  if(activeSmartDutyState==="next") return;
  setSmartDutyExpanded(true);
});

$("#smartDutyCollapseBtn")?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();
  setSmartDutyExpanded(false);
  $("#nextDutyCard")?.scrollIntoView({behavior:"smooth",block:"nearest"});
});

$("#nextDutyCard")?.addEventListener("click",event=>{
  if(event.target.closest(".smart-duty-control")) return;

  // Next Duty already contains the useful duty information, so tapping it
  // does not open a duplicate details sheet. Active/Completed Duty remains
  // a compact launcher for the operational workspace.
  if(activeSmartDutyState!=="next" && !smartDutyExpanded){
    setSmartDutyExpanded(true);
  }
});

document.querySelectorAll("[data-ops-now]").forEach(button=>{
  button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    if(!activeNextDuty) return;
    const field=button.dataset.opsNow;
    setOperationalEvent(activeNextDuty,field,currentUtcHHMM(),{capturedNow:true});
    refreshSmartDutyCard(true);
  });
});

function normalizeOpsTypedTime(value){
  const raw=String(value||"").trim();
  const digits=raw.replace(/\D/g,"").slice(0,4);
  if(digits.length!==4) return null;
  const hour=Number(digits.slice(0,2));
  const minute=Number(digits.slice(2));
  if(!Number.isInteger(hour)||!Number.isInteger(minute)||hour>23||minute>59) return null;
  return `${digits.slice(0,2)}:${digits.slice(2)}`;
}

function restoreOpsInputFromStore(input){
  if(!activeNextDuty) return;
  const record=operationalRecord(activeNextDuty);
  const event=operationalEvent(record,input.dataset.opsField);
  input.value=event.time||"";
}

document.querySelectorAll("[data-ops-field]").forEach(input=>{
  input.addEventListener("click",event=>event.stopPropagation());
  input.addEventListener("focus",event=>{
    event.stopPropagation();
    // Select the whole existing value so typing 4 digits immediately replaces it.
    // inputmode=numeric opens the iPhone number keypad instead of the wheel picker.
    requestAnimationFrame(()=>input.select());
  });
  input.addEventListener("input",event=>{
    event.stopPropagation();
    const digits=input.value.replace(/\D/g,"").slice(0,4);
    input.value=digits;
    if(digits.length!==4 || !activeNextDuty) return;

    const formatted=normalizeOpsTypedTime(digits);
    if(!formatted){
      input.setCustomValidity("Enter a valid UTC time from 0000 to 2359.");
      input.reportValidity();
      return;
    }

    input.setCustomValidity("");
    input.value=formatted;
    setOperationalEvent(activeNextDuty,input.dataset.opsField,formatted,{capturedNow:false});
    refreshSmartDutyCard(true);
    requestAnimationFrame(()=>input.blur());
  });
  input.addEventListener("change",event=>{
    event.stopPropagation();
    if(!activeNextDuty) return;
    const raw=String(input.value||"").trim();
    if(!raw){
      setOperationalEvent(activeNextDuty,input.dataset.opsField,"",{capturedNow:false});
      refreshSmartDutyCard(true);
      return;
    }
    const formatted=normalizeOpsTypedTime(raw);
    if(!formatted){
      restoreOpsInputFromStore(input);
      return;
    }
    input.value=formatted;
    setOperationalEvent(activeNextDuty,input.dataset.opsField,formatted,{capturedNow:false});
    refreshSmartDutyCard(true);
  });
  input.addEventListener("blur",()=>{
    const raw=String(input.value||"").trim();
    if(raw && !normalizeOpsTypedTime(raw)) restoreOpsInputFromStore(input);
  });
});

document.querySelectorAll("[data-ops-time-mode]").forEach(button=>{
  button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    applySmartDutyTimeDisplayMode(button.dataset.opsTimeMode);
  });
});

$("#opsResetBtn")?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();
  if(!activeNextDuty) return;
  resetOperationalRecord(activeNextDuty);
  refreshSmartDutyCard(true);
});
$("#dutyDetailClose")?.addEventListener("click",closeDutyDetails);
$("#dutyDetailBackdrop")?.addEventListener("click",closeDutyDetails);
document.addEventListener("keydown",event=>{
  if(event.key==="Escape" && !$("#dutyDetailSheet")?.classList.contains("hidden")){
    closeDutyDetails();
  }
});



function airportCode(value){
  return String(value||"").trim().split(/\s+/)[0]||"";
}

function scorePairingRows(rows){
  if(!rows.length) return -Infinity;

  let score=0;
  const flights=rows.filter(row=>/^MH\d{2,4}$/i.test(String(row.item||"").trim()));
  const dates=new Set(rows.map(row=>row.date).filter(Boolean));

  score+=flights.length*20;
  score+=dates.size*4;

  // Reward clean field separation.
  rows.forEach(row=>{
    const item=String(row.item||"").trim().toUpperCase();
    if(/^\d{2}:\d{2}$/.test(String(row.dutyStart||""))) score+=2;
    if(/^MH\d{2,4}$/i.test(item)) score+=5;
    // Cabin office duty (OFF01 / OF1) is a real duty, not an off day.
    if(/^(?:OFF0?1|OF1)$/.test(item)) score+=12;
    if(/^[A-Z]{3}\s+\d{2}:\d{2}/.test(String(row.dep||""))) score+=3;
    if(/^[A-Z]{3}\s+\d{2}:\d{2}/.test(String(row.arr||""))) score+=3;

    if(/MH\d+/i.test(String(row.dutyStart||""))) score-=30;
    if(/\d{2}:\d{2}/.test(String(row.item||""))) score-=25;
    if(/\//.test(String(row.item||""))) score-=25;
  });

  // Reward correct sector continuity within each duty:
  // KUL→SIN followed by SIN→KUL, etc.
  const groups=new Map();
  rows.forEach(row=>{
    if(!row._dutyGroup) return;
    if(!groups.has(row._dutyGroup)) groups.set(row._dutyGroup,[]);
    groups.get(row._dutyGroup).push(row);
  });

  groups.forEach(group=>{
    group.sort((a,b)=>Number(a._sectorIndex||0)-Number(b._sectorIndex||0));

    for(let i=1;i<group.length;i++){
      const previousArrival=airportCode(group[i-1].arr);
      const currentDeparture=airportCode(group[i].dep);

      if(previousArrival && currentDeparture){
        score+=previousArrival===currentDeparture ? 35 : -20;
      }
    }

    if(group.length>1) score+=group.length*8;
  });

  // Penalize duplicate flight/date combinations.
  const seen=new Set();
  flights.forEach(row=>{
    const key=`${row.date}|${row.item}|${row.dep}|${row.arr}`;
    if(seen.has(key)) score-=40;
    seen.add(key);
  });

  return score;
}

function pairingCoordinateCandidates(textContent,viewport,page){
  const rawWidth=Math.abs((page.view?.[2]||0)-(page.view?.[0]||0))||viewport.height;
  const rawHeight=Math.abs((page.view?.[3]||0)-(page.view?.[1]||0))||viewport.width;

  const base=textContent.items
    .map(item=>{
      const transformed=pdfjsLib.Util.transform(
        viewport.transform,
        item.transform
      );

      return {
        s:item.str.trim(),
        rawX:item.transform[4],
        rawY:item.transform[5],
        transformedX:transformed[4],
        transformedY:transformed[5]
      };
    })
    .filter(item=>item.s);

  const make=(name,width,height,mapper)=>({
    name,
    width,
    height,
    items:base.map(item=>({
      s:item.s,
      ...mapper(item)
    }))
  });

  return [
    make(
      "viewport",
      viewport.width,
      viewport.height,
      item=>({
        x:item.transformedX,
        y:viewport.height-item.transformedY
      })
    ),

    // Correct mapping for PDFs physically stored in portrait and displayed
    // with a 90-degree page rotation.
    make(
      "raw-90-clockwise",
      rawHeight,
      rawWidth,
      item=>({
        x:rawHeight-item.rawY,
        y:item.rawX
      })
    ),

    make(
      "raw-90-counterclockwise",
      rawHeight,
      rawWidth,
      item=>({
        x:item.rawY,
        y:rawWidth-item.rawX
      })
    ),

    make(
      "raw-unrotated",
      rawWidth,
      rawHeight,
      item=>({
        x:item.rawX,
        y:rawHeight-item.rawY
      })
    )
  ];
}


function detectRosterType(text){
  const normalized=String(text||"")
    .replace(/\s+/g," ")
    .trim();

  /*
   * The crew profile appears in the PDF header:
   * NAME | STAFF | FLEET | BASE | RANK
   *
   * Pilot ranks are routed to the dedicated physical-row parser.
   * Cabin ranks continue using the pairing parser.
   */
  const profile=normalized.match(
    /\|\s*\d{5,}\s*\|\s*[A-Z0-9]{2,5}\s*\|\s*[A-Z]{3}\s*\|\s*([A-Z0-9]{2,5})\b/i
  );

  const rank=(profile?.[1]||"").toUpperCase();

  if(
    ["FO","SO","CPT","CAPT","CMDR","SFO"].includes(rank)
  ){
    return "pilot";
  }

  if(
    ["FS","FSS","LS","CSS","IFS","IFM","CCM"].includes(rank)
  ){
    return "cabin";
  }

  // Pilot reports expose official FH and DH totals in the header.
  if(/\bFH\s*:\s*\d+:\d{2}\b/i.test(normalized) &&
     /\bDH\s*:\s*\d+:\d{2}\b/i.test(normalized)){
    return "pilot";
  }

  return "cabin";
}

async function parsePDF(file){
  status.textContent="Reading PDF…";
  officialFH=null;
  officialDH=null;
  officialRosterPeriod=null;
  $("#validationResult")?.classList.add("hidden");
  ["name","staff","rank","fleet","base"].forEach(id=>$("#"+id).value="");

  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjsLib.getDocument({data}).promise;

  let allRows=[];
  let allText=[];
  let pairingMode=false;

  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber);
    const viewport=page.getViewport({scale:1});
    const textContent=await page.getTextContent();

    const viewportItems=textContent.items
      .map((item,sourceIndex)=>{
        const transformed=pdfjsLib.Util.transform(
          viewport.transform,
          item.transform
        );
        return {
          s:item.str.trim(),
          x:transformed[4],
          y:viewport.height-transformed[5],
          sourceIndex
        };
      })
      .filter(item=>item.s);

    const pageText=viewportItems.map(item=>item.s).join(" ");
    allText.push(pageText);

    const rosterType=detectRosterType(pageText);

    if(rosterType==="cabin"){
      pairingMode=true;

      const attempts=pairingCoordinateCandidates(
        textContent,
        viewport,
        page
      ).map(candidate=>{
        const rows=buildPairingRows(
          candidate.items,
          candidate.width,
          candidate.height,
          pageNumber
        );

        return {
          ...candidate,
          rows,
          score:scorePairingRows(rows)
        };
      });

      attempts.sort((a,b)=>b.score-a.score);
      const selected=attempts[0];

      console.info(
        "CrewView cabin parser:",
        selected.name,
        selected.score
      );

      allRows.push(...selected.rows);
    }else{
      const pilotRows=buildRows(
        viewportItems,
        viewport.width,
        viewport.height,
        pageNumber
      );

      console.info(
        "CrewView pilot parser:",
        `page ${pageNumber}`,
        `${pilotRows.length} rows`
      );

      allRows.push(...pilotRows);
    }
  }

  const combinedText=allText.join(" ");
  parseHeader(combinedText);
  // Detect only the scheduled roster time basis. This does not alter the PDF
  // parser, offline boot, service-worker strategy, or pilot actual UTC storage.
  rosterTimeBasis=detectRosterTimeBasis(allRows,combinedText);
  console.info("CrewView roster time basis:",rosterTimeBasis);

  if(!pairingMode){
    allRows.push(
      ...recoverMissingFlightRows(
        combinedText,
        allRows
      )
    );
  }

  const seen=new Set();
  allRows=allRows.filter(row=>{
    const key=[
      row.date,
      row.item,
      row.dutyStart,
      row._dutyGroup||"",
      row._sectorIndex??""
    ].join("|");

    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if(!allRows.length){
    throw new Error(
      "No roster rows were detected. This version supports Malaysia Airlines pilot and pairing-based cabin crew Roster Report PDFs."
    );
  }

  // Restore complete rows from the PDF text before creating the monthly calendar.
  // This preserves previous-month carry-in rows and final rows on later pages.
  allRows=restoreMissingPilotDates(
    allRows,
    combinedText
  );

  allRows=applyPilotHotelAssignments(allRows,combinedText);

  allRows=fillEveryDay(
    allRows,
    officialRosterPeriod
  );

  /*
   * Mark layover days while the outbound flight still contains its original
   * (+1) arrival station. This must happen before overnight values are split
   * onto arrival-only continuation rows.
   */
  allRows=markLayoverCalendarRows(
    allRows,
    ($("#base")?.value||"KUL").trim().toUpperCase()
  );

  // Move only values explicitly marked (+1) onto the following calendar date.
  allRows=moveExplicitNextDayTimings(allRows);

  if(pairingMode){
    const dutyDates=new Map();
    allRows.forEach(row=>{
      if(
        row._dutyGroup &&
        Number(row._sectorIndex||0)===0
      ){
        dutyDates.set(row._dutyGroup,row.date);
      }
    });
    allRows.forEach(row=>{
      if(
        row._dutyGroup &&
        dutyDates.has(row._dutyGroup) &&
        !row._overnightContinuation
      ){
        row.date=dutyDates.get(row._dutyGroup);
        row.day=dayName(row.date);
      }
    });
  }

  // Repair iFlight multi-sector continuation rows whose Duty End / Flying Hrs
  // columns were shifted by the PDF text geometry.
  // Normalize shifted multi-sector rows before monthly FH/DH validation.
  // This must run even when a PDF revision omits continuation metadata.
  allRows=normalizePilotContinuationColumns(allRows);

  allRows=markRemainingBlankDaysAsOff(allRows);

  // Restore blank display for inferred layover calendar dates.
  allRows.forEach(row=>{
    if(row._layoverDay) row.item="";
  });

  // A next-day arrival row already represents that calendar date. Remove only
  // the automatically generated blank D row for the same date.
  allRows=removeSyntheticOffRowsOnOvernightDates(allRows);

  // Remove any D/DO placeholder that shares a date with an actual duty.
  allRows=removeOffPlaceholdersOnDutyDates(allRows);

  // Do not render parser placeholders with no date and no roster content.
  // These rows caused the visible full-height gap between 07-Aug and 08-Aug.
  allRows=removeCompletelyBlankRows(allRows);

  allRows.forEach((row,index)=>{
    row._displayOrder=
      Number.isFinite(row._visualOrder)
        ? row._visualOrder
        : index;
  });

  allRows.sort((a,b)=>{
    const ad=parseRosterDate(a.date);
    const bd=parseRosterDate(b.date);
    const dateDiff=(ad?.getTime()||0)-(bd?.getTime()||0);
    if(dateDiff!==0) return dateDiff;

    if(a._overnightContinuation && !b._overnightContinuation) return -1;
    if(!a._overnightContinuation && b._overnightContinuation) return 1;

    const aOrder=Number.isFinite(a._visualOrder)
      ? a._visualOrder
      : Number(a._displayOrder||0);
    const bOrder=Number.isFinite(b._visualOrder)
      ? b._visualOrder
      : Number(b._displayOrder||0);

    return aOrder-bOrder;
  });

  // Re-read the official monthly totals from the complete PDF text after all
  // pages have been combined. These values are authoritative for the revision.
  const finalFH=combinedText.match(/\bFH\s*:\s*(\d+:\d{2})/i);
  const finalDH=combinedText.match(/\bDH\s*:\s*(\d+:\d{2})/i);
  if(finalFH) officialFH=finalFH[1];
  if(finalDH) officialDH=finalDH[1];

  setRows(allRows);
  saveRosterSnapshot(allRows);
  updateRosterSourceNote();

  const validation=validateKnownRoster(allRows);
  renderValidation(validation);

  const firstDate=allRows
    .map(row=>parseRosterDate(row.date))
    .find(Boolean);

  const calendarDays=officialRosterPeriod
    ? Math.round(
        (officialRosterPeriod.end-officialRosterPeriod.start)/86400000
      )+1
    : (
        firstDate
          ? new Date(
              firstDate.getFullYear(),
              firstDate.getMonth()+1,
              0
            ).getDate()
          : allRows.length
      );

  status.textContent=
    `Converted the roster and displayed all ${calendarDays} calendar days.`;

  document.body.classList.add("roster-loaded");
  window.dispatchEvent(new CustomEvent("crewview:roster-state",{detail:{loaded:true}}));
  $("#uploadCard")?.setAttribute("aria-hidden","true");
  $("#loadedRosterActions")?.setAttribute("aria-hidden","false");
  $("#viewSwitcher")?.classList.remove("hidden");

  // A newly uploaded roster always opens in Classic View first.
  clearTimeout(crewViewTransitionTimer);
  document.body.classList.remove("view-transitioning");
  $("#classicView")?.classList.remove("view-entering","view-leaving");
  $("#calendarView")?.classList.remove("view-entering","view-leaving");
  crewViewMode="classic";
  setPrimaryRosterViewVisibility("classic");
  document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");
  document.querySelectorAll(".view-tab[data-view]").forEach(tab=>
    tab.classList.toggle("active",tab.dataset.view==="classic")
  );
  localStorage.setItem("crewview-roster-view","classic");
  updateCompactProfile();

  // Treat every successful upload as a fresh roster opening.
  // Do not preserve the user's previous Classic or Calendar scroll position.
  crewViewScrollPositions.classic=0;
  crewViewScrollPositions.calendar=0;
  crewViewScrollPositions.timeline=0;
  crewViewScrollPositions.pay=0;

  // Reset every scroll root used by Safari / Home Screen web apps.
  const resetUploadScrollPosition=()=>{
    window.scrollTo({top:0,left:0,behavior:"auto"});
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    $("#classicView")?.scrollTo?.({top:0,left:0,behavior:"auto"});
    $("#calendarView")?.scrollTo?.({top:0,left:0,behavior:"auto"});
  };

  // Run after layout fitting and again after the browser paints the
  // collapsed upload panel, so iOS cannot restore the previous position.
  applyOnePageFit();
  resetUploadScrollPosition();

  requestAnimationFrame(()=>{
    resetUploadScrollPosition();
    requestAnimationFrame(resetUploadScrollPosition);
  });

  setTimeout(resetUploadScrollPosition,120);

  const validationMessage=($("#validationResult")?.textContent||"").trim();
  showValidationToast(
    validationMessage || `${loadedRosterMonth()?.toLocaleString("en-US",{month:"long",year:"numeric"})||"Roster"} validation passed.`
  );
}





/* CrewView Pay — roster-driven productivity estimate.
 * Source rules supplied from MAB Pilot Guidebook rev 01.3.0 (01-Jun-2025):
 * PA is based on applicable actual duty hours of operating/positioning flights;
 * standby and observation are excluded. 80+ payment uses actual flying block
 * above 80 hours. Roster values are used as an estimate until actuals exist.
 */
const PAY_RULES={
  "C2-P":{pa:240,over80:95,label:"Captain"},
  "C1-P":{pa:130,over80:75,label:"First Officer"},
  "D2-P":{pa:130,over80:75,label:"Second Officer"},
  "D1-P":{pa:105,over80:75,label:"Cadet Pilot"}
};

function inferredPayGrade(){
  const rank=String($("#rank")?.value||"").trim().toUpperCase();
  if(["CPT","CAPT","CMDR","CP"].includes(rank)) return "C2-P";
  if(["SO"].includes(rank)) return "D2-P";
  if(["CADET","CPILOT"].includes(rank)) return "D1-P";
  return "C1-P";
}

function isPayStandby(row){
  const item=String(row?.item||"").trim().toUpperCase();
  return item.includes("SBY") || /^S[1-4](?:-|$)/.test(item) || item.includes("STANDBY");
}

function isPayObservation(row){
  const item=String(row?.item||"").trim().toUpperCase();
  const work=String(row?.work||"").trim().toUpperCase();
  return item.includes("OBS") || work==="OBS" || work==="OBSERVATION";
}

function isPayEligibleFlight(row){
  if(!row || row._overnightContinuation || isPayStandby(row) || isPayObservation(row)) return false;
  const item=String(row.item||"").trim().toUpperCase();
  const work=String(row.work||"").trim().toUpperCase();
  return /^MH\d+/.test(item) && ["OP","PS","SFP"].includes(work);
}

function payDutyGroups(){
  const rows=getRows();
  const groups=[];
  const seen=new Set();
  rows.forEach((row,index)=>{
    if(!isPayEligibleFlight(row)) return;
    const key=row._dutyGroup || [row.date,row.dutyStart,index].join("|");
    if(seen.has(key)) return;
    seen.add(key);
    const members=row._dutyGroup ? rows.filter(r=>r._dutyGroup===row._dutyGroup) : [row];
    const eligible=members.filter(isPayEligibleFlight);
    if(!eligible.length) return;
    const dutyMinutes=toMinutes(row.duty || members.find(r=>toMinutes(r.duty)>0)?.duty);
    if(dutyMinutes<=0) return;
    const items=eligible.map(r=>String(r.item||"").trim()).filter(Boolean);
    const routeParts=[];
    eligible.forEach((r,i)=>{
      const dep=(parseStationClock(r.dep)||{}).station;
      const arr=(parseStationClock(r.arr)||{}).station;
      if(i===0 && dep) routeParts.push(dep);
      if(arr) routeParts.push(arr);
    });
    groups.push({
      key,date:row.date||"",items:[...new Set(items)].join(" / "),
      route:routeParts.join(" → ")||routeFromRow(row),minutes:dutyMinutes
    });
  });
  return groups;
}

function payMonthlyBlockMinutes(){
  return getRows().reduce((sum,row)=>{
    if(!officialRosterPeriod) return sum+toMinutes(row.block);
    const d=parseRosterDate(row.date);
    if(!d || d<officialRosterPeriod.start || d>officialRosterPeriod.end) return sum;
    return sum+toMinutes(row.block);
  },0);
}

function moneyRM(value){
  return `RM${Number(value||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}



function productivityAllowanceForDuty(row){
  if(!row) return 0;
  const gradeEl=$("#payGrade");
  const grade=(gradeEl?.dataset?.userSelected && gradeEl.value)
    ? gradeEl.value
    : inferredPayGrade();
  const rule=PAY_RULES[grade]||PAY_RULES["C1-P"];

  const item=String(row.item||"").trim().toUpperCase();
  const work=String(row.work||"").trim().toUpperCase();
  if(!/^MH\d+/.test(item) || !["OP","PS","SFP"].includes(work)) return 0;
  if(isPayStandby(row) || isPayObservation(row)) return 0;

  // Match the exact duty grouping used by the Allowances-page breakdown.
  // This avoids Smart Duty grouping metadata borrowing another duty's hours.
  const dutyItems=new Set(
    (row._sectors?.length ? row._sectors.map(s=>s.item) : [row.item])
      .map(v=>String(v||"").trim().toUpperCase())
      .filter(Boolean)
  );

  const grouped=payDutyGroups().find(group=>{
    if(String(group.date||"")!==String(row.date||"")) return false;
    return String(group.items||"")
      .split(/\s*\/\s*/)
      .map(v=>v.trim().toUpperCase())
      .some(v=>dutyItems.has(v));
  });

  let minutes=grouped?.minutes||0;
  if(!(minutes>0)) minutes=toMinutes(row.duty);
  if(!(minutes>0)) minutes=toMinutes(row._totalDuty);

  return minutes>0 ? minutes/60*rule.pa : 0;
}

function smartDutyClockParts(text){
  const m=String(text||"").match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(m[1]).padStart(2,"0")}:${m[2]}` : "—";
}
function smartDutyShortDate(dateText){
  let d=parseRosterDate(dateText);
  if(!d){
    const m=String(dateText||"").match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if(m) d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  }
  if(!d || Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2,"0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}`;
}
function smartDutyDateForNextDay(dateText,value){
  return /\(\+1\)/.test(String(value||"")) ? addRosterDays(dateText,1) : dateText;
}

function renderPayView(){
  const gradeEl=$("#payGrade");
  if(!gradeEl) return;
  if(!gradeEl.dataset.userSelected){
    gradeEl.value=inferredPayGrade();
  }
  const grade=gradeEl.value;
  const rule=PAY_RULES[grade]||PAY_RULES["C1-P"];
  const duties=payDutyGroups();
  const eligibleMinutes=duties.reduce((sum,d)=>sum+d.minutes,0);
  const blockMinutes=payMonthlyBlockMinutes();
  const excessMinutes=Math.max(0,blockMinutes-80*60);
  const paAmount=eligibleMinutes/60*rule.pa;
  const over80Amount=excessMinutes/60*rule.over80;
  const total=paAmount+over80Amount;
  const month=loadedRosterMonth();

  $("#payMonthLabel").textContent=month ? `${monthFormatter.format(month)} · roster estimate` : "Estimated from your loaded roster";
  $("#payEstimatedTotal").textContent=moneyRM(total);
  $("#payPaAmount").textContent=moneyRM(paAmount);
  $("#payEligibleDuty").textContent=hhmm(eligibleMinutes);
  $("#payPaFormula").textContent=`${hhmm(eligibleMinutes)} × ${moneyRM(rule.pa)}/hour · ${grade}`;
  $("#pay80Amount").textContent=moneyRM(over80Amount);
  $("#payBlockHours").textContent=hhmm(blockMinutes);
  $("#pay80Formula").textContent=excessMinutes>0
    ? `${hhmm(excessMinutes)} above 80:00 × ${moneyRM(rule.over80)}/hour`
    : "No excess above 80:00";
  $("#payDutyCount").textContent=`${duties.length} ${duties.length===1?"duty":"duties"}`;
  $("#payBreakdownList").innerHTML=duties.length ? duties.map(d=>{
    const amount=d.minutes/60*rule.pa;
    return `<div class="pay-breakdown-row"><div><strong>${esc(d.date)} · ${esc(d.items||"Flight")}</strong><small>${esc(d.route)}</small></div><span class="pay-breakdown-hours">${hhmm(d.minutes)}</span><span class="pay-breakdown-amount">${moneyRM(amount)}</span></div>`;
  }).join("") : '<div class="pay-empty">No eligible operating or positioning flight duty found in this roster.</div>';
  const layoverTotal=renderLayoverAllowance();
  const combinedEl=$("#payCombinedTotal");
  if(combinedEl) combinedEl.textContent=moneyRM(total+Number(layoverTotal||0));
}



/* Layover Allowance — destination-local meal entitlement.
 * Rule supplied by user/company material:
 * - travel time is time spent at destination and excludes flight time;
 * - calculation starts at Duty End Time at station and ends at next Reporting Time;
 * - entitlement is based on destination local time encroaching the meal windows:
 *   Breakfast 07:01-09:00, Lunch 12:01-14:00, Dinner 19:01-21:00.
 * Daily rate equals the sum of the three meal rates for the region.
 */
const LAYOVER_RATES={
  "Australia / New Zealand":{daily:600,breakfast:120,lunch:180,dinner:300},
  "North America":{daily:440,breakfast:88,lunch:132,dinner:220},
  "Western Europe":{daily:550,breakfast:110,lunch:165,dinner:275},
  "Central and Eastern Europe":{daily:430,breakfast:86,lunch:129,dinner:215},
  "South America":{daily:470,breakfast:94,lunch:141,dinner:235},
  "East Asia":{daily:430,breakfast:86,lunch:129,dinner:215},
  "South East Asia":{daily:420,breakfast:84,lunch:126,dinner:210},
  "South Asia":{daily:310,breakfast:62,lunch:93,dinner:155},
  "Central Asia":{daily:470,breakfast:94,lunch:141,dinner:235},
  "Middle East":{daily:550,breakfast:110,lunch:165,dinner:275},
  "Pacific Islands":{daily:490,breakfast:98,lunch:147,dinner:245},
  "South Africa":{daily:400,breakfast:80,lunch:120,dinner:200},
  "Malaysia":{daily:130,breakfast:26,lunch:39,dinner:65}
};

function layoverRegionForAirport(airport){
  const code=String(airport||"").trim().toUpperCase();
  const zone=airportTimezone(code);
  if(zone==="Asia/Kuala_Lumpur") return "Malaysia";
  if(zone.startsWith("Australia/") || ["Pacific/Auckland","Pacific/Chatham"].includes(zone)) return "Australia / New Zealand";
  if(["Asia/Tokyo","Asia/Seoul","Asia/Shanghai","Asia/Hong_Kong","Asia/Macau","Asia/Taipei","Asia/Pyongyang","Asia/Ulaanbaatar"].includes(zone)) return "East Asia";
  if(["Asia/Singapore","Asia/Bangkok","Asia/Ho_Chi_Minh","Asia/Phnom_Penh","Asia/Vientiane","Asia/Jakarta","Asia/Makassar","Asia/Jayapura","Asia/Manila","Asia/Yangon","Asia/Brunei","Asia/Dili"].includes(zone)) return "South East Asia";
  if(["Asia/Kolkata","Asia/Dhaka","Asia/Colombo","Asia/Karachi","Asia/Kathmandu","Indian/Maldives","Asia/Thimphu"].includes(zone)) return "South Asia";
  if(["Asia/Riyadh","Asia/Dubai","Asia/Qatar","Asia/Bahrain","Asia/Kuwait","Asia/Muscat","Asia/Amman","Asia/Beirut","Asia/Damascus","Asia/Jerusalem","Asia/Tehran","Asia/Baku"].includes(zone)) return "Middle East";
  if(["Asia/Almaty","Asia/Aqtobe","Asia/Atyrau","Asia/Bishkek","Asia/Tashkent","Asia/Samarkand","Asia/Dushanbe","Asia/Ashgabat"].includes(zone)) return "Central Asia";
  if(zone.startsWith("Europe/")){
    const eastern=new Set(["Europe/Budapest","Europe/Belgrade","Europe/Bucharest","Europe/Vilnius","Europe/Istanbul","Europe/Tallinn","Europe/Warsaw","Europe/Ljubljana","Europe/Riga","Europe/Skopje","Europe/Bratislava","Europe/Sofia","Europe/Vienna","Europe/Zagreb","Europe/Prague","Europe/Kyiv","Europe/Moscow"]);
    return eastern.has(zone) ? "Central and Eastern Europe" : "Western Europe";
  }
  if(zone.startsWith("Africa/") || zone.startsWith("Indian/Mauritius") || zone.startsWith("Indian/Reunion")) return "South Africa";
  if(zone.startsWith("Pacific/")) return "Pacific Islands";
  const southAmerica=new Set(["America/Sao_Paulo","America/Argentina/Buenos_Aires","America/Argentina/Cordoba","America/Argentina/Mendoza","America/Santiago","America/Lima","America/Bogota","America/Guayaquil","America/La_Paz","America/Montevideo","America/Caracas","America/Asuncion","America/Cuiaba","America/Fortaleza"]);
  if(southAmerica.has(zone)) return "South America";
  if(zone.startsWith("America/")) return "North America";
  return null;
}

function flightDutyGroupsForLayover(){
  const rows=getRows();
  const groups=[];
  const seen=new Set();

  // IMPORTANT: getRows() reconstructs data from the rendered Classic table.
  // _sourceDutyGroup is intentionally not persisted in that DOM, so layover
  // detection must not depend on it. Instead, build each real flight duty from
  // its visible MH sector row(s), then attach any adjacent overnight
  // continuation row that follows the final sector before the next real flight.
  rows.forEach((row,index)=>{
    const item=String(row?.item||"").trim().toUpperCase();
    if(!/^MH\d+/.test(item) || row?._overnightContinuation) return;

    const key=row._dutyGroup || `ROW|${index}`;
    if(seen.has(key)) return;
    seen.add(key);

    const flightIndexes=[];
    if(row._dutyGroup){
      rows.forEach((candidate,i)=>{
        if(candidate?._overnightContinuation) return;
        if(candidate._dutyGroup!==row._dutyGroup) return;
        if(!/^MH\d+/i.test(String(candidate?.item||""))) return;
        flightIndexes.push(i);
      });
    }else{
      flightIndexes.push(index);
    }
    if(!flightIndexes.length) return;

    const flights=flightIndexes.map(i=>rows[i]);
    const members=[...flights];
    const lastFlightIndex=Math.max(...flightIndexes);

    // An overnight arrival/duty-end is moved to a separate continuation row
    // by prepareClassicDisplayRows(). It normally appears after the final
    // sector and before the next real MH flight. Attach those rows by position,
    // which survives the DOM round-trip used by getRows().
    for(let i=lastFlightIndex+1;i<rows.length;i++){
      const candidate=rows[i];
      const candidateItem=String(candidate?.item||"").trim().toUpperCase();
      if(/^MH\d+/.test(candidateItem) && !candidate?._overnightContinuation) break;
      if(candidate?._overnightContinuation){
        members.push(candidate);
        // One continuation is sufficient for a duty end, but allowing more is
        // harmless and supports unusual multi-row overnight formatting.
        continue;
      }
      // Stop once we reach a real non-synthetic duty/off row on a later date;
      // this prevents borrowing an unrelated continuation from another duty.
      if(candidateItem || String(candidate?.dutyStart||"").trim()) break;
    }

    const anchor=flights.find(r=>String(r?.dutyStart||"").trim()) || flights[0];
    const firstDeparture=flights
      .map(r=>parseStationClock(r?.dep))
      .find(v=>v?.station);

    const arrivals=members
      .map(r=>parseStationClock(r?.arr))
      .filter(v=>v?.station);
    const finalArrival=arrivals[arrivals.length-1];

    const departure=firstDeparture?.station||"";
    const destination=finalArrival?.station||"";
    if(!departure || !destination) return;

    const dateMs=parseRosterDate(anchor.date)?.getTime();
    const tm=String(anchor.dutyStart||"").match(/(\d{1,2}):(\d{2})/);
    const order=Number.isFinite(dateMs)
      ? dateMs + (tm ? (Number(tm[1])*60+Number(tm[2]))*60000 : 0)
      : index;

    groups.push({key,anchor,members,flights,departure,destination,order});
  });

  return groups.sort((a,b)=>a.order-b.order);
}

function ymdFromZoneParts(parts){
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(parts.day).padStart(2,"0")}-${months[Number(parts.month)-1]}-${parts.year}`;
}

function enumerateLocalDatesBetween(startMs,endMs,timeZone){
  const start=timePartsInZone(startMs,timeZone), end=timePartsInZone(endMs,timeZone);
  let cursor=Date.UTC(Number(start.year),Number(start.month)-1,Number(start.day));
  const stop=Date.UTC(Number(end.year),Number(end.month)-1,Number(end.day));
  const out=[];
  while(cursor<=stop){
    const d=new Date(cursor);
    const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    out.push(`${String(d.getUTCDate()).padStart(2,"0")}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`);
    cursor+=86400000;
  }
  return out;
}

function mealEntitlementsForLayover(startMs,endMs,airport,region){
  const rate=LAYOVER_RATES[region];
  if(!rate || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs<=startMs) return [];
  const zone=airportTimezone(airport);
  const windows=[
    {key:"breakfast",label:"Breakfast",start:"07:01",end:"09:00"},
    {key:"lunch",label:"Lunch",start:"12:01",end:"14:00"},
    {key:"dinner",label:"Dinner",start:"19:01",end:"21:00"}
  ];
  const result=[];
  enumerateLocalDatesBetween(startMs,endMs,zone).forEach(dateText=>{
    windows.forEach(window=>{
      const mealStart=zonedWallTimeToUtcMs(dateText,window.start,zone);
      const mealEnd=zonedWallTimeToUtcMs(dateText,window.end,zone);
      if(Number.isFinite(mealStart) && Number.isFinite(mealEnd) && startMs<mealEnd && endMs>mealStart){
        result.push({date:dateText,key:window.key,label:window.label,amount:rate[window.key]});
      }
    });
  });
  return result;
}

function formatLayoverLocal(timestamp,airport){
  const parts=timePartsInZone(timestamp,airportTimezone(airport));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
}

function layoverExplicitDutyEndMs(group){
  if(!group?.destination) return null;
  const zone=airportTimezone(group.destination);

  // Prefer the explicit Duty End printed by the roster.  This is the exact
  // start point of the allowance entitlement and avoids reconstructing it
  // from report + duty duration or from the roster's LT/SLT/UTC basis.
  const candidates=[...(group.members||[])].reverse();
  for(const row of candidates){
    const raw=String(row?._finalDutyEnd||row?.dutyEnd||"").trim();
    const tm=raw.match(/(\d{1,2}):(\d{2})/);
    if(!tm) continue;

    let dateText=String(row?.date||group.anchor?.date||"").trim();
    if(!dateText) continue;

    // If Duty End is carried on the originating flight row and explicitly
    // marked (+1), move it to the following calendar day.  Overnight
    // continuation rows already carry the correct date, so do not add again.
    if(/\(\s*\+\s*1\s*\)/.test(raw) && !row?._overnightContinuation){
      dateText=addRosterDays(dateText,1);
    }

    const ms=zonedWallTimeToUtcMs(dateText,`${tm[1]}:${tm[2]}`,zone);
    if(Number.isFinite(ms)) return ms;
  }
  return null;
}

function layoverNextReportMs(group,airport){
  const raw=String(group?.anchor?.dutyStart||"").trim();
  const tm=raw.match(/(\d{1,2}):(\d{2})/);
  const dateText=String(group?.anchor?.date||"").trim();
  if(!tm||!dateText) return null;
  return zonedWallTimeToUtcMs(dateText,`${tm[1]}:${tm[2]}`,airportTimezone(airport));
}

function calculateLayoverAllowances(){
  const groups=flightDutyGroupsForLayover();
  const base=baseAirportCode();
  const layovers=[];

  groups.forEach((group,index)=>{
    if(group.destination===base) return;

    const start=layoverExplicitDutyEndMs(group);
    if(!Number.isFinite(start)) return;

    // The next qualifying duty must REPORT from the same outstation.  Report
    // is interpreted directly in that station's local time, per the allowance
    // rule, instead of inheriting the PDF's global LT/SLT display basis.
    let next=null;
    let end=null;
    for(const candidate of groups.slice(index+1)){
      if(candidate.departure!==group.destination) continue;
      const candidateReport=layoverNextReportMs(candidate,group.destination);
      if(!Number.isFinite(candidateReport)||candidateReport<=start) continue;
      next=candidate;
      end=candidateReport;
      break;
    }
    if(!next||!Number.isFinite(end)) return;

    const region=layoverRegionForAirport(group.destination);
    if(!region || !LAYOVER_RATES[region]) return;
    const meals=mealEntitlementsForLayover(start,end,group.destination,region);
    const amount=meals.reduce((sum,meal)=>sum+Number(meal.amount||0),0);
    const hotel=group.flights.map(r=>String(r._hotel||"").trim()).find(Boolean)||"";
    layovers.push({
      airport:group.destination,region,start,end,hotel,
      durationMinutes:Math.max(0,Math.round((end-start)/60000)),
      meals,amount,fromDate:String(group.anchor?.date||""),
      fromItems:group.flights.map(r=>String(r.item||"").trim()).filter(Boolean).join(" / "),
      nextItems:next.flights.map(r=>String(r.item||"").trim()).filter(Boolean).join(" / ")
    });
  });
  return layovers;
}


function layoverForDuty(row){
  if(!row) return null;
  const item=String(row.item||row._displayItems||"").toUpperCase();
  const date=String(row.date||"");
  const arrival=splitStationTime(row._arrival||row.arr).station;
  const layovers=calculateLayoverAllowances();
  return layovers.find(l=>{
    const items=String(l.fromItems||"").toUpperCase();
    return (date&&l.fromDate===date&&item&&items.includes(item)) ||
           (item&&items.split(/\s*\/\s*/).includes(item));
  }) || layovers.find(l=>arrival&&l.airport===arrival&&(!date||l.fromDate===date)) || null;
}
function layoverMealsShort(l){
  return l?.meals?.length?l.meals.map(m=>`${m.label} ${moneyRM(m.amount)}`).join(" · "):"No qualifying meal";
}

function renderLayoverAllowance(){
  const totalEl=$("#layoverEstimatedTotal");
  if(!totalEl) return;
  const layovers=calculateLayoverAllowances();
  const total=layovers.reduce((sum,l)=>sum+l.amount,0);
  const mealsCount=layovers.reduce((sum,l)=>sum+l.meals.length,0);
  totalEl.textContent=moneyRM(total);
  $("#layoverStayCount").textContent=`${layovers.length} ${layovers.length===1?"layover":"layovers"}`;
  $("#layoverMealCount").textContent=`${mealsCount} qualifying ${mealsCount===1?"meal":"meals"}`;
  $("#layoverBreakdownList").innerHTML=layovers.length ? layovers.map(l=>{
    const mealText=l.meals.length ? l.meals.map(m=>`${m.label} ${moneyRM(m.amount)}`).join(" · ") : "No meal window encroached";
    return `<div class="layover-breakdown-row"><div class="layover-main"><strong>${esc(l.airport)} · ${esc(l.region)}</strong><small>Duty End ${esc(formatLayoverLocal(l.start,l.airport))} → Report ${esc(formatLayoverLocal(l.end,l.airport))}</small><small>${hhmm(l.durationMinutes)} at destination · ${esc(mealText)}</small></div><span class="pay-breakdown-amount">${moneyRM(l.amount)}</span></div>`;
  }).join("") : '<div class="pay-empty">No qualifying layover found between Duty End and the next Report Time in this roster.</div>';  return total;
}




/* CrewView Timeline v138 — travel-day timeline with separate layover/off-day events. */
function timelineDateInRosterPeriod(dateText){
  const d=parseRosterDate(dateText);
  if(!d) return false;
  if(!officialRosterPeriod) return true;

  // Timeline is a continuity view, not a monthly totals view.
  // iFlight rosters can include the first duty/duties of the following month
  // so an outstation pairing can be completed. Keep those parsed carry-over
  // rows visible for up to 7 days after the official roster month.
  // This does NOT change official FH/DH validation or monthly allowance totals.
  const timelineEnd=new Date(officialRosterPeriod.end.getTime());
  timelineEnd.setDate(timelineEnd.getDate()+7);

  return d>=officialRosterPeriod.start && d<=timelineEnd;
}

function timelineClockLabel(value){
  const text=String(value||"").trim();
  const split=parseStationClock(text);
  return {
    station:split?.station||"",
    time:split?.time||text||"—",
    nextDay:Boolean(split?.nextDay)
  };
}

function timelineClockDisplay(value){
  const clock=timelineClockLabel(value);
  return `${clock.time}${clock.nextDay?" (+1)":""}`;
}

function timelineFlightRoute(group){
  const flights=group?.flights||[];
  const route=[];
  flights.forEach((row,index)=>{
    const dep=timelineClockLabel(row?.dep||row?._departure||"").station || String(row?._depStation||"").trim();
    const arr=timelineClockLabel(row?.arr||row?._arrival||"").station || String(row?._arrStation||"").trim();
    if(index===0 && dep) route.push(dep);
    if(arr && route[route.length-1]!==arr) route.push(arr);
  });
  if(route.length<2){
    const first=flights[0]||{};
    const last=flights[flights.length-1]||first;
    const dep=timelineClockLabel(first?.dep||first?._departure||"").station || String(group?.departure||"").trim();
    const arr=timelineClockLabel(last?.arr||last?._arrival||"").station || String(group?.destination||"").trim();
    if(dep && !route.length) route.push(dep);
    if(arr && route[route.length-1]!==arr) route.push(arr);
  }
  return route.length ? route.join(" → ") : "—";
}

function timelineDutyEnd(group){
  const members=[...(group?.members||[])].reverse();
  const row=members.find(r=>String(r?._finalDutyEnd||r?.dutyEnd||"").trim());
  return String(row?._finalDutyEnd||row?.dutyEnd||"").trim() || "—";
}

function timelineFinalArrival(group){
  const members=[...(group?.members||[])].reverse();
  const row=members.find(r=>String(r?._arrival||r?.arr||"").trim());
  return String(row?._arrival||row?.arr||"").trim() || "—";
}

function timelineAircraft(group){
  const values=[...new Set((group?.flights||[]).map(r=>String(r?.ac||"").trim()).filter(Boolean))];
  return values.join(" / ") || "—";
}

function timelineDerivedSectorMinutes(row){
  if(!row) return 0;

  // Prefer published/actual block time whenever the roster supplies it.
  const published=toMinutes(row.block);
  if(published>0) return published;

  // SFP/PS sectors may legitimately carry 0:00 Flying Hrs. Timeline can
  // display elapsed sector time without changing official monthly FH.
  let elapsed=null;

  if(rosterTimeBasis==="SLT"){
    elapsed=localClockElapsedMinutes(row);
    if(!Number.isFinite(elapsed)) elapsed=fixedClockElapsedMinutes(row.dep,row.arr);
  }else{
    elapsed=fixedClockElapsedMinutes(row.dep,row.arr);
    if(!Number.isFinite(elapsed)) elapsed=localClockElapsedMinutes(row);
  }

  return Number.isFinite(elapsed) && elapsed>0 && elapsed<=24*60
    ? Math.round(elapsed)
    : 0;
}

function timelineFlightMinutes(group){
  // The roster field parsed as row.block is the source PDF's "Flying Hrs".
  // Keep this separate from operational Block Time (Pushback -> On Chocks).
  return (group?.flights||[]).reduce(
    (sum,row)=>sum+timelineDerivedSectorMinutes(row),
    0
  );
}

function timelineDurationHuman(minutes){
  const total=Math.max(0,Math.round(Number(minutes)||0));
  const hours=Math.floor(total/60), mins=total%60;
  if(!hours) return `${mins}m`;
  if(!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function timelineDateParts(dateText){
  const d=parseRosterDate(dateText);
  if(!d) return {day:"—",weekday:"",month:""};
  return {
    day:String(d.getDate()).padStart(2,"0"),
    weekday:d.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase(),
    month:d.toLocaleDateString("en-US",{month:"short"}).toUpperCase()
  };
}

function timelineDateFromTimestamp(timestamp,airport){
  if(!Number.isFinite(timestamp)) return "";
  return ymdFromZoneParts(timePartsInZone(timestamp,airportTimezone(airport)));
}

function timelineMealGroups(layover){
  const groups=new Map();
  (layover?.meals||[]).forEach(meal=>{
    const key=String(meal.label||meal.key||"Meal");
    if(!groups.has(key)) groups.set(key,{label:key,count:0,amount:0});
    const item=groups.get(key);
    item.count+=1;
    item.amount+=Number(meal.amount||0);
  });
  return [...groups.values()];
}

function timelineOffDayRows(){
  return getRows().filter(row=>{
    if(!timelineDateInRosterPeriod(row?.date)) return false;
    if(row?._overnightContinuation || row?._syntheticCalendarRow) return false;
    return calendarCategory(row)==="off";
  });
}

function timelineGroundEventRows(){
  return getRows().filter(row=>{
    if(!timelineDateInRosterPeriod(row?.date)) return false;
    if(row?._overnightContinuation || row?._syntheticCalendarRow) return false;
    const item=String(row?.item||"").trim().toUpperCase();
    if(!item || /^MH\d+/.test(item)) return false;
    const category=calendarCategory(row);
    if(["off","continuation"].includes(category)) return false;
    return Boolean(String(row?.dutyStart||"").trim());
  });
}

function timelineEvents(){
  const layovers=calculateLayoverAllowances();
  const events=[];

  flightDutyGroupsForLayover().forEach(group=>{
    const row=group.anchor;
    if(!timelineDateInRosterPeriod(row?.date)) return;
    const items=[...new Set((group.flights||[]).map(r=>String(r?.item||"").trim()).filter(Boolean))];
    const layover=layovers.find(l=>{
      const fromItems=String(l.fromItems||"").split(/\s*\/\s*/);
      return l.fromDate===String(row.date||"") && items.some(item=>fromItems.includes(item));
    }) || layoverForDuty(row);
    const dutyMinutes=toMinutes(row?.duty || (group.members||[]).find(r=>toMinutes(r?.duty)>0)?.duty);
    const firstFlight=group.flights?.[0]||row;
    const finalArrival=timelineFinalArrival(group);
    const dep=timelineClockLabel(firstFlight?.dep||"");
    const arr=timelineClockLabel(finalArrival);

    events.push({
      type:"flight",
      date:String(row.date||""),
      sort:Number(group.order||0),
      item:items.join(" / ")||String(row.item||""),
      route:timelineFlightRoute(group),
      report:String(row.dutyStart||"—"),
      reportStation:dep.station||group.departure||"",
      departure:String(firstFlight?.dep||"—"),
      arrival:finalArrival,
      dutyEnd:timelineDutyEnd(group),
      dutyEndStation:arr.station||group.destination||"",
      work:[...new Set((group.flights||[]).map(r=>String(r?.work||"").trim()).filter(Boolean))].join(" / ")||"FLIGHT",
      aircraft:timelineAircraft(group),
      flightMinutes:timelineFlightMinutes(group),
      dutyMinutes,
      productivity:productivityAllowanceForDuty(row),
      layover
    });

    if(layover){
      events.push({
        type:"layover",
        date:timelineDateFromTimestamp(layover.start,layover.airport)||String(row.date||""),
        sort:Number(layover.start||group.order||0)+1,
        layover
      });
    }
  });

  timelineGroundEventRows().forEach((row,index)=>{
    const date=parseRosterDate(row.date);
    const tm=String(row.dutyStart||"").match(/(\d{1,2}):(\d{2})/);
    const sort=(date?.getTime()||0)+(tm?(Number(tm[1])*60+Number(tm[2]))*60000:index);
    events.push({
      type:"ground",
      date:String(row.date||""),
      sort,
      item:String(row.item||"Duty"),
      category:calendarCategory(row),
      report:String(row.dutyStart||"—"),
      departure:String(row.dep||"—"),
      arrival:String(row.arr||"—"),
      dutyEnd:String(row.dutyEnd||"—"),
      dutyMinutes:toMinutes(row.duty),
      work:String(row.work||"")
    });
  });

  timelineOffDayRows().forEach((row,index)=>{
    const date=parseRosterDate(row.date);
    events.push({
      type:"off",
      date:String(row.date||""),
      sort:(date?.getTime()||0)+12*60*60000+index,
      item:String(row.item||"D")
    });
  });

  return events.sort((a,b)=>a.sort-b.sort);
}

function timelineDateRail(dateText,isToday=false){
  const p=timelineDateParts(dateText);
  return `<div class="cv-tl-date">${isToday?'<b>TODAY</b>':''}<strong>${esc(p.day)}</strong><span>${esc(p.weekday)}</span><small>${esc(p.month)}</small></div>`;
}

function timelineIsToday(dateText){
  const d=parseRosterDate(dateText);
  const now=new Date();
  return Boolean(d && d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate());
}

function timelineStationInstant(dateText,clockValue,airport){
  const clock=timelineClockLabel(clockValue);
  const code=String(airport||clock.station||"").trim().toUpperCase();
  const zone=knownAirportTimezone(code);
  if(!zone || !clock.time || clock.time==="—") return null;
  const localDate=addRosterDays(dateText,clock.nextDay?1:0);
  return zonedWallTimeToUtcMs(localDate,clock.time,zone);
}

function timelineTimezoneInfoForFlight(event,destination){
  const airport=String(destination||"").trim().toUpperCase();
  if(!airport) return null;

  let instant=timelineStationInstant(event.date,event.arrival,airport);
  if(!Number.isFinite(instant)){
    instant=timelineStationInstant(event.date,event.dutyEnd,airport);
  }
  if(!Number.isFinite(instant)){
    const date=parseRosterDate(event.date);
    instant=date instanceof Date ? date.getTime()+12*3600000 : Date.now();
  }

  return airportTimezoneDisplay(airport,instant);
}

function timelineTimezoneLine(info,{includeAirport=true}={}){
  if(!info) return "";
  const parts=[];
  if(includeAirport) parts.push(info.airport);
  if(info.offsetLabel) parts.push(info.offsetLabel);

  if(info.airport===info.homeAirport){
    parts.push("home base");
  }else if(info.differenceLabel){
    parts.push(info.differenceLabel);
  }
  return parts.join(" · ");
}

function timelineElapsedFlightMinutes(event,origin,destination){
  const depMs=timelineStationInstant(event.date,event.departure,origin);
  const arrMs=timelineStationInstant(event.date,event.arrival,destination);

  if(Number.isFinite(depMs) && Number.isFinite(arrMs)){
    let minutes=Math.round((arrMs-depMs)/60000);

    // If a source omits (+1) but the destination-local arrival is clearly on
    // the following day, allow one rollover. Reject anything implausible.
    if(minutes<=0) minutes+=24*60;

    if(minutes>0 && minutes<=24*60) return minutes;
  }

  // Fall back to the roster Flying Hrs value only when a reliable
  // timezone-aware elapsed duration cannot be formed.
  return Number(event.flightMinutes||0);
}

function timelineFlightCard(event){
  const dep=timelineClockLabel(event.departure);
  const arr=timelineClockLabel(event.arrival);
  const routeParts=String(event.route||"").split(" → ").filter(Boolean);
  const origin=routeParts[0]||event.reportStation||dep.station||"—";
  const destination=routeParts[routeParts.length-1]||event.dutyEndStation||arr.station||"—";
  const aircraft=event.aircraft&&event.aircraft!=="—"?event.aircraft:"A/C";
  const layoverAmount=Number(event.layover?.amount||0);
  const timezoneInfo=timelineTimezoneInfoForFlight(event,destination);
  const timezoneLine=timelineTimezoneLine(timezoneInfo);
  const elapsedMinutes=timelineElapsedFlightMinutes(event,origin,destination);
  return `<article class="cv-tl-card cv-tl-flight-card">
    <div class="cv-tl-flight-head">
      <span class="cv-tl-icon cv-tl-icon-flight">✈</span>
      <div class="cv-tl-flight-title"><strong>${esc(event.item)}</strong><span>${esc(event.route)}</span>${timezoneLine?`<small class="cv-tl-timezone">◉ ${esc(timezoneLine)}</small>`:""}</div>
      <span class="cv-tl-aircraft">${esc(aircraft)}</span>
    </div>
    <div class="cv-tl-stages">
      <div class="cv-tl-stage cv-tl-stage-report"><time>${esc(event.report)}</time><i></i><div><strong>Report</strong><small>${esc(event.reportStation||origin)}</small></div></div>
      <div class="cv-tl-stage cv-tl-stage-dep"><time>${esc(timelineClockDisplay(event.departure))}</time><i></i><div><strong>Departure</strong><small>${esc(dep.station||origin)}</small></div></div>
      <div class="cv-tl-flight-strip"><span>${esc(origin)}</span><b>✈</b><em>${elapsedMinutes?`${timelineDurationHuman(elapsedMinutes)} elapsed`:"En Route"}</em><span>${esc(destination)}</span></div>
      <div class="cv-tl-stage cv-tl-stage-arr"><time>${esc(timelineClockDisplay(event.arrival))}</time><i></i><div><strong>Arrival</strong><small>${esc(arr.station||destination)}</small></div></div>
      <div class="cv-tl-stage cv-tl-stage-end"><time>${esc(timelineClockDisplay(event.dutyEnd))}</time><i></i><div><strong>Duty End</strong><small>${esc(event.dutyEndStation||destination)}</small></div></div>
    </div>
    <div class="cv-tl-flight-footer">
      <div><small>FLIGHT TIME</small><strong>${event.flightMinutes?hhmm(event.flightMinutes):"—"}</strong></div>
      <div><small>DUTY TIME</small><strong>${event.dutyMinutes?hhmm(event.dutyMinutes):"—"}</strong></div>
      <div class="cv-tl-flight-money"><small>ALLOWANCES</small><span>${event.productivity?`Prod <strong>${moneyRM(event.productivity)}</strong>`:""}${layoverAmount?`<em>Layover <strong>${moneyRM(layoverAmount)}</strong></em>`:""}</span></div>
    </div>
  </article>`;
}

function timelineLayoverCard(event){
  const l=event.layover;
  const hotel=String(l?.hotel||"").trim()||"Hotel not listed";
  const nextLocal=formatLayoverLocal(l.end,l.airport);
  const groups=timelineMealGroups(l);
  const mealHtml=groups.length?groups.map(group=>{
    const icon=group.label.toLowerCase().includes("breakfast")?"☕":group.label.toLowerCase().includes("lunch")?"🍴":"◒";
    const count=group.count>1?` ×${group.count}`:"";
    return `<div><span>${icon}</span><small>${esc(group.label)}${count}</small><strong>${moneyRM(group.amount)}</strong></div>`;
  }).join(""):'<div class="cv-tl-no-meal"><small>No qualifying meal window</small></div>';
  const active=Date.now()>=l.start && Date.now()<l.end;
  const remain=active?timelineDurationHuman(Math.max(0,Math.round((l.end-Date.now())/60000))):"";
  const timezoneInfo=airportTimezoneDisplay(l.airport,Number(l.start));
  const timezoneLine=timelineTimezoneLine(timezoneInfo,{includeAirport:false});
  const layoverSubtitle=[String(l.region||"").trim(),timezoneLine].filter(Boolean).join(" · ");
  return `<article class="cv-tl-card cv-tl-layover-card">
    <div class="cv-tl-layover-head">
      <span class="cv-tl-icon cv-tl-icon-layover">☾</span>
      <div><strong>${esc(l.airport)} Layover</strong><span>${esc(layoverSubtitle)}</span></div>
      <b>${timelineDurationHuman(l.durationMinutes)}</b>
    </div>
    <div class="cv-tl-layover-core">
      <div><small>HOTEL</small><strong>🏨 ${esc(hotel)}</strong></div>
      <div><small>${active?"NEXT REPORT IN":"NEXT REPORT · LOCAL"}</small><strong>${active?esc(remain):esc(nextLocal)}</strong>${active?`<span>${esc(nextLocal)}</span>`:""}</div>
    </div>
    <div class="cv-tl-layover-allowance"><small>LAYOVER ALLOWANCE</small><strong>${moneyRM(l.amount)}</strong></div>
    <div class="cv-tl-meals">${mealHtml}</div>
  </article>`;
}

function timelineGroundCard(event){
  const dep=timelineClockLabel(event.departure), arr=timelineClockLabel(event.arrival);
  const label=event.category==="standby"?"Standby":event.category==="training"?"Training / Ground Duty":"Ground Duty";
  return `<article class="cv-tl-card cv-tl-ground-card">
    <div class="cv-tl-ground-head"><span class="cv-tl-icon cv-tl-icon-ground">▣</span><div><strong>${esc(event.item)}</strong><span>${esc(label)}</span></div></div>
    <div class="cv-tl-ground-times"><span><small>START</small><strong>${esc(event.report)}</strong></span><span><small>END</small><strong>${esc(event.dutyEnd||arr.time||"—")}</strong></span><span><small>DUTY</small><strong>${event.dutyMinutes?hhmm(event.dutyMinutes):"—"}</strong></span></div>
  </article>`;
}

function timelineOffCard(){
  return `<article class="cv-tl-card cv-tl-off-card"><span class="cv-tl-icon cv-tl-icon-off">☀</span><div><strong>OFF DAY</strong><span>No duties scheduled</span></div></article>`;
}

function renderTimelineView(){
  const list=$("#timelineList");
  if(!list) return;
  const events=timelineEvents();
  const month=loadedRosterMonth();
  const monthLabel=month?month.toLocaleDateString("en-US",{month:"long",year:"numeric"}).toUpperCase():"LOADED ROSTER";
  $("#timelineMonthLabel").textContent=monthLabel;
  if(!events.length){
    list.innerHTML='<div class="timeline-empty">No roster events found.</div>';
    return;
  }

  const now=Date.now();
  let nextMarked=false;
  list.innerHTML=events.map(event=>{
    const isNext=!nextMarked && Number(event.sort||0)>=now;
    if(isNext) nextMarked=true;
    const today=timelineIsToday(event.date);
    const card=event.type==="flight"?timelineFlightCard(event):event.type==="layover"?timelineLayoverCard(event):event.type==="off"?timelineOffCard():timelineGroundCard(event);
    return `<div class="cv-tl-item cv-tl-${event.type} ${isNext?"is-next":""}" data-timeline-date="${esc(event.date)}">
      ${timelineDateRail(event.date,today)}
      <div class="cv-tl-spine"><span></span></div>
      ${card}
    </div>`;
  }).join("");
}

function scrollTimelineToToday(){
  const now=new Date();
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const key=`${String(now.getDate()).padStart(2,"0")}-${months[now.getMonth()]}-${now.getFullYear()}`;
  const exact=document.querySelector(`[data-timeline-date="${key}"]`);
  const target=exact||document.querySelector(".cv-tl-item.is-next")||document.querySelector(".cv-tl-item");
  target?.scrollIntoView({behavior:"smooth",block:"center"});
}

$("#timelineToday")?.addEventListener("click",scrollTimelineToToday);

/* Calendar View: visual layer only. The Malaysia Airlines PDF parser is unchanged. */
let crewViewMode="classic";
const crewViewScrollPositions={
  classic:0,
  calendar:0,
  timeline:0,
  pay:0
};
let crewViewTransitionTimer=null;
let calendarCursor=null;
let selectedCalendarDuty=null;
const calendarFiltersEnabled=new Set([
  "flight","positioning","continuation","off","standby","leave","training","simulator","admin"
]);

const calendarViewOptions={
  outsideDays:true,
  highlightToday:true,
  animations:true,
  density:"comfortable"
};


const monthFormatter=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
const shortMonthFormatter=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});

function calendarCategory(row){
  if(row?._overnightContinuation) return "continuation";

  const item=String(row?.item||"").trim().toUpperCase();
  const work=String(row?.work||"").trim().toUpperCase();

  if(item==="D"||item==="OFF"||item.startsWith("DO")) return "off";
  if(["AL","CL","EL","MC","ML","PL","UL"].includes(item)||item.includes("LEAVE")) return "leave";
  if(
    item.includes("SBY")||item.includes("STBY")||item.includes("STANDBY")||
    ["RSV","ASB","HSB"].includes(item)||
    /^S[1-4](?:-|$)/.test(item)
  ) return "standby";
  if(item.includes("SIM")) return "simulator";
  if(
    item==="DSA"||
    item.includes("TRAIN")||
    item.includes("LPC")||
    item.includes("OPC")||
    item.includes("CRM")||
    item.includes("GROUND")
  ) return "training";
  if(work==="PS") return "positioning";
  if(work==="OP"||work==="SFP"||/^MH\d+/i.test(item)) return "flight";
  return "admin";
}

function calendarDateKey(row){
  const d=parseRosterDate(row?.date||"");
  if(!d) return "";
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

function calendarDateKeyFromDate(d){
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

function completeCalendarDuty(rows,index){
  const row=rows[index];
  if(!row) return null;
  const category=calendarCategory(row);

  if(category==="flight"){
    const complete=buildCompleteDuty(rows,index);
    return {
      ...complete,
      _dt:dutyDateTime(row),
      _calendarCategory:category,
      _sourceIndex:index
    };
  }

  return {
    ...row,
    _calendarCategory:category,
    _sourceIndex:index,
    _dt:dutyDateTime(row)
  };
}

function calendarEntries(){
  const rows=getRows();
  const byDate=new Map();

  rows.forEach((row,index)=>{
    const key=calendarDateKey(row);
    if(!key) return;

    const complete=completeCalendarDuty(rows,index);
    if(!complete) return;

    const hasVisibleContent=Boolean(
      complete._overnightContinuation ||
      String(complete.item||"").trim() ||
      String(complete.arr||complete._arrival||"").trim() ||
      String(complete.dutyStart||"").trim() ||
      String(complete.dutyEnd||complete._finalDutyEnd||"").trim() ||
      String(complete.work||"").trim()
    );

    if(!hasVisibleContent) return;

    if(!byDate.has(key)) byDate.set(key,[]);
    byDate.get(key).push(complete);
  });

  return byDate;
}


function calendarTileMeta(row){
  if(!row){
    return {
      title:"",
      route:"",
      report:"",
      departure:"",
      footerLeft:"",
      footerRight:"",
      icon:""
    };
  }

  const category=row._calendarCategory||calendarCategory(row);
  const item=calendarDisplayItem(row);

  if(category==="continuation"){
    const arrText=String(row._arrival||row.arr||"").trim();
    const arrStation=airportCode(arrText);
    const arrTime=(arrText.match(/\b\d{2}:\d{2}(?:\(\+1\))?/)||[])[0]||"";
    const endTime=String(row._finalDutyEnd||row.dutyEnd||"").trim();

    return {
      title:"ARRIVAL",
      route:arrStation||"",
      report:arrTime ? `Arr ${arrTime}` : "",
      departure:endTime ? `End ${endTime}` : "",
      footerLeft:"",
      footerRight:"",
      icon:"↘"
    };
  }
  const work=String(row.work||"").trim().toUpperCase();
  const ac=String(row.ac||"").trim();

  // Prefer the complete pairing route generated by buildCompleteDuty().
  const routeAirports=(row._routeAirports||[])
    .map(value=>airportCode(value))
    .filter(Boolean);

  const depText=String(row.dep||"").trim();
  const arrText=String(row._arrival||row.arr||"").trim();

  const depStation=airportCode(depText);
  const arrStation=airportCode(arrText);

  const route=
    routeAirports.length>1
      ? routeAirports.join(" → ")
      : depStation&&arrStation
        ? `${depStation} → ${arrStation}`
        : depStation||arrStation||"";

  const departureMatch=depText.match(/\b\d{2}:\d{2}(?:\(\+1\))?/);
  const departureTime=departureMatch?.[0]||"";
  const reportTime=String(row.dutyStart||"").trim();

  if(category==="off"){
    return {
      title:"DAY OFF",
      route:depStation||"KUL",
      report:"",
      departure:"",
      footerLeft:"",
      footerRight:"",
      icon:"⌂"
    };
  }

  if(category==="training"){
    return {
      title:item||"TRAINING",
      route:depStation||"KUL",
      report:reportTime ? `Start ${reportTime}` : "",
      departure:"",
      footerLeft:work||"TRG",
      footerRight:"",
      icon:"✦"
    };
  }

  if(category==="standby"){
    return {
      title:item||"SBY",
      route:depStation||"KUL",
      report:reportTime ? `Start ${reportTime}` : "",
      departure:"",
      footerLeft:work||"SBY",
      footerRight:ac,
      icon:"◷"
    };
  }

  if(category==="positioning"){
    return {
      title:item||"POSITIONING",
      route,
      report:reportTime ? `Rpt ${reportTime}` : "",
      departure:departureTime ? `Dep ${departureTime}` : "",
      footerLeft:work||"PS",
      footerRight:ac ? `A${ac}` : "",
      icon:"⇄"
    };
  }

  if(category==="leave"){
    return {
      title:item||"LEAVE",
      route:depStation||"KUL",
      report:"",
      departure:"",
      footerLeft:work||"LEAVE",
      footerRight:"",
      icon:""
    };
  }

  if(category==="simulator"){
    return {
      title:item||"SIM",
      route:depStation||"KUL",
      report:reportTime ? `Start ${reportTime}` : "",
      departure:"",
      footerLeft:work||"SIM",
      footerRight:ac,
      icon:"✦"
    };
  }

  if(category==="flight"){
    return {
      title:item,
      route,
      report:reportTime ? `Rpt ${reportTime}` : "",
      departure:departureTime ? `Dep ${departureTime}` : "",
      footerLeft:work||"",
      footerRight:ac ? `A${ac}` : "",
      icon:"✈"
    };
  }

  return {
    title:item||"DUTY",
    route:depStation||"",
    report:reportTime ? `Start ${reportTime}` : "",
    departure:departureTime ? `Dep ${departureTime}` : "",
    footerLeft:work||"",
    footerRight:ac
  };
}

function calendarDisplayItem(row){
  if(!row) return "";
  if(row._calendarCategory==="off") return "D";
  return row._displayItems||row.item||row.work||"Duty";
}

function calendarRoute(row){
  if(!row) return "";

  const airports=(row._routeAirports||[]).filter(Boolean);
  if(airports.length>1) return airports.join(" → ");

  const dep=airportCode(row.dep);
  const arr=airportCode(row._arrival||row.arr);
  return dep&&arr ? `${dep} → ${arr}` : (dep||arr||"");
}

function loadedRosterMonth(){
  if(officialRosterPeriod?.start){
    return new Date(
      officialRosterPeriod.start.getFullYear(),
      officialRosterPeriod.start.getMonth(),
      1
    );
  }

  const dates=getRows().map(row=>parseRosterDate(row.date)).filter(Boolean);
  if(!dates.length) return null;

  const counts=new Map();
  dates.forEach(d=>{
    const key=`${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key,(counts.get(key)||0)+1);
  });

  const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!best) return new Date(dates[0].getFullYear(),dates[0].getMonth(),1);

  const [year,month]=best.split("-").map(Number);
  return new Date(year,month,1);
}

function syncCalendarProfile(){
  const name=($("#name")?.value||"Crew Member").trim();
  const staff=($("#staff")?.value||"").trim();
  const rank=($("#rank")?.value||"").trim();
  const fleet=($("#fleet")?.value||"").trim();
  const base=($("#base")?.value||"").trim();

  $("#calendarName").textContent=name;
  $("#calendarMeta").textContent=[
    staff,
    rank,
    fleet ? `A${fleet}` : "",
    base
  ].filter(Boolean).join("  •  ")||"—";

  $("#calendarAvatar").textContent=name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2)
    .map(part=>part[0])
    .join("")||"CV";

  const actualBlockHours=($("#fh")?.textContent||"00:00").trim();
  const actualDutyHours=($("#dh")?.textContent||"00:00").trim();
  const actualOffDays=($("#off")?.textContent||"0").trim();

  $("#calendarFH").textContent=actualBlockHours;
  $("#calendarDH").textContent=actualDutyHours;
  $("#calendarOff").textContent=actualOffDays;
}

function bestCalendarDefaultDuty(entries,year,month){
  const now=new Date();

  const all=[...entries.values()]
    .flat()
    .filter(Boolean)
    .filter(row=>parseRosterDate(row.date)?.getMonth()===month);

  // Prefer the same duty used by the current Next Duty card.
  if(activeNextDuty){
    const match=all.find(row=>
      row.date===activeNextDuty.date &&
      calendarDisplayItem(row)===calendarDisplayItem(activeNextDuty)
    );
    if(match) return match;
  }

  // Otherwise select the nearest future working duty.
  const future=all
    .filter(row=>
      row._calendarCategory!=="off" &&
      row._calendarCategory!=="leave"
    )
    .map(row=>({
      row,
      dt:row._dt||parseRosterDate(row.date)
    }))
    .filter(item=>item.dt && item.dt>=now)
    .sort((a,b)=>a.dt-b.dt);

  if(future[0]) return future[0].row;

  // Historical roster: choose the first real duty, not a blank/off day.
  return all.find(row=>
    row._calendarCategory!=="off" &&
    row._calendarCategory!=="leave"
  ) || all[0] || null;
}

function renderCalendarView(options={}){
  syncCalendarThemeButton();
  if(!options.keepOverlay){
    document.body.classList.remove("calendar-detail-open");
  }
  const grid=$("#calendarGrid");
  if(!grid) return;

  const loaded=loadedRosterMonth();
  if(!loaded){
    grid.innerHTML="";
    $("#calendarSelected")?.classList.add("hidden");
    return;
  }

  if(!calendarCursor){
    calendarCursor=new Date(loaded.getFullYear(),loaded.getMonth(),1);
  }

  syncCalendarProfile();

  const year=calendarCursor.getFullYear();
  const month=calendarCursor.getMonth();

  $("#calendarMonthTitle").textContent=monthFormatter.format(calendarCursor);
  $("#calendarPrevLabel").textContent=shortMonthFormatter.format(
    new Date(year,month-1,1)
  );
  $("#calendarNextLabel").textContent=shortMonthFormatter.format(
    new Date(year,month+1,1)
  );

  const entries=calendarEntries();
  const first=new Date(year,month,1);
  const mondayOffset=(first.getDay()+6)%7;
  const start=new Date(year,month,1-mondayOffset);
  const today=new Date();
  const cells=[];

  for(let index=0;index<42;index++){
    const d=new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate()+index
    );

    const key=calendarDateKeyFromDate(d);
    const duties=(entries.get(key)||[])
      .filter(item=>calendarFiltersEnabled.has(item._calendarCategory));

    const categoryPriority=[
      "flight",
      "positioning",
      "continuation",
      "training",
      "standby",
      "simulator",
      "leave",
      "off",
      "admin"
    ];

    const primary=
      categoryPriority
        .map(category=>duties.find(item=>item._calendarCategory===category))
        .find(Boolean)||
      duties[0]||
      null;

    const outside=d.getMonth()!==month;
    const isToday=d.toDateString()===today.toDateString();
    const isSelected=
      selectedCalendarDuty &&
      calendarDateKey(selectedCalendarDuty)===key;

    const category=primary?primary._calendarCategory:"empty";
    const tile=calendarTileMeta(primary);

    cells.push(`
      <button
        type="button"
        class="calendar-day ${category} ${outside?"outside":""} ${outside&&!calendarViewOptions.outsideDays?"outside-hidden":""} ${isToday&&calendarViewOptions.highlightToday?"today":""} ${isSelected?"selected":""}"
        data-calendar-key="${key}"
        ${primary?"":"disabled"}
        aria-label="${esc([d.getDate(),tile.title,tile.route,tile.report,tile.departure].filter(Boolean).join(" "))}"
      >
        <span class="calendar-day-number">${d.getDate()}</span>
        ${tile.icon?`<i class="calendar-plane">${esc(tile.icon)}</i>`:""}
        ${category==="flight" ? `
          <div class="calendar-flight-info">
            <div class="calendar-flight-number">${esc(tile.title||"")}</div>
            <div class="calendar-flight-route">${esc(tile.route||"")}</div>
            <div class="calendar-flight-report">${esc(tile.report||"")}</div>
            <div class="calendar-flight-departure">${esc(tile.departure||"")}</div>
          </div>
        ` : `
          <div class="calendar-duty-info ${category}">
            <div class="calendar-duty-title">${esc(tile.title||"")}</div>
            <div class="calendar-duty-route">${esc(tile.route||"")}</div>
            <div class="calendar-duty-report">${esc(tile.report||"")}</div>
            <div class="calendar-duty-departure">${esc(tile.departure||"")}</div>
          </div>
        `}
        ${(
          (calendarViewOptions.workType&&tile.footerLeft)||
          (calendarViewOptions.aircraft&&tile.footerRight)
        )?`
          <span class="calendar-day-footer">
            <b>${calendarViewOptions.workType?esc(tile.footerLeft):""}</b>
            <b>${calendarViewOptions.aircraft?esc(tile.footerRight):""}</b>
          </span>
        `:""}
        ${isToday?`<span class="calendar-today-dot" title="Today"></span>`:""}
        ${duties.length>1?`<em>+${duties.length-1}</em>`:""}
      </button>
    `);
  }

  grid.innerHTML=cells.join("");

  grid.querySelectorAll("[data-calendar-key]").forEach(button=>{
    button.addEventListener("click",()=>{
      const duties=(entries.get(button.dataset.calendarKey)||[])
        .filter(item=>calendarFiltersEnabled.has(item._calendarCategory));

      const categoryPriority=[
        "flight",
        "positioning",
        "continuation",
        "training",
        "standby",
        "simulator",
        "leave",
        "off",
        "admin"
      ];

      const duty=
        categoryPriority
          .map(category=>duties.find(item=>item._calendarCategory===category))
          .find(Boolean)||
        duties[0];

      if(!duty) return;

      selectCalendarDuty(duty,{openOverlay:true});

      grid.querySelectorAll(".selected").forEach(cell=>
        cell.classList.remove("selected")
      );
      button.classList.add("selected");
    });
  });

  const selectedMonth=parseRosterDate(selectedCalendarDuty?.date||"")?.getMonth();

  if(!options.suppressAutoSelect){
    if(!selectedCalendarDuty || selectedMonth!==month){
      const defaultDuty=bestCalendarDefaultDuty(entries,year,month);
      if(defaultDuty) selectCalendarDuty(defaultDuty,{openOverlay:false});
    }
  }else{
    selectedCalendarDuty=null;
    closeCalendarDutyOverlay();
    grid.querySelectorAll(".selected").forEach(cell=>cell.classList.remove("selected"));
  }

  // Ensure the selected cell visibly matches the information card.
  if(selectedCalendarDuty){
    const selectedKey=calendarDateKey(selectedCalendarDuty);
    grid.querySelector(`[data-calendar-key="${selectedKey}"]`)?.classList.add("selected");
  }
}

function splitStationTime(value){
  const text=String(value||"").trim();
  if(!text) return {station:"—",time:"—"};

  const parts=text.split(/\s+/);
  const station=parts[0]||"—";
  const time=parts.slice(1).join(" ")||"—";
  return {station,time};
}

function selectCalendarDuty(row,{openOverlay=true}={}){
  if(!row) return;

  selectedCalendarDuty=row;
  const panel=$("#calendarSelected");
  const backdrop=$("#calendarDetailBackdrop");

  if(openOverlay){
    panel?.classList.remove("hidden");
    backdrop?.classList.remove("hidden");

    requestAnimationFrame(()=>{
      panel?.classList.add("open");
      backdrop?.classList.add("open");
    });

    document.body.classList.add("calendar-detail-open");
  }else{
    panel?.classList.remove("open");
    backdrop?.classList.remove("open");
    panel?.classList.add("hidden");
    backdrop?.classList.add("hidden");
    document.body.classList.remove("calendar-detail-open");
  }

  const date=parseRosterDate(row.date);
  const departure=splitStationTime(row.dep);
  const arrival=splitStationTime(row._arrival||row.arr);
  const route=calendarRoute(row)||row.work||"—";
  const reportStation=departure.station;
  const dutyEndStation=arrival.station;

  $("#selectedWeekday").textContent=
    (row.day||dayName(row.date)||"—").toUpperCase();
  $("#selectedDay").textContent=date?date.getDate():"—";
  $("#selectedMonthYear").textContent=date
    ? date.toLocaleDateString("en-US",{month:"short",year:"numeric"}).toUpperCase()
    : "—";

  $("#selectedItem").textContent=calendarDisplayItem(row)||"Duty";
  $("#selectedRoute").textContent=route;
  const ac=String(row.ac||"").trim();
  $("#selectedAircraft").textContent=ac ? (/^3/.test(ac)?`Airbus A330-${ac}`:ac) : (row.work||"—");

  $("#selectedReport").textContent=row.dutyStart||"—";
  $("#selectedReportStation").textContent=reportStation;
  $("#selectedDepartureTime").textContent=departure.time;
  $("#selectedDepartureStation").textContent=departure.station;
  $("#selectedArrivalTime").textContent=arrival.time;
  $("#selectedArrivalStation").textContent=arrival.station;
  $("#selectedDutyEnd").textContent=row._finalDutyEnd||row.dutyEnd||"—";
  $("#selectedDutyEndStation").textContent=dutyEndStation;

  $("#selectedBlock").textContent=row._totalBlock||row.block||"—";
  $("#selectedDuty").textContent=row._totalDuty||row.duty||"—";
  $("#selectedWork").textContent=row.work||"—";
  const layover=layoverForDuty(row);
  $("#selectedLayoverPanel")?.classList.toggle("hidden",!layover);
  if(layover){
    $("#selectedLayoverStation").textContent=`${layover.airport} · ${layover.region}`;
    $("#selectedLayoverHotel").textContent=layover.hotel||"Hotel not listed";
    $("#selectedLayoverDuration").textContent=`${hhmm(layover.durationMinutes)} at destination`;
    $("#selectedLayoverNextReport").textContent=formatLayoverLocal(layover.end,layover.airport);
    $("#selectedLayoverMeals").textContent=layoverMealsShort(layover);
    $("#selectedLayoverAllowance").textContent=moneyRM(layover.amount);
  }
}


function closeCalendarDutyOverlay(){
  const panel=$("#calendarSelected");
  const backdrop=$("#calendarDetailBackdrop");

  panel?.classList.remove("open");
  backdrop?.classList.remove("open");
  document.body.classList.remove("calendar-detail-open");

  setTimeout(()=>{
    panel?.classList.add("hidden");
    backdrop?.classList.add("hidden");
  },220);
}

$("#calendarDetailClose")?.addEventListener("click",closeCalendarDutyOverlay);
$("#calendarDetailBackdrop")?.addEventListener("click",closeCalendarDutyOverlay);

document.addEventListener("keydown",event=>{
  if(event.key==="Escape" && document.body.classList.contains("calendar-detail-open")){
    closeCalendarDutyOverlay();
  }
});


let validationToastTimer=null;

function showValidationToast(message){
  const toast=$("#validationToast");
  const text=$("#validationToastText");

  if(!toast||!text) return;

  clearTimeout(validationToastTimer);
  text.textContent=message||"Roster validation passed.";

  toast.classList.remove("hidden","leaving");
  requestAnimationFrame(()=>toast.classList.add("show"));

  validationToastTimer=setTimeout(()=>{
    toast.classList.remove("show");
    toast.classList.add("leaving");

    setTimeout(()=>{
      toast.classList.add("hidden");
      toast.classList.remove("leaving");
    },260);
  },3000);
}

function setPrimaryRosterViewVisibility(view){
  const classic=$("#classicView");
  const calendar=$("#calendarView");
  const timeline=$("#timelineView");
  const pay=$("#payView");

  [[classic,"classic"],[calendar,"calendar"],[timeline,"timeline"],[pay,"pay"]].forEach(([element,name])=>{
    if(!element) return;
    const active=name===view;
    element.classList.toggle("hidden",!active);
    // Safari/PWA can briefly keep stale view CSS after a service-worker update.
    // An explicit display override guarantees only the selected primary view is shown.
    element.style.setProperty("display",active ? "block" : "none","important");
    element.setAttribute("aria-hidden",active ? "false" : "true");
  });

  // Smart Duty/profile/footer sit outside #classicView in the document.
  // Control them in JS as well as CSS so a stale stylesheet can never leave
  // Classic content visible over Timeline.
  const timelineActive=view==="timeline";
  [$("#nextDutyCard"),$("#compactProfile")].forEach(element=>{
    if(!element) return;
    if(timelineActive){
      element.dataset.timelineDisplay=element.style.display||"";
      element.style.setProperty("display","none","important");
    }else if(element.dataset.timelineDisplay!==undefined){
      element.style.removeProperty("display");
      delete element.dataset.timelineDisplay;
    }
  });

  const printButton=$("#printBtn");
  if(printButton){
    if(timelineActive){
      printButton.style.setProperty("display","none","important");
    }else{
      printButton.style.removeProperty("display");
    }
  }
}

function switchRosterView(view){
  if(view===crewViewMode || document.body.classList.contains("view-switching")){
    return;
  }

  closeCalendarDutyOverlay();
  closeCalendarViewSheet?.();

  const previousView=crewViewMode;
  const goingToCalendar=view==="calendar";
  const goingToTimeline=view==="timeline";
  const goingToPay=view==="pay";

  crewViewScrollPositions[previousView]=window.scrollY||0;
  clearTimeout(crewViewTransitionTimer);

  /*
   * Fast transition strategy:
   * 1. Add a very short soft cover.
   * 2. Swap views immediately on the next animation frame.
   * 3. Remove the cover straight away.
   *
   * No waiting for Calendar rendering and no native View Transition API,
   * so the app never appears stuck.
   */
  document.body.classList.add("view-switching","view-switch-cover");

  requestAnimationFrame(()=>{
    crewViewMode=view;

    if(goingToCalendar){
      if(!calendarCursor){
        calendarCursor=loadedRosterMonth();
      }
      selectedCalendarDuty=null;
      setPrimaryRosterViewVisibility("calendar");
      document.body.classList.add("calendar-mode");
      document.body.classList.remove("timeline-mode","pay-mode");
      renderCalendarView({suppressAutoSelect:false});
    }else if(goingToTimeline){
      setPrimaryRosterViewVisibility("timeline");
      document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");
      document.body.classList.add("timeline-mode");
      renderTimelineView();
    }else if(goingToPay){
      setPrimaryRosterViewVisibility("pay");
      document.body.classList.remove("calendar-mode","timeline-mode");
      document.body.classList.add("pay-mode");
      renderPayView();
    }else{
      setPrimaryRosterViewVisibility("classic");
      document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");
      applyOnePageFit();
    }

    document.querySelectorAll(".view-tab[data-view]").forEach(tab=>
      tab.classList.toggle("active",tab.dataset.view===view)
    );

    localStorage.setItem("crewview-roster-view",view);
    window.dispatchEvent(new CustomEvent("crewview:view-changed",{detail:{view}}));

    const destinationScroll=crewViewScrollPositions[view]||0;
    window.scrollTo({top:destinationScroll,left:0,behavior:"auto"});

    requestAnimationFrame(()=>{
      document.body.classList.remove("view-switch-cover");

      crewViewTransitionTimer=setTimeout(()=>{
        document.body.classList.remove("view-switching");
      },140);
    });
  });
}

document.querySelectorAll(".view-tab[data-view]").forEach(tab=>
  tab.addEventListener("click",()=>switchRosterView(tab.dataset.view))
);

document.querySelectorAll("[data-calendar-mode='classic']").forEach(button=>
  button.addEventListener("click",()=>switchRosterView("classic"))
);

document.querySelectorAll("[data-calendar-mode='timeline']").forEach(button=>
  button.addEventListener("click",()=>{
    clearTimeout(crewViewTransitionTimer);
    document.body.classList.remove("view-switching","view-switch-cover");
    switchRosterView("timeline");
  })
);

document.querySelectorAll("[data-calendar-mode='pay']").forEach(button=>
  button.addEventListener("click",()=>{
    // Calendar can retain the short transition lock on iOS Safari/PWA.
    // Clear it explicitly so Allowances is always immediately tappable.
    clearTimeout(crewViewTransitionTimer);
    document.body.classList.remove("view-switching","view-switch-cover");
    switchRosterView("pay");
  })
);

$("#calendarPrev")?.addEventListener("click",()=>{
  if(!calendarCursor) return;
  calendarCursor=new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth()-1,
    1
  );
  selectedCalendarDuty=null;
  renderCalendarView();
});

$("#calendarNext")?.addEventListener("click",()=>{
  if(!calendarCursor) return;
  calendarCursor=new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth()+1,
    1
  );
  selectedCalendarDuty=null;
  renderCalendarView();
});

$("#calendarToday")?.addEventListener("click",()=>{
  closeCalendarDutyOverlay();

  const today=new Date();
  calendarCursor=new Date(today.getFullYear(),today.getMonth(),1);
  selectedCalendarDuty=null;

  renderCalendarView({suppressAutoSelect:true});

  requestAnimationFrame(()=>{
    const todayCell=document.querySelector(".calendar-day.today");

    if(todayCell){
      todayCell.classList.add("today-flash");
      setTimeout(()=>todayCell.classList.remove("today-flash"),1100);
    }else{
      const title=$("#calendarMonthTitle");
      title?.classList.add("today-month-flash");
      setTimeout(()=>title?.classList.remove("today-month-flash"),1100);
    }
  });
});

function syncCalendarThemeButton(){
  const isLight=document.documentElement.dataset.theme==="light";
  $("#calendarThemeIcon").textContent=isLight?"🌙":"☀";
  $("#calendarThemeText").textContent=isLight?"Dark":"Light";
  $("#calendarThemeButton")?.setAttribute(
    "aria-label",
    isLight?"Switch to dark mode":"Switch to light mode"
  );
}

$("#calendarThemeButton")?.addEventListener("click",()=>{
  themeToggle?.click();
  requestAnimationFrame(syncCalendarThemeButton);
});

function openCalendarViewSheet(){
  const sheet=$("#calendarViewSheet");
  const backdrop=$("#calendarViewBackdrop");

  sheet?.classList.remove("hidden");
  backdrop?.classList.remove("hidden");

  requestAnimationFrame(()=>{
    sheet?.classList.add("open");
    backdrop?.classList.add("open");
  });

  document.body.classList.add("calendar-view-open");
}

function closeCalendarViewSheet(){
  const sheet=$("#calendarViewSheet");
  const backdrop=$("#calendarViewBackdrop");

  sheet?.classList.remove("open");
  backdrop?.classList.remove("open");
  document.body.classList.remove("calendar-view-open");

  setTimeout(()=>{
    sheet?.classList.add("hidden");
    backdrop?.classList.add("hidden");
  },220);
}

function applyCalendarViewOptions(){
  calendarViewOptions.outsideDays=$("#optOutsideDays")?.checked??true;
  calendarViewOptions.highlightToday=$("#optHighlightToday")?.checked??true;
  calendarViewOptions.animations=$("#optAnimations")?.checked??true;

  document.body.classList.toggle(
    "calendar-compact",
    calendarViewOptions.density==="compact"
  );
  document.body.classList.toggle(
    "calendar-large-text",
    calendarViewOptions.density==="large"
  );
  document.body.classList.toggle(
    "calendar-no-animations",
    !calendarViewOptions.animations
  );
  document.body.classList.toggle(
    "calendar-no-today-highlight",
    !calendarViewOptions.highlightToday
  );

  localStorage.setItem(
    "crewview-calendar-options",
    JSON.stringify(calendarViewOptions)
  );

  renderCalendarView();
}

$("#calendarFilters")?.addEventListener("click",openCalendarViewSheet);
$("#calendarViewClose")?.addEventListener("click",closeCalendarViewSheet);
$("#calendarViewDone")?.addEventListener("click",()=>{
  applyCalendarViewOptions();
  closeCalendarViewSheet();
});
$("#calendarViewBackdrop")?.addEventListener("click",closeCalendarViewSheet);

document.querySelectorAll("[data-calendar-density]").forEach(button=>{
  button.addEventListener("click",()=>{
    document.querySelectorAll("[data-calendar-density]").forEach(item=>
      item.classList.toggle("active",item===button)
    );
    calendarViewOptions.density=button.dataset.calendarDensity;
  });
});

const calendarLayoutVersion="v1.4";
if(localStorage.getItem("crewview-calendar-layout-version")!==calendarLayoutVersion){
  localStorage.removeItem("crewview-calendar-options");
  localStorage.setItem("crewview-calendar-layout-version",calendarLayoutVersion);
}

try{
  const saved=JSON.parse(
    localStorage.getItem("crewview-calendar-options")||"null"
  );
  if(saved&&typeof saved==="object"){
    Object.assign(calendarViewOptions,saved);
  }
}catch{}

calendarViewOptions.report=true;
calendarViewOptions.departure=true;
calendarViewOptions.density="comfortable";

$("#optOutsideDays")&&( $("#optOutsideDays").checked=calendarViewOptions.outsideDays );
$("#optHighlightToday")&&( $("#optHighlightToday").checked=calendarViewOptions.highlightToday );
$("#optAnimations")&&( $("#optAnimations").checked=calendarViewOptions.animations );

document.querySelectorAll("[data-calendar-density]").forEach(button=>
  button.classList.toggle(
    "active",
    button.dataset.calendarDensity===calendarViewOptions.density
  )
);

document.body.classList.toggle(
  "calendar-compact",
  calendarViewOptions.density==="compact"
);
document.body.classList.toggle(
  "calendar-large-text",
  calendarViewOptions.density==="large"
);
document.body.classList.toggle(
  "calendar-no-animations",
  !calendarViewOptions.animations
);
document.body.classList.toggle(
  "calendar-no-today-highlight",
  !calendarViewOptions.highlightToday
);

document.querySelectorAll(".calendar-legend [data-filter]").forEach(button=>{
  button.addEventListener("click",()=>{
    const category=button.dataset.filter;
    const linkedCategories=category==="flight"?["flight","continuation"]:[category];
    if(linkedCategories.every(value=>calendarFiltersEnabled.has(value))){
      linkedCategories.forEach(value=>calendarFiltersEnabled.delete(value));
      button.classList.add("disabled");
    }else{
      linkedCategories.forEach(value=>calendarFiltersEnabled.add(value));
      button.classList.remove("disabled");
    }
    selectedCalendarDuty=null;
    renderCalendarView();
  });
});

$("#selectedDetailsBtn")?.addEventListener("click",()=>{
  if(!selectedCalendarDuty) return;
  activeNextDuty=selectedCalendarDuty;
  openDutyDetails();
});

$("#pdfInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{await parsePDF(file)}catch(err){console.error(err);status.textContent="Could not read this PDF automatically. Load the sample or add rows manually. "+err.message}
});
$("#loadAnotherBtn")?.addEventListener("click",()=>$("#pdfInput")?.click());
$("#replaceRosterBtn")?.addEventListener("click",()=>$("#pdfInput")?.click());
$("#headerClearBtn")?.addEventListener("click",()=>$("#clearBtn")?.click());
$("#clearBtn")?.addEventListener("click",event=>{
  event.preventDefault();

  officialFH=null;
  officialDH=null;
  officialRosterPeriod=null;
  clearRosterSnapshot();

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
  window.dispatchEvent(new CustomEvent("crewview:roster-state",{detail:{loaded:false}}));
  $("#uploadCard")?.removeAttribute("aria-hidden");
  $("#loadedRosterActions")?.setAttribute("aria-hidden","true");
  $("#viewSwitcher")?.classList.add("hidden");
  switchRosterView("classic");
  calendarCursor=null;
  selectedCalendarDuty=null;

  const fileInput=$("#pdfInput");
  if(fileInput) fileInput.value="";

  status.textContent="No roster loaded.";

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
function restoreCachedRoster(){
  if(document.body.classList.contains("roster-loaded")) return false;
  const cached=loadRosterSnapshot();
  if(!cached) return false;

  officialFH=cached.officialFH||null;
  officialDH=cached.officialDH||null;
  officialRosterPeriod=deserializeRosterPeriod(cached.officialRosterPeriod);
  rosterTimeBasis=["LT","SLT","UTC"].includes(cached.rosterTimeBasis) ? cached.rosterTimeBasis : "LT";
  Object.entries(cached.profile||{}).forEach(([id,value])=>{
    const input=$("#"+id);
    if(input) input.value=value||"";
  });

  setRows(cached.rows);
  updateRosterSourceNote();
  document.body.classList.add("roster-loaded");
  window.dispatchEvent(new CustomEvent("crewview:roster-state",{detail:{loaded:true}}));
  $("#uploadCard")?.setAttribute("aria-hidden","true");
  $("#loadedRosterActions")?.setAttribute("aria-hidden","false");
  $("#viewSwitcher")?.classList.remove("hidden");
  setPrimaryRosterViewVisibility("classic");
  document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");
  crewViewMode="classic";
  document.querySelectorAll(".view-tab[data-view]").forEach(tab=>tab.classList.toggle("active",tab.dataset.view==="classic"));
  updateCompactProfile();
  status.textContent="Restored your last roster from this device.";
  requestAnimationFrame(()=>{ resetInitialViewport(); applyOperationalOverlayToClassic(); });
  return true;
}

// iOS may terminate a suspended Safari/PWA process. Restore the parsed roster
// from local storage whenever a fresh page process starts.
requestAnimationFrame(()=>restoreCachedRoster());


function cvPdfText(value,fallback="—"){
  const text=String(value??"").trim();
  return text || fallback;
}

function cvPdfMonthLabel(){
  const month=loadedRosterMonth();
  if(month) return month.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  const first=getRows().map(r=>parseRosterDate(r.date)).find(Boolean);
  return first ? first.toLocaleDateString("en-GB",{month:"long",year:"numeric"}) : "Roster";
}

function cvPdfGeneratedLabel(){
  const now=new Date();
  return `Generated: ${now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} ${now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false})}`;
}

function cvPdfOfficialRows(){
  const rows=getRows();
  if(!officialRosterPeriod) return rows;
  return rows.filter(row=>{
    const d=parseRosterDate(row.date);
    return d && d>=officialRosterPeriod.start && d<=officialRosterPeriod.end;
  });
}

function cvPdfOffDayCount(rows){
  const dates=new Set();
  rows.forEach(row=>{
    const item=String(row?.item||"").trim().toUpperCase();
    if((item==="D" || item==="OFF") && row.date) dates.add(row.date);
  });
  return dates.size;
}

function buildCrewViewPdfDocument(){
  const doc=$("#cvPdfDocument");
  const rosterBody=$("#cvPdfRosterRows");
  const productivityBody=$("#cvPdfProductivityRows");
  const layoverBody=$("#cvPdfLayoverRows");
  if(!doc||!rosterBody||!productivityBody||!layoverBody) return;

  const rows=cvPdfOfficialRows();

  const name=($("#name")?.value||"").trim()||"Crew Member";
  const staff=($("#staff")?.value||"").trim();
  const rank=($("#rank")?.value||"").trim();
  const fleet=($("#fleet")?.value||"").trim();
  const base=($("#base")?.value||"").trim();
  const meta=[staff,rank,fleet,base].filter(Boolean).join(" · ")||"—";

  const month=cvPdfMonthLabel();
  const generated=cvPdfGeneratedLabel();

  $("#cvPdfRosterMonth").textContent=month;
  $("#cvPdfAllowanceMonth").textContent=month;
  $("#cvPdfRosterGenerated").textContent=generated;
  $("#cvPdfAllowanceGenerated").textContent=generated;
  $("#cvPdfRosterName").textContent=name.toUpperCase();
  $("#cvPdfAllowanceName").textContent=name.toUpperCase();
  $("#cvPdfRosterMeta").textContent=meta;
  $("#cvPdfAllowanceMeta").textContent=meta;

  const flightMinutes=rows.reduce((sum,row)=>sum+toMinutes(row.block),0);
  const dutyMinutes=rows.reduce((sum,row)=>sum+toMinutes(row.duty),0);

  $("#cvPdfFlightTotal").textContent=hhmm(flightMinutes);
  $("#cvPdfDutyTotal").textContent=hhmm(dutyMinutes);
  $("#cvPdfOffDays").textContent=String(cvPdfOffDayCount(rows));

  // PAGE 1: exact Classic View roster fields. No allowance data.
  rosterBody.innerHTML=rows.map(row=>`
    <tr>
      <td>${esc(cvPdfText(row.date))}</td>
      <td>${esc(cvPdfText(row.day))}</td>
      <td>${esc(cvPdfText(row.dutyStart))}</td>
      <td>${esc(cvPdfText(row.item))}</td>
      <td>${esc(cvPdfText(row.dep))}</td>
      <td>${esc(cvPdfText(row.arr))}</td>
      <td>${esc(cvPdfText(row.dutyEnd))}</td>
      <td>${esc(cvPdfText(row.work))}</td>
      <td>${esc(cvPdfText(row.block))}</td>
      <td>${esc(cvPdfText(row.duty))}</td>
      <td>${esc(cvPdfText(row.ac))}</td>
    </tr>
  `).join("");

  // PAGE 2: allowance calculations only.
  const gradeEl=$("#payGrade");
  if(gradeEl && !gradeEl.dataset.userSelected) gradeEl.value=inferredPayGrade();

  const grade=(gradeEl?.dataset?.userSelected && gradeEl.value)
    ? gradeEl.value
    : inferredPayGrade();
  const rule=PAY_RULES[grade]||PAY_RULES["C1-P"];

  const duties=payDutyGroups();
  const eligibleMinutes=duties.reduce((sum,d)=>sum+d.minutes,0);
  const blockMinutes=payMonthlyBlockMinutes();
  const excessMinutes=Math.max(0,blockMinutes-80*60);

  const productivityAmount=eligibleMinutes/60*rule.pa;
  const over80Amount=excessMinutes/60*rule.over80;

  const layovers=calculateLayoverAllowances();
  const layoverAmount=layovers.reduce((sum,l)=>sum+Number(l.amount||0),0);
  const estimatedTotal=productivityAmount+over80Amount+layoverAmount;

  $("#cvPdfEstimatedAllowance").textContent=moneyRM(estimatedTotal);
  $("#cvPdfProductivityAllowance").textContent=moneyRM(productivityAmount);
  $("#cvPdfLayoverAllowance").textContent=moneyRM(layoverAmount);
  $("#cvPdfGrade").textContent=`${grade} · ${rule.label}`;
  $("#cvPdfEligibleDuty").textContent=hhmm(eligibleMinutes);
  $("#cvPdfMonthlyBlock").textContent=hhmm(blockMinutes);
  $("#cvPdfOver80").textContent=moneyRM(over80Amount);

  productivityBody.innerHTML=duties.length ? duties.map(d=>`
    <tr>
      <td>${esc(cvPdfText(d.date))}</td>
      <td>${esc(cvPdfText(d.items,"Flight"))}</td>
      <td>${esc(hhmm(d.minutes))}</td>
      <td>${esc(moneyRM(d.minutes/60*rule.pa))}</td>
    </tr>
  `).join("") : `<tr><td colspan="4">No eligible operating or positioning flight duty found.</td></tr>`;

  layoverBody.innerHTML=layovers.length ? layovers.map(l=>`
    <tr>
      <td>${esc(cvPdfText(l.airport))}</td>
      <td>${esc(cvPdfText(l.region))}</td>
      <td>${esc(moneyRM(l.amount))}</td>
    </tr>
  `).join("") : `<tr><td colspan="3">No qualifying layover found.</td></tr>`;

  $("#cvPdfLayoverFooterTotal").textContent=moneyRM(layoverAmount);
  doc.setAttribute("aria-hidden","false");
}


const CREWVIEW_PDF_LOGO_JPEG_B64 = "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";

function cvPdfAscii(value){
  return String(value ?? "")
    .replace(/[–—]/g,"-")
    .replace(/→/g,"->")
    .replace(/·/g," - ")
    .replace(/[^\x20-\x7E]/g,"");
}

function cvPdfEscape(value){
  return cvPdfAscii(value)
    .replace(/\\/g,"\\\\")
    .replace(/\(/g,"\\(")
    .replace(/\)/g,"\\)");
}

function cvPdfApproxTextWidth(text,size){
  return cvPdfAscii(text).length * size * 0.49;
}

function cvPdfFitText(text,width,size){
  let s=cvPdfAscii(text);
  if(cvPdfApproxTextWidth(s,size)<=Math.max(2,width-4)) return s;
  const max=Math.max(1,Math.floor((width-7)/(size*.49)));
  return max<=2 ? s.slice(0,max) : s.slice(0,max-2)+"..";
}

function cvPdfB64Bytes(b64){
  const raw=atob(b64);
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}

function cvPdfConcatBytes(parts){
  const total=parts.reduce((n,p)=>n+p.length,0);
  const out=new Uint8Array(total);
  let off=0;
  parts.forEach(p=>{out.set(p,off);off+=p.length;});
  return out;
}

function cvPdfRgb(hex){
  const s=String(hex||"#000000").replace("#","");
  const n=parseInt(s.length===3?s.split("").map(c=>c+c).join(""):s,16);
  return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255]
    .map(v=>Number(v.toFixed(3)));
}

class CvPdfPage{
  constructor(){
    this.w=595.28;
    this.h=841.89;
    this.c=[];
  }
  n(v){ return Number(v.toFixed(2)); }
  y(top){ return this.n(this.h-top); }
  color(hex,stroke=false){
    const [r,g,b]=cvPdfRgb(hex);
    this.c.push(`${r} ${g} ${b} ${stroke?"RG":"rg"}`);
  }
  line(x1,y1,x2,y2,color="#111111",width=.6){
    this.color(color,true);
    this.c.push(`${this.n(width)} w ${this.n(x1)} ${this.y(y1)} m ${this.n(x2)} ${this.y(y2)} l S`);
  }
  rect(x,y,w,h,{fill=null,stroke="#999999",width=.5}={}){
    const py=this.n(this.h-y-h);
    if(fill && stroke){
      this.color(fill,false);
      this.color(stroke,true);
      this.c.push(`${this.n(width)} w ${this.n(x)} ${py} ${this.n(w)} ${this.n(h)} re B`);
    }else if(fill){
      this.color(fill,false);
      this.c.push(`${this.n(x)} ${py} ${this.n(w)} ${this.n(h)} re f`);
    }else{
      this.color(stroke||"#999999",true);
      this.c.push(`${this.n(width)} w ${this.n(x)} ${py} ${this.n(w)} ${this.n(h)} re S`);
    }
  }
  text(x,y,text,size=8,{bold=false,color="#111111",align="left",maxWidth=0}={}){
    let s=cvPdfAscii(text);
    if(maxWidth>0) s=cvPdfFitText(s,maxWidth,size);
    let tx=x;
    const tw=cvPdfApproxTextWidth(s,size);
    if(align==="center") tx=x-tw/2;
    if(align==="right") tx=x-tw;
    this.color(color,false);
    this.c.push(`BT /${bold?"F2":"F1"} ${this.n(size)} Tf ${this.n(tx)} ${this.y(y)} Td (${cvPdfEscape(s)}) Tj ET`);
  }
  image(x,y,w,h){
    const py=this.n(this.h-y-h);
    this.c.push(`q ${this.n(w)} 0 0 ${this.n(h)} ${this.n(x)} ${py} cm /Im1 Do Q`);
  }
  stream(){ return this.c.join("\n")+"\n"; }
}

function cvPdfObjectBytes(objectNumber,bodyParts){
  const enc=new TextEncoder();
  const head=enc.encode(`${objectNumber} 0 obj\n`);
  const tail=enc.encode(`\nendobj\n`);
  return cvPdfConcatBytes([head,...bodyParts,tail]);
}

function cvPdfBuildBinary(page1,page2){
  const enc=new TextEncoder();
  const logo=cvPdfB64Bytes(CREWVIEW_PDF_LOGO_JPEG_B64);
  const s1=enc.encode(page1.stream());
  const s2=enc.encode(page2.stream());

  const objects=[];
  objects[1]=cvPdfObjectBytes(1,[enc.encode(`<< /Type /Catalog /Pages 2 0 R >>`)]);
  objects[2]=cvPdfObjectBytes(2,[enc.encode(`<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>`)]);
  const resources=`<< /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >>`;
  objects[3]=cvPdfObjectBytes(3,[enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources ${resources} /Contents 8 0 R >>`)]);
  objects[4]=cvPdfObjectBytes(4,[enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources ${resources} /Contents 9 0 R >>`)]);
  objects[5]=cvPdfObjectBytes(5,[enc.encode(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)]);
  objects[6]=cvPdfObjectBytes(6,[enc.encode(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)]);
  objects[7]=cvPdfObjectBytes(7,[
    enc.encode(`<< /Type /XObject /Subtype /Image /Width 512 /Height 512 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`),
    logo,
    enc.encode(`\nendstream`)
  ]);
  objects[8]=cvPdfObjectBytes(8,[enc.encode(`<< /Length ${s1.length} >>\nstream\n`),s1,enc.encode(`endstream`)]);
  objects[9]=cvPdfObjectBytes(9,[enc.encode(`<< /Length ${s2.length} >>\nstream\n`),s2,enc.encode(`endstream`)]);

  const header=enc.encode("%PDF-1.4\n% CrewView direct PDF\n");
  const chunks=[header];
  const offsets=[0];
  let pos=header.length;

  for(let i=1;i<=9;i++){
    offsets[i]=pos;
    chunks.push(objects[i]);
    pos+=objects[i].length;
  }

  const xrefOffset=pos;
  let xref=`xref\n0 10\n0000000000 65535 f \n`;
  for(let i=1;i<=9;i++){
    xref+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  }
  xref+=`trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(enc.encode(xref));
  return cvPdfConcatBytes(chunks);
}

function cvPdfDrawBrand(page,title,month,generated){
  page.image(32,21,31,31);
  page.text(68,43,"Crew",16,{bold:true,color:"#0B2D5B"});
  page.text(104,43,"View",16,{bold:true,color:"#159CFF"});
  page.text(297.64,43,title,15,{bold:true,align:"center"});
  page.text(563,34,month,11,{bold:true,align:"right"});
  page.text(563,47,generated,5.8,{color:"#444444",align:"right"});
  page.line(32,62,563,62,"#111111",.65);
}

function cvPdfDrawFooter(page,pageNumber){
  page.line(32,803,563,803,"#111111",.6);
  page.text(32,818,"CrewView - Your roster. Your time. Your view.",6.2,{color:"#333333"});
  page.text(563,818,`Page ${pageNumber} of 2`,6.2,{color:"#333333",align:"right"});
}

function cvPdfDrawCard(page,x,y,w,h,label,value,valueSize=13){
  page.rect(x,y,w,h,{fill:"#FAFAFA",stroke:"#888888",width:.55});
  page.text(x+9,y+15,label,6.5,{color:"#333333",maxWidth:w-18});
  const valueY=y+Math.min(h-11,36);
  page.text(x+9,valueY,value,valueSize,{bold:true,maxWidth:w-18});
}

function cvPdfDrawTable(page,{x,y,widths,headers,rows,rowH=16,headH=15,fontSize=5.3,aligns=[]}){
  let cx=x;
  if(headH>0){
    headers.forEach((h,i)=>{
      const w=widths[i];
      page.rect(cx,y,w,headH,{fill:"#F1F1F1",stroke:"#888888",width:.4});
      page.text(cx+w/2,y+10.2,h,5.1,{bold:true,align:"center",maxWidth:w-3});
      cx+=w;
    });
  }

  let cy=y+headH;
  rows.forEach(row=>{
    cx=x;
    row.forEach((cell,i)=>{
      const w=widths[i];
      page.rect(cx,cy,w,rowH,{fill:"#FFFFFF",stroke:"#B0B0B0",width:.34});
      const align=aligns[i]||"left";
      const tx=align==="center"?cx+w/2:align==="right"?cx+w-3:cx+3;
      page.text(tx,cy+rowH*.66,cvPdfText(cell,"-"),fontSize,{align,maxWidth:w-5});
      cx+=w;
    });
    cy+=rowH;
  });
  return cy;
}

function cvPdfDirectData(){
  const rows=cvPdfOfficialRows();
  const name=(($("#name")?.value||"").trim()||"Crew Member").toUpperCase();
  const staff=($("#staff")?.value||"").trim();
  const rank=($("#rank")?.value||"").trim();
  const fleet=($("#fleet")?.value||"").trim();
  const base=($("#base")?.value||"").trim();
  const meta=[staff,rank,fleet,base].filter(Boolean).join(" - ")||"-";
  const month=cvPdfMonthLabel();
  const generated=cvPdfGeneratedLabel().replace(/^Generated:\s*/,"");

  const flightMinutes=rows.reduce((sum,row)=>sum+toMinutes(row.block),0);
  const dutyMinutes=rows.reduce((sum,row)=>sum+toMinutes(row.duty),0);

  const gradeEl=$("#payGrade");
  if(gradeEl && !gradeEl.dataset.userSelected) gradeEl.value=inferredPayGrade();
  const grade=(gradeEl?.dataset?.userSelected && gradeEl.value) ? gradeEl.value : inferredPayGrade();
  const rule=PAY_RULES[grade]||PAY_RULES["C1-P"];
  const duties=payDutyGroups();
  const eligibleMinutes=duties.reduce((sum,d)=>sum+d.minutes,0);
  const blockMinutes=payMonthlyBlockMinutes();
  const excessMinutes=Math.max(0,blockMinutes-80*60);
  const productivityAmount=eligibleMinutes/60*rule.pa;
  const over80Amount=excessMinutes/60*rule.over80;
  const layovers=calculateLayoverAllowances();
  const layoverAmount=layovers.reduce((sum,l)=>sum+Number(l.amount||0),0);
  const estimatedTotal=productivityAmount+over80Amount+layoverAmount;

  return {
    rows,name,meta,month,generated,
    flightMinutes,dutyMinutes,offDays:cvPdfOffDayCount(rows),
    grade,rule,duties,eligibleMinutes,blockMinutes,
    productivityAmount,over80Amount,layovers,layoverAmount,estimatedTotal
  };
}

function cvPdfBuildDirectBlob(){
  const d=cvPdfDirectData();
  const p1=new CvPdfPage();
  const p2=new CvPdfPage();

  cvPdfDrawBrand(p1,"Roster Summary",d.month,d.generated);
  p1.text(32,82,d.name,9.5,{bold:true,maxWidth:420});
  p1.text(32,95,d.meta,7.1,{color:"#333333",maxWidth:420});

  const gap=10, totalW=531, cardW=(totalW-gap*2)/3;
  cvPdfDrawCard(p1,32,108,cardW,42,"Roster Flight Hours",hhmm(d.flightMinutes));
  cvPdfDrawCard(p1,32+cardW+gap,108,cardW,42,"Duty Hours",hhmm(d.dutyMinutes));
  cvPdfDrawCard(p1,32+(cardW+gap)*2,108,cardW,42,"Off Days",String(d.offDays));

  const rosterHeaders=["Date","Day","Duty Start","Item","Dep/Start","Arr/End","Duty End","Work Type","Block Hrs","Duty Hrs","A/C"];
  const rosterWidths=[65,30,44,38,76,76,46,45,42,42,27];
  const rosterRows=d.rows.map(r=>[
    r.date,r.day,r.dutyStart,r.item,r.dep,r.arr,r.dutyEnd,r.work,r.block,r.duty,r.ac
  ]);
  cvPdfDrawTable(p1,{
    x:32,y:163,widths:rosterWidths,headers:rosterHeaders,rows:rosterRows,
    rowH:16.2,headH:14,fontSize:5.15,
    aligns:["left","center","center","center","left","left","center","center","center","center","center"]
  });
  cvPdfDrawFooter(p1,1);

  cvPdfDrawBrand(p2,"Allowance Report",d.month,d.generated);
  p2.text(32,82,d.name,9.7,{bold:true,maxWidth:420});
  p2.text(32,96,d.meta,7.2,{color:"#333333",maxWidth:420});

  // Larger, more comfortable top cards.
  const cardGap=9;
  const cardW2=(531-cardGap*3)/4;
  cvPdfDrawCard(p2,32,112,cardW2,52,"Estimated Allowances",moneyRM(d.estimatedTotal),11.2);
  cvPdfDrawCard(p2,32+cardW2+cardGap,112,cardW2,52,"Productivity Allowance",moneyRM(d.productivityAmount),11.2);
  cvPdfDrawCard(p2,32+(cardW2+cardGap)*2,112,cardW2,52,"Layover Allowance",moneyRM(d.layoverAmount),11.2);
  cvPdfDrawCard(p2,32+(cardW2+cardGap)*3,112,cardW2,52,"Grade",`${d.grade} - ${d.rule.label}`,9.3);

  // Stronger Allowance Summary.
  p2.text(32,190,"Allowance Summary",12,{bold:true});
  const summaryRows=[
    ["Eligible Duty Hours",hhmm(d.eligibleMinutes)],
    ["Monthly Flying Block",hhmm(d.blockMinutes)],
    ["80+ Block Hours Payment",moneyRM(d.over80Amount)],
    ["FDP Extension","Separate Rule"]
  ];
  cvPdfDrawTable(p2,{
    x:32,y:203,widths:[265.5,265.5],headers:[],rows:summaryRows,
    rowH:22,headH:0,fontSize:7.8,aligns:["left","left"]
  });

  // Productivity breakdown — larger text and row height.
  p2.text(32,307,"Productivity Breakdown",12,{bold:true});
  const prodRows=d.duties.map(item=>[
    item.date,
    item.items||"Flight",
    hhmm(item.minutes),
    moneyRM(item.minutes/60*d.rule.pa)
  ]);

  const prodCount=Math.max(1,prodRows.length);
  const prodRowH=Math.max(14.2,Math.min(20.5,245/prodCount));
  const prodEnd=cvPdfDrawTable(p2,{
    x:32,y:321,widths:[120,120,105,186],
    headers:["Date","Duty","Duty Hours","Productivity Amount"],
    rows:prodRows,rowH:prodRowH,headH:17,fontSize:6.7,
    aligns:["center","center","center","center"]
  });

  // Layover section starts naturally after productivity and is allowed
  // to use the lower half of the page instead of being compressed.
  const layTitleY=Math.max(565,prodEnd+23);
  p2.text(32,layTitleY,"Layover Breakdown",12,{bold:true});

  const layRows=d.layovers.map(l=>[
    l.airport,
    l.region,
    moneyRM(l.amount)
  ]);

  const layStart=layTitleY+14;
  const layRowH=Math.max(16.5,Math.min(22,152/Math.max(1,layRows.length)));
  const layEnd=cvPdfDrawTable(p2,{
    x:32,y:layStart,widths:[118,263,150],
    headers:["Station","Region","Allowance"],
    rows:layRows,rowH:layRowH,headH:17,fontSize:6.9,
    aligns:["center","center","center"]
  });

  // Stronger final total row.
  const totalY=layEnd;
  p2.rect(32,totalY,381,25,{fill:"#F1F1F1",stroke:"#777777",width:.55});
  p2.rect(413,totalY,150,25,{fill:"#F1F1F1",stroke:"#777777",width:.55});
  p2.text(222.5,totalY+16.5,"Total Layover Allowance",8.8,{
    bold:true,align:"center",maxWidth:365
  });
  p2.text(488,totalY+16.5,moneyRM(d.layoverAmount),9.8,{
    bold:true,align:"center",maxWidth:140
  });

  cvPdfDrawFooter(p2,2);

  return new Blob([cvPdfBuildBinary(p1,p2)],{type:"application/pdf"});
}

function cvPdfSafeFilenameMonth(){
  return cvPdfMonthLabel().replace(/\s+/g,"-").replace(/[^A-Za-z0-9-]/g,"") || "Roster";
}

function cvPdfDownloadFallback(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  a.rel="noopener";
  a.style.display="none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function saveCrewViewPdfDirect(){
  const button=$("#printBtn");
  const oldText=button?.textContent||"Export PDF";
  if(button){
    button.disabled=true;
    button.textContent="Preparing PDF...";
  }

  try{
    const blob=cvPdfBuildDirectBlob();
    const filename=`CrewView-${cvPdfSafeFilenameMonth()}.pdf`;
    let shared=false;

    if(typeof File!=="undefined" && navigator.share){
      try{
        const file=new File([blob],filename,{type:"application/pdf"});
        if(!navigator.canShare || navigator.canShare({files:[file]})){
          await navigator.share({
            files:[file]
          });
          shared=true;
        }
      }catch(error){
        if(error?.name==="AbortError") return;
      }
    }

    if(!shared) cvPdfDownloadFallback(blob,filename);
  }catch(error){
    console.error("CrewView direct PDF export failed",error);
    alert("CrewView could not create the PDF. Please try again.");
  }finally{
    if(button){
      button.disabled=false;
      button.textContent=oldText;
    }
  }
}

window.addEventListener("resize",()=>{if(fitEnabled)applyOnePageFit()});
$("#printBtn").onclick=()=>{
  saveCrewViewPdfDirect();
};



window.addEventListener("load",()=>{document.body.classList.add("fit-mode");applyOnePageFit()});

requestAnimationFrame(syncCalendarThemeButton);


document.querySelectorAll(".pay-subtab[data-pay-section]").forEach(button=>
  button.addEventListener("click",()=>switchPaySubview(button.dataset.paySection))
);

$("#payGrade")?.addEventListener("change",event=>{
  event.currentTarget.dataset.userSelected="1";
  renderPayView();
});

/* v148 Allowances Show more / Show less */
document.querySelectorAll(".pay-collapse-toggle[data-collapse-target]").forEach(button=>{
  button.addEventListener("click",()=>{
    const target=document.getElementById(button.dataset.collapseTarget||"");
    if(!target) return;
    const collapsed=target.classList.toggle("is-collapsed");
    button.setAttribute("aria-expanded",collapsed?"false":"true");
    button.textContent=collapsed?"Show more":"Show less";
  });
});

window.CrewViewV200Bridge={
  switchRosterView,
  currentRosterView:()=>crewViewMode,
  getRows,
  activeDuty:()=>activeNextDuty,
  activeDutyState:()=>activeSmartDutyState,
  openDutyDetailsFor,
  closeDutyDetails,
  setSmartDutyExpanded,
  productivityAllowanceForDuty,
  layoverForDuty,
  renderPayView,
  renderTimelineView,
  renderCalendarView,
  moneyRM,
  saveCrewViewPdfDirect
};
window.dispatchEvent(new CustomEvent("crewview:ready"));
