
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
});

import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

const $=s=>document.querySelector(s);
const tbody=$("#rosterTable tbody"), status=$("#status");
const cols=["date","day","dutyStart","item","dep","arr","dutyEnd","work","block","duty","ac"];
let officialFH=null, officialDH=null;
let officialRosterPeriod=null;

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
  const syntheticCalendarRow=r._syntheticCalendarRow ? "1" : "";
  const layoverDay=r._layoverDay ? "1" : "";
  const visualOrder=Number.isFinite(r._visualOrder)
    ? String(r._visualOrder)
    : "";
  const dutyGroup=esc(r._dutyGroup||"");
  const sectorIndex=Number.isFinite(r._sectorIndex) ? String(r._sectorIndex) : "";
  const sectorCount=Number.isFinite(r._sectorCount) ? String(r._sectorCount) : "";

  return `<tr
    data-overnight-continuation="${continuation}"
    data-synthetic-calendar-row="${syntheticCalendarRow}"
    data-layover-day="${layoverDay}"
    data-visual-order="${visualOrder}"
    data-duty-group="${dutyGroup}"
    data-sector-index="${sectorIndex}"
    data-sector-count="${sectorCount}"
  >${cols.map(c=>
    `<td contenteditable="true" data-k="${c}">${esc(r[c]??"")}</td>`
  ).join("")}</tr>`;
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
  tbody.innerHTML=rows.map(rowHTML).join("");
  classifyRows();
  updateStats();
  renderNextDuty();
  renderCalendarView();
  setTimeout(applyOnePageFit,0);
}
function getRows(){
  return [...tbody.rows].map(tr=>{
    const row=Object.fromEntries(
      [...tr.cells].map(td=>[td.dataset.k,td.textContent.trim()])
    );
    row._overnightContinuation=tr.dataset.overnightContinuation==="1";
    row._syntheticCalendarRow=
      tr.dataset.syntheticCalendarRow==="1";
    row._layoverDay=tr.dataset.layoverDay==="1";
    if(tr.dataset.visualOrder!==""){
      row._visualOrder=Number(tr.dataset.visualOrder);
    }
    row._dutyGroup=tr.dataset.dutyGroup||"";

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
tbody.addEventListener("input",()=>{classifyRows();updateStats();renderNextDuty();if(crewViewMode==="calendar")renderCalendarView()});


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

  if(!fixture){
    return {
      known:false,
      passed:true,
      message:"Roster converted. This month is not in the built-in validation set."
    };
  }

  const issues=[];
  const fingerprints=rosterFingerprint(rows);

  if(officialFH!==fixture.fh){
    issues.push(`Flying hours: expected ${fixture.fh}, found ${officialFH||"—"}`);
  }
  if(officialDH!==fixture.dh){
    issues.push(`Duty hours: expected ${fixture.dh}, found ${officialDH||"—"}`);
  }

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

  return {
    known:true,
    passed:issues.length===0,
    label:fixture.label,
    issues,
    message:issues.length
      ? `${fixture.label} validation found ${issues.length} issue${issues.length===1?"":"s"}.`
      : `${fixture.label} validation passed.`
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
    /([A-Z][A-Z .'-]{5,}?)\s*\|\s*(\d{5,})\s*\|\s*([A-Z0-9]{2,5})\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,3})(?=\s|Roster Report|FH|$)/i
  );

  // Fallback when PDF.js drops the vertical bars.
  if(!person){
    person=head.match(
      /([A-Z][A-Z .'-]{5,}?)\s+(\d{5,})\s+([A-Z0-9]{2,5})\s+([A-Z]{3})\s+([A-Z]{2,3})(?=\s+Roster Report|\s+FH\s*:|$)/i
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

      const first=sameDate[0];
      const blank=[
        first.dutyStart,first.item,first.dep,first.arr,first.dutyEnd,
        first.work,first.block,first.duty,first.ac
      ].every(v=>!String(v||"").trim());

      if(blank){
        first.arr=extras[0].arr;
        first.dutyEnd=extras[0].dutyEnd;
        first._overnightContinuation=true;
        result.push(first);

        extras.slice(1).forEach(extra=>result.push({...extra,date:"",day:""}));
        sameDate.slice(1).forEach(r=>result.push({...r,date:"",day:""}));
      } else {
        // Arrival line first, then the existing duty beneath it.
        result.push({...extras[0],date,day:dayName(date)});
        extras.slice(1).forEach(extra=>result.push({...extra,date:"",day:""}));
        sameDate.forEach(r=>result.push({...r,date:"",day:""}));
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
    const looksLikeSyntheticOff=
      item==="D" &&
      !String(row.dutyStart||"").trim() &&
      !String(row.dep||"").trim() &&
      !String(row.arr||"").trim() &&
      !String(row.dutyEnd||"").trim() &&
      !String(row.work||"").trim() &&
      !String(row.block||"").trim() &&
      !String(row.duty||"").trim() &&
      !String(row.ac||"").trim();

    return !looksLikeSyntheticOff;
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

function dutyDateTime(row){
  const d=parseRosterDate(row.date);
  if(!d || !row.dutyStart) return null;
  const m=String(row.dutyStart).match(/^(\d{1,2}):(\d{2})/);
  if(!m) return null;
  d.setHours(Number(m[1]),Number(m[2]),0,0);
  return d;
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

function getUpcomingDuty(rows){
  const now=new Date();

  /*
   * A historical roster cannot contain a real upcoming duty. Hiding the card
   * prevents an old June duty being presented as "Next Duty" in August.
   */
  if(
    officialRosterPeriod?.end &&
    officialRosterPeriod.end < new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
  ){
    return null;
  }

  const candidates=[];

  rows.forEach((row,index)=>{
    if(
      row._overnightContinuation ||
      (
        !String(row.item||"").trim() &&
        !String(row.dutyStart||"").trim() &&
        (
          String(row.arr||"").trim() ||
          String(row.dutyEnd||"").trim()
        )
      ) ||
      /*
       * A flight row without a report time is a continuation sector.
       * Do not use _sectorIndex here: pilot rows may carry a page-wide index.
       */
      (
        !String(row.dutyStart||"").trim() &&
        /^MH\d+/i.test(String(row.item||"").trim())
      )
    ) return;

    const item=(row.item||"").trim().toUpperCase();
    const report=dutyDateTime(row);

    // Next Duty remains a future working duty only.
    if(!item || item==="D" || item==="OFF" || !report || report<=now) return;

    candidates.push({
      ...buildCompleteDuty(rows,index),
      _dt:report
    });
  });

  candidates.sort((a,b)=>a._dt-b._dt);
  return candidates[0]||null;
}

function renderNextDuty(){
  const card=$("#nextDutyCard");
  if(!card) return;

  const row=getUpcomingDuty(getRows());
  activeNextDuty=row;
  if(!row){
    card.classList.add("hidden");
    if(nextDutyTimer){clearInterval(nextDutyTimer);nextDutyTimer=null;}
    return;
  }

  card.classList.remove("hidden","soon","urgent","current");
  $("#nextDutyItem").textContent=row._displayItems||row.item||"Duty";

  const routeAirports=(row._routeAirports||[]).filter(Boolean);
  const departureAirport=(row.dep||"").trim().split(/\s+/)[0]||"";
  const arrivalAirport=(row._arrival||row.arr||"").trim().split(/\s+/)[0]||"";

  $("#nextDutyRoute").textContent=
    routeAirports.length>1
      ? routeAirports.join(" → ")
      : (
          departureAirport&&arrivalAirport
            ? `${departureAirport} → ${arrivalAirport}`
            : (departureAirport||arrivalAirport||"—")
        );

  $("#nextDutyReport").textContent=row.dutyStart||"—";

  const reportDay=row.day||dayName(row.date);

  // Keep the card compact: show only the departure/report date.
  $("#nextDutyDate").textContent=`${row.date} · ${reportDay}`;

  // For overnight duties, use the final duty-end time from the continuation row.
  $("#nextDutyEnd").textContent=
    row._finalDutyEnd || row.dutyEnd || "—";
  $("#nextDutyAircraft").textContent=row.ac||"—";

  const update=()=>{
    const now=new Date();
    const diff=row._dt-now;
    const dutyMinutes=toMinutes(row.duty);
    let estimatedEnd;

    if(row._arrivalDate && row._finalDutyEnd){
      const endDate=parseRosterDate(row._arrivalDate);
      const m=String(row._finalDutyEnd).match(/^(\d{1,2}):(\d{2})/);
      if(endDate && m){
        endDate.setHours(Number(m[1]),Number(m[2]),0,0);
        estimatedEnd=endDate;
      }
    }

    if(!estimatedEnd){
      estimatedEnd=new Date(
        row._dt.getTime()+(dutyMinutes||720)*60000
      );
    }

    card.classList.remove("soon","urgent","current");

    if(row._current && now<=estimatedEnd){
      card.classList.add("current");
      $("#nextDutyCountdown").textContent="CURRENT DUTY";
      $("#nextDutyProgress").style.width="100%";
      return;
    }

    if(diff<=6*3600000) card.classList.add("urgent");
    else if(diff<=24*3600000) card.classList.add("soon");

    $("#nextDutyCountdown").textContent=formatCountdown(diff);

    // Progress is based on the final 48 hours before report.
    const windowMs=48*3600000;
    const pct=Math.max(0,Math.min(100,(1-(diff/windowMs))*100));
    $("#nextDutyProgress").style.width=`${pct}%`;
  };

  update();
  if(nextDutyTimer) clearInterval(nextDutyTimer);
  nextDutyTimer=setInterval(update,1000);
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
    formatCountdown(row._dt-new Date());

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

$("#nextDutyCard")?.addEventListener("click",openDutyDetails);
$("#nextDutyCard")?.addEventListener("keydown",event=>{
  if(event.key==="Enter" || event.key===" "){
    event.preventDefault();
    openDutyDetails();
  }
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
    if(/^\d{2}:\d{2}$/.test(String(row.dutyStart||""))) score+=2;
    if(/^MH\d{2,4}$/i.test(String(row.item||""))) score+=5;
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
    ["FS","FSS","LS","CSS","IFM","CCM"].includes(rank)
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
  $("#viewSwitcher")?.classList.remove("hidden");
  updateCompactProfile();
  const savedView=localStorage.getItem("crewview-roster-view");
  if(savedView==="calendar") switchRosterView("calendar");

  setTimeout(()=>{
    applyOnePageFit();
    document.querySelector("#nextDutyCard")?.scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  },80);
}



/* Calendar View: visual layer only. The Malaysia Airlines PDF parser is unchanged. */
let crewViewMode="classic";
let calendarCursor=null;
let selectedCalendarDuty=null;
const calendarFiltersEnabled=new Set([
  "flight","off","standby","leave","training","simulator","admin"
]);

const monthFormatter=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
const shortMonthFormatter=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});

function calendarCategory(row){
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
    if(row._overnightContinuation) return;

    const key=calendarDateKey(row);
    if(!key) return;

    const complete=completeCalendarDuty(rows,index);
    if(!complete) return;

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

  $("#calendarFH").textContent=$("#fh")?.textContent||"00:00";
  $("#calendarDH").textContent=$("#dh")?.textContent||"00:00";
  $("#calendarOff").textContent=$("#off")?.textContent||"0";
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

function renderCalendarView(){
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

    const primary=
      duties.find(item=>item._calendarCategory!=="off")||
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
        class="calendar-day ${category} ${outside?"outside":""} ${isToday?"today":""} ${isSelected?"selected":""}"
        data-calendar-key="${key}"
        ${primary?"":"disabled"}
        aria-label="${esc([d.getDate(),tile.title,tile.route,tile.report,tile.departure].filter(Boolean).join(" "))}"
      >
        <span class="calendar-day-number">${d.getDate()}</span>
        ${tile.icon?`<i class="calendar-plane">${esc(tile.icon)}</i>`:""}
        ${tile.title?`<strong>${esc(tile.title)}</strong>`:""}
        ${tile.route?`<span class="calendar-day-route">${esc(tile.route)}</span>`:""}
        ${tile.report?`<small class="calendar-report-time">${esc(tile.report)}</small>`:""}
        ${tile.departure?`<small class="calendar-departure-time">${esc(tile.departure)}</small>`:""}
        ${(tile.footerLeft||tile.footerRight)?`
          <span class="calendar-day-footer">
            <b>${esc(tile.footerLeft)}</b>
            <b>${esc(tile.footerRight)}</b>
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

      const duty=
        duties.find(item=>item._calendarCategory!=="off")||
        duties[0];

      if(!duty) return;

      selectCalendarDuty(duty);

      grid.querySelectorAll(".selected").forEach(cell=>
        cell.classList.remove("selected")
      );
      button.classList.add("selected");
    });
  });

  const selectedMonth=parseRosterDate(selectedCalendarDuty?.date||"")?.getMonth();
  if(!selectedCalendarDuty || selectedMonth!==month){
    const defaultDuty=bestCalendarDefaultDuty(entries,year,month);
    if(defaultDuty) selectCalendarDuty(defaultDuty);
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

function selectCalendarDuty(row){
  if(!row) return;

  selectedCalendarDuty=row;
  const panel=$("#calendarSelected");
  panel?.classList.remove("hidden");

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
  $("#selectedWorkBadge").textContent=row.work||row._calendarCategory.toUpperCase();
  $("#selectedRoute").textContent=route;
  $("#selectedAircraft").textContent=row.ac
    ? `Airbus A330-${row.ac}`
    : (row.work||"—");

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
}

function switchRosterView(view){
  crewViewMode=view;
  const calendar=view==="calendar";

  $("#classicView")?.classList.toggle("hidden",calendar);
  $("#calendarView")?.classList.toggle("hidden",!calendar);
  document.body.classList.toggle("calendar-mode",calendar);

  document.querySelectorAll(".view-tab[data-view]").forEach(tab=>
    tab.classList.toggle("active",tab.dataset.view===view)
  );

  localStorage.setItem("crewview-roster-view",view);

  if(calendar){
    calendarCursor=loadedRosterMonth();
    selectedCalendarDuty=null;
    renderCalendarView();
    window.scrollTo({top:0,behavior:"smooth"});
  }else{
    setTimeout(applyOnePageFit,0);
  }
}

document.querySelectorAll(".view-tab[data-view]").forEach(tab=>
  tab.addEventListener("click",()=>switchRosterView(tab.dataset.view))
);

document.querySelectorAll("[data-calendar-mode='classic']").forEach(button=>
  button.addEventListener("click",()=>switchRosterView("classic"))
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
  const loaded=loadedRosterMonth()||new Date();
  calendarCursor=new Date(loaded.getFullYear(),loaded.getMonth(),1);
  selectedCalendarDuty=null;
  renderCalendarView();
});

$("#calendarThemeButton")?.addEventListener("click",()=>themeToggle?.click());

$("#calendarFilters")?.addEventListener("click",()=>{
  document.querySelector(".calendar-legend")?.classList.toggle("filters-open");
});

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
$("#clearBtn")?.addEventListener("click",event=>{
  event.preventDefault();

  officialFH=null;
  officialDH=null;

  if(nextDutyTimer){
    clearInterval(nextDutyTimer);
    nextDutyTimer=null;
  }

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
  $("#viewSwitcher")?.classList.add("hidden");
  switchRosterView("classic");
  calendarCursor=null;
  selectedCalendarDuty=null;

  const fileInput=$("#pdfInput");
  if(fileInput) fileInput.value="";

  status.textContent="No roster loaded.";
  window.scrollTo({top:0,behavior:"smooth"});
});
window.addEventListener("resize",()=>{if(fitEnabled)applyOnePageFit()});
$("#printBtn").onclick=()=>{
  document.body.classList.add("pdf-export");
  fitEnabled=true;
  applyOnePageFit();

  // Give Safari time to apply the export-only layout.
  setTimeout(()=>window.print(),180);
};

window.addEventListener("beforeprint",()=>{
  document.body.classList.add("pdf-export");
});

window.addEventListener("afterprint",()=>{
  document.body.classList.remove("pdf-export");
  setTimeout(applyOnePageFit,50);
});


window.addEventListener("load",()=>{document.body.classList.add("fit-mode");applyOnePageFit()});
