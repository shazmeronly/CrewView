
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
  return `<tr>${cols.map(c=>`<td contenteditable="true" data-k="${c}">${esc(r[c]??"")}</td>`).join("")}</tr>`;
}
function esc(v){return String(v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function classifyRows(){
  [...tbody.rows].forEach(tr=>{
    tr.classList.remove("row-off","row-training","row-positioning","row-empty");
    const item=(tr.cells[3]?.textContent||"").trim().toUpperCase();
    const work=(tr.cells[7]?.textContent||"").trim().toUpperCase();
    const hasDuty=[...tr.cells].slice(2).some(td=>td.textContent.trim());
    if(item==="D" || item==="OFF" || item.startsWith("DO")) tr.classList.add("row-off");
    else if(item==="DSA" || item.includes("TRAIN") || item.includes("SIM")) tr.classList.add("row-training");
    else if(work==="PS") tr.classList.add("row-positioning");
    else if(!hasDuty) tr.classList.add("row-empty");
  });
}
function setRows(rows){tbody.innerHTML=rows.map(rowHTML).join(""); classifyRows(); updateStats(); renderNextDuty(); setTimeout(applyOnePageFit,0)}
function getRows(){return [...tbody.rows].map(tr=>Object.fromEntries([...tr.cells].map(td=>[td.dataset.k,td.textContent.trim()])))}
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

function getUpcomingDuty(rows){
  const now=new Date();
  const candidates=rows
    .filter(r=>{
      const item=(r.item||"").trim().toUpperCase();
      return item && item!=="D" && item!=="OFF" && dutyDateTime(r);
    })
    .map(r=>({...r,_dt:dutyDateTime(r)}))
    .sort((a,b)=>a._dt-b._dt);

  // Keep a currently active duty visible until its rostered duty end when possible.
  const active=candidates.find(r=>{
    if(r._dt>now) return false;
    const dutyMinutes=toMinutes(r.duty);
    const estimatedEnd=new Date(r._dt.getTime()+(dutyMinutes||720)*60000);
    return estimatedEnd>=now;
  });
  if(active) return {...active,_current:true};

  return candidates.find(r=>r._dt>now)||null;
}

function renderNextDuty(){
  const card=$("#nextDutyCard");
  if(!card) return;

  const row=getUpcomingDuty(getRows());
  if(!row){
    card.classList.add("hidden");
    if(nextDutyTimer){clearInterval(nextDutyTimer);nextDutyTimer=null;}
    return;
  }

  card.classList.remove("hidden","soon","urgent","current");
  $("#nextDutyItem").textContent=row.item||"Duty";
  $("#nextDutyRoute").textContent=routeFromRow(row);
  $("#nextDutyReport").textContent=row.dutyStart||"—";
  $("#nextDutyDate").textContent=`${row.date} · ${row.day||dayName(row.date)}`;
  $("#nextDutyEnd").textContent=row.dutyEnd||"—";
  $("#nextDutyAircraft").textContent=row.ac||"—";

  const update=()=>{
    const now=new Date();
    const diff=row._dt-now;
    const dutyMinutes=toMinutes(row.duty);
    const estimatedEnd=new Date(row._dt.getTime()+(dutyMinutes||720)*60000);

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

async function parsePDF(file){
  status.textContent="Reading PDF…";
  officialFH=null;
  officialDH=null;
  ["name","staff","rank","fleet","base"].forEach(id=>$("#"+id).value="");
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjsLib.getDocument({data}).promise;
  let allRows=[], allText=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p), viewport=page.getViewport({scale:1});
    const tc=await page.getTextContent();
    const items=tc.items.map(it=>{
      const t=pdfjsLib.Util.transform(viewport.transform,it.transform);
      return {s:it.str.trim(),x:t[4],y:viewport.height-t[5]};
    }).filter(i=>i.s);
    allText.push(items.map(i=>i.s).join(" "));
    const pageRows=buildRows(items,viewport.width,viewport.height);
    allRows.push(...pageRows);
  }
  const combinedText=allText.join(" ");
  parseHeader(combinedText);

  // Recover any flight row missed by coordinate parsing, especially the final
  // row at the bottom edge of the PDF.
  allRows.push(...recoverMissingFlightRows(combinedText, allRows));

  // dedupe by date+item+start
  const seen=new Set();
  allRows=allRows.filter(r=>{const k=r.date+"|"+r.item+"|"+r.dutyStart;if(seen.has(k))return false;seen.add(k);return true});
  if(!allRows.length) throw new Error("No roster rows were detected. This version supports the current Malaysia Airlines Roster Report PDF.");
  allRows=fillEveryDay(allRows);
  setRows(allRows);
  status.textContent=`Converted the roster and displayed all ${new Date(parseRosterDate(allRows[0].date).getFullYear(), parseRosterDate(allRows[0].date).getMonth()+1, 0).getDate()} calendar days.`;
  const uploadCard=$("#uploadCard");
  if(uploadCard) uploadCard.classList.add("collapsed-after-load");
  window.scrollTo({top:0,behavior:"smooth"});
}

$("#pdfInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{await parsePDF(file)}catch(err){console.error(err);status.textContent="Could not read this PDF automatically. Load the sample or add rows manually. "+err.message}
});
$("#loadAnotherBtn").onclick=()=>{
  const uploadCard=$("#uploadCard");
  if(uploadCard) uploadCard.classList.remove("collapsed-after-load");
  $("#pdfInput").click();
};
$("#addRowBtn").onclick=()=>{tbody.insertAdjacentHTML("beforeend",rowHTML({}));tbody.lastElementChild.scrollIntoView({behavior:"smooth"});updateStats()}
$("#clearBtn").onclick=()=>{officialFH=null;officialDH=null;setRows([]);status.textContent="Cleared."}
$("#sortBtn").onclick=()=>{const rows=getRows().sort((a,b)=>(parseRosterDate(a.date)||0)-(parseRosterDate(b.date)||0));setRows(rows)}
window.addEventListener("resize",()=>{if(fitEnabled)applyOnePageFit()});
$("#printBtn").onclick=()=>{fitEnabled=true;applyOnePageFit();setTimeout(()=>window.print(),80)};


window.addEventListener("load",()=>{document.body.classList.add("fit-mode");applyOnePageFit()});
