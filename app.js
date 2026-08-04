
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
  const dutyGroup=esc(r._dutyGroup||"");
  const sectorIndex=Number.isFinite(r._sectorIndex) ? String(r._sectorIndex) : "";
  const sectorCount=Number.isFinite(r._sectorCount) ? String(r._sectorCount) : "";

  return `<tr
    data-overnight-continuation="${continuation}"
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
function setRows(rows){tbody.innerHTML=rows.map(rowHTML).join(""); classifyRows(); updateStats(); renderNextDuty(); setTimeout(applyOnePageFit,0)}
function getRows(){
  return [...tbody.rows].map(tr=>{
    const row=Object.fromEntries(
      [...tr.cells].map(td=>[td.dataset.k,td.textContent.trim()])
    );
    row._overnightContinuation=tr.dataset.overnightContinuation==="1";
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
  const rows=getRows(); let fh=0,dh=0,off=0;
  rows.forEach(r=>{fh+=toMinutes(r.block);dh+=toMinutes(r.duty);if((r.item||"").trim()==="D")off++});
  $("#fh").textContent=officialFH || hhmm(fh);
  $("#dh").textContent=officialDH || hhmm(dh);
  $("#off").textContent=off;
}
tbody.addEventListener("input",()=>{classifyRows();updateStats();renderNextDuty()});


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

function parseHeader(text){
  const head=String(text||"").replace(/\s+/g," ").trim();

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
}
function closest(items, xMin,xMax, y, tol=9){
  return items.filter(i=>i.x>=xMin&&i.x<xMax&&Math.abs(i.y-y)<=tol)
              .sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ").trim();
}
function cleanTime(v){return v.replace(/\s+/g,"").replace("(+ 1)","(+1)")}
function buildRows(items,w,h){
  // Current Malaysia Airlines Roster Report uses a fixed landscape grid.
  // These boundaries are based on the actual PDF columns and scale with page width.
  const X={
    date:[0.02,0.09], activity:[0.09,0.18], dutyStart:[0.185,0.225],
    item:[0.235,0.285], work:[0.33,0.36], dep:[0.40,0.46],
    arr:[0.465,0.52], dutyEnd:[0.56,0.61], block:[0.61,0.64],
    duty:[0.64,0.68], ac:[0.72,0.755]
  };
  const col=(name,y,tol=10)=>closest(items,w*X[name][0],w*X[name][1],y,tol);

  const dates=items.filter(i=>/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(i.s) && i.x<w*0.09 && i.y>h*0.10);
  const unique=[];
  dates.sort((a,b)=>a.y-b.y).forEach(d=>{if(!unique.some(x=>Math.abs(x.y-d.y)<4))unique.push(d)});

  return unique.map(d=>{
    const y=d.y;
    const activity=col('activity',y,10);
    let dutyStart=col('dutyStart',y,8);
    let item=col('item',y,8);
    let work=col('work',y,8);
    let dep=col('dep',y,10);
    let arr=col('arr',y,12);
    let dutyEnd=col('dutyEnd',y,12);
    let block=col('block',y,8);
    let duty=col('duty',y,8);
    let ac=col('ac',y,8);

    if(!item && /^(D|DO\d|DSA|OFF|AL|SL)$/i.test(activity)) item=activity;

    // The old layout should show only the duty code for an OFF day.
    if(/^(D|OFF)$/i.test(item)){
      dutyStart=''; dep=''; arr=''; dutyEnd=''; work=''; block=''; duty=''; ac='';
    }

    return {
      date:d.s,
      day:dayName(d.s),
      dutyStart:cleanTime(dutyStart),
      item:item.trim(),
      dep:dep.replace(/\s+/g,' ').trim(),
      arr:arr.replace(/\s+/g,' ').trim(),
      dutyEnd:cleanTime(dutyEnd),
      work:work.trim(),
      block:cleanTime(block),
      duty:cleanTime(duty),
      ac:ac.trim()
    };
  });
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
        item:"D"
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

function fillEveryDay(rows=getRows()){
  const valid=rows.map(r=>({r,d:parseRosterDate(r.date)})).filter(x=>x.d);
  if(!valid.length){status.textContent="Load a roster first.";return rows}
  const first=valid.reduce((a,b)=>a.d<b.d?a:b).d;
  const year=first.getFullYear(), month=first.getMonth();
  const days=new Date(year,month+1,0).getDate();
  const byDate=new Map();
  valid.forEach(({r,d})=>{
    if(d.getFullYear()===year && d.getMonth()===month){
      const key=fmtDate(d);
      if(!byDate.has(key))byDate.set(key,[]);
      byDate.get(key).push(r);
    }
  });
  const full=[];
  for(let n=1;n<=days;n++){
    const d=new Date(year,month,n), key=fmtDate(d);
    const arr=byDate.get(key);
    if(arr?.length) arr.forEach(r=>full.push({...r,date:key,day:dayName(key)}));
    else full.push({date:key,day:dayName(key)});
  }
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
  const candidates=[];

  rows.forEach((row,index)=>{
    if(
      row._overnightContinuation ||
      (
        row._dutyGroup &&
        Number(row._sectorIndex||0)>0
      ) ||
      (
        !String(row.item||"").trim() &&
        !String(row.dutyStart||"").trim() &&
        (
          String(row.arr||"").trim() ||
          String(row.dutyEnd||"").trim()
        )
      ) ||
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


async function parsePDF(file){
  status.textContent="Reading PDF…";
  officialFH=null;
  officialDH=null;
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

    const pageRotation=((page.rotate||0)%360+360)%360;

    const items=textContent.items
      .map(item=>{
        const rawX=item.transform[4];
        const rawY=item.transform[5];

        /*
         * The cabin-crew Roster Report is physically stored as a portrait PDF
         * rotated 90 degrees for display. Its visual row position is therefore
         * the raw PDF X coordinate—not the transformed Y value previously used.
         *
         * Explicitly map the raw coordinates into visual page coordinates.
         */
        let x;
        let y;

        if(pageRotation===90){
          x=viewport.width-rawY;
          y=rawX;
        }else if(pageRotation===180){
          x=viewport.width-rawX;
          y=viewport.height-rawY;
        }else if(pageRotation===270){
          x=rawY;
          y=viewport.height-rawX;
        }else{
          x=rawX;
          y=viewport.height-rawY;
        }

        return {
          s:item.str.trim(),
          x,
          y
        };
      })
      .filter(item=>item.s);

    const pageText=items.map(item=>item.s).join(" ");
    allText.push(pageText);

    const isPairingPage=
      /Pairing\/Activity/i.test(pageText) &&
      /Duty\s*Report/i.test(pageText);

    if(isPairingPage){
      pairingMode=true;
      allRows.push(
        ...buildPairingRows(
          items,
          viewport.width,
          viewport.height,
          pageNumber
        )
      );
    }else{
      allRows.push(
        ...buildRows(
          items,
          viewport.width,
          viewport.height
        )
      );
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

  allRows=fillEveryDay(allRows);

  // Keep classic next-day rows for (+1) arrivals while preserving all sectors.
  if(!pairingMode){
    allRows=applyClassicOvernightTiming(
      allRows,
      combinedText
    );
  }

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

  allRows=markRemainingBlankDaysAsOff(allRows);

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

    return Number(a._displayOrder||0)-Number(b._displayOrder||0);
  });

  setRows(allRows);

  const firstDate=allRows
    .map(row=>parseRosterDate(row.date))
    .find(Boolean);

  const calendarDays=firstDate
    ? new Date(
        firstDate.getFullYear(),
        firstDate.getMonth()+1,
        0
      ).getDate()
    : allRows.length;

  status.textContent=
    `Converted the roster and displayed all ${calendarDays} calendar days.`;

  document.body.classList.add("roster-loaded");
  updateCompactProfile();

  setTimeout(()=>{
    applyOnePageFit();
    document.querySelector("#nextDutyCard")?.scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  },80);
}

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
