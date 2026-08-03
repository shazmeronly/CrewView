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
function setRows(rows){tbody.innerHTML=rows.map(rowHTML).join(""); classifyRows(); updateStats(); setTimeout(applyOnePageFit,0)}
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
tbody.addEventListener("input",()=>{classifyRows();updateStats()});

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
  // Coordinates are normalized to the rendered landscape page.
  const dates=items.filter(i=>/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(i.s) && i.x < w*0.13 && i.y>h*0.10);
  const unique=[]; dates.sort((a,b)=>a.y-b.y).forEach(d=>{if(!unique.some(x=>Math.abs(x.y-d.y)<4))unique.push(d)});
  const rows=[];
  for(const d of unique){
    const y=d.y;
    const activity=closest(items,w*.10,w*.225,y,10);
    let dutyStart=closest(items,w*.225,w*.29,y,10);
    let item=closest(items,w*.29,w*.365,y,10);
    let work=closest(items,w*.42,w*.48,y,10);
    let dep=closest(items,w*.52,w*.62,y,11);
    let arr=closest(items,w*.62,w*.72,y,16);
    let dutyEnd=closest(items,w*.76,w*.82,y,16);
    let block=closest(items,w*.82,w*.87,y,11);
    let duty=closest(items,w*.87,w*.92,y,11);
    let ac=closest(items,w*.955,w*1.01,y,11);
    if(!item && /^(D|DO\d|DSA|OFF|AL|SL)$/i.test(activity)) item=activity;
    if(item==="D"){dutyStart="";dep="";arr="";dutyEnd="";work="";block="";duty="";ac=""}
    rows.push({date:d.s,day:dayName(d.s),dutyStart:cleanTime(dutyStart),item,
      dep:dep.replace(/\s+/g," "),arr:arr.replace(/\s+/g," "),dutyEnd:cleanTime(dutyEnd),
      work,block:cleanTime(block),duty:cleanTime(duty),ac});
  }
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
  parseHeader(allText.join(" "));
  // dedupe by date+item+start
  const seen=new Set();
  allRows=allRows.filter(r=>{const k=r.date+"|"+r.item+"|"+r.dutyStart;if(seen.has(k))return false;seen.add(k);return true});
  if(!allRows.length) throw new Error("No roster rows were detected. This version supports the current Malaysia Airlines Roster Report PDF.");
  allRows=fillEveryDay(allRows);
  setRows(allRows);
  status.textContent=`Converted the roster and displayed all ${new Date(parseRosterDate(allRows[0].date).getFullYear(), parseRosterDate(allRows[0].date).getMonth()+1, 0).getDate()} calendar days. Please review the yellow cells.`;
}

$("#pdfInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{await parsePDF(file)}catch(err){console.error(err);status.textContent="Could not read this PDF automatically. Load the sample or add rows manually. "+err.message}
});
$("#loadAnotherBtn").onclick=()=>$("#pdfInput").click();
$("#addRowBtn").onclick=()=>{tbody.insertAdjacentHTML("beforeend",rowHTML({}));tbody.lastElementChild.scrollIntoView({behavior:"smooth"});updateStats()}
$("#clearBtn").onclick=()=>{officialFH=null;officialDH=null;setRows([]);status.textContent="Cleared."}
$("#fillDaysBtn").onclick=()=>{const rows=fillEveryDay();setRows(rows);status.textContent="Every calendar day is now shown, including blank layover/rest dates."};
$("#sortBtn").onclick=()=>{const rows=getRows().sort((a,b)=>(parseRosterDate(a.date)||0)-(parseRosterDate(b.date)||0));setRows(rows)}
$("#fitBtn").onclick=()=>{fitEnabled=!fitEnabled;applyOnePageFit()};
window.addEventListener("resize",()=>{if(fitEnabled)applyOnePageFit()});
$("#printBtn").onclick=()=>{fitEnabled=true;applyOnePageFit();setTimeout(()=>window.print(),80)};


window.addEventListener("load",()=>{document.body.classList.add("fit-mode");applyOnePageFit()});
