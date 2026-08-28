
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

  $("#dutyDetailBackdrop").classList.remove("hidden");
  $("#dutyDetailSheet").classList.remove("hidden");
  document.body.classList.add("duty-details-open");
  $("#dutyDetailClose").focus();
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
  "flight","off","standby","leave","training","simulator","admin"
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
  if(item==="AL"||item.includes("LEAVE")) return "leave";
  if(
    item.includes("SBY")||
    /^S[1-4](?:-|$)/.test(item)||
    item.includes("STANDBY")
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
  if(work==="OP"||work==="PS"||work==="SFP"||/^MH\d+/i.test(item)) return "flight";
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
    if(calendarFiltersEnabled.has(category)){
      calendarFiltersEnabled.delete(category);
      button.classList.add("disabled");
    }else{
      calendarFiltersEnabled.add(category);
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


const CREWVIEW_PDF_LOGO_JPEG_B64 = "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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//Z";

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
  page.image(32,24,27,27);
  page.text(63,43,"Crew",16,{bold:true,color:"#0B2D5B"});
  page.text(99,43,"View",16,{bold:true,color:"#159CFF"});
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
  page.text(x+9,y+14,label,6.3,{color:"#333333",maxWidth:w-18});
  page.text(x+9,y+32,value,valueSize,{bold:true,maxWidth:w-18});
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
  p2.text(32,82,d.name,9.5,{bold:true,maxWidth:420});
  p2.text(32,95,d.meta,7.1,{color:"#333333",maxWidth:420});

  const cardGap=8, cardW2=(531-cardGap*3)/4;
  cvPdfDrawCard(p2,32,108,cardW2,44,"Estimated Allowances",moneyRM(d.estimatedTotal),10.3);
  cvPdfDrawCard(p2,32+cardW2+cardGap,108,cardW2,44,"Productivity Allowance",moneyRM(d.productivityAmount),10.3);
  cvPdfDrawCard(p2,32+(cardW2+cardGap)*2,108,cardW2,44,"Layover Allowance",moneyRM(d.layoverAmount),10.3);
  cvPdfDrawCard(p2,32+(cardW2+cardGap)*3,108,cardW2,44,"Grade",`${d.grade} - ${d.rule.label}`,8.8);

  p2.text(32,176,"Allowance Summary",11,{bold:true});
  const summaryRows=[
    ["Eligible Duty Hours",hhmm(d.eligibleMinutes)],
    ["Monthly Flying Block",hhmm(d.blockMinutes)],
    ["80+ Block Hours Payment",moneyRM(d.over80Amount)],
    ["FDP Extension","Separate Rule"]
  ];
  cvPdfDrawTable(p2,{
    x:32,y:187,widths:[265.5,265.5],headers:[],rows:summaryRows,
    rowH:17.5,headH:0,fontSize:7.2,aligns:["left","left"]
  });

  p2.text(32,274,"Productivity Breakdown",11,{bold:true});
  const prodRows=d.duties.map(item=>[
    item.date,
    item.items||"Flight",
    hhmm(item.minutes),
    moneyRM(item.minutes/60*d.rule.pa)
  ]);
  const prodCount=Math.max(1,prodRows.length);
  const prodRowH=Math.max(10.2,Math.min(17.2,206/prodCount));
  const prodEnd=cvPdfDrawTable(p2,{
    x:32,y:286,widths:[120,120,105,186],
    headers:["Date","Duty","Duty Hours","Productivity Amount"],
    rows:prodRows,rowH:prodRowH,headH:14,fontSize:6.1,
    aligns:["center","center","center","right"]
  });

  const layTitleY=Math.max(520,prodEnd+20);
  p2.text(32,layTitleY,"Layover Breakdown",11,{bold:true});
  const layRows=d.layovers.map(l=>[l.airport,l.region,moneyRM(l.amount)]);
  const layStart=layTitleY+12;
  const layRowH=Math.max(12,Math.min(18,128/Math.max(1,layRows.length)));
  const layEnd=cvPdfDrawTable(p2,{
    x:32,y:layStart,widths:[118,263,150],
    headers:["Station","Region","Allowance"],
    rows:layRows,rowH:layRowH,headH:14,fontSize:6.3,
    aligns:["center","center","right"]
  });

  const totalY=layEnd;
  p2.rect(32,totalY,381,20,{fill:"#F3F3F3",stroke:"#888888",width:.45});
  p2.rect(413,totalY,150,20,{fill:"#F3F3F3",stroke:"#888888",width:.45});
  p2.text(222.5,totalY+13,"Total Layover Allowance",7.5,{bold:true,align:"center",maxWidth:365});
  p2.text(557,totalY+13,moneyRM(d.layoverAmount),8.2,{bold:true,align:"right",maxWidth:140});

  const noteY=Math.min(760,totalY+36);
  p2.text(32,noteY,"Allowance figures are CrewView estimates based on the loaded roster.",6.3,{color:"#444444",maxWidth:500});
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
  const oldText=button?.textContent||"Save PDF";
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
            files:[file],
            title:`CrewView ${cvPdfMonthLabel()}`
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

