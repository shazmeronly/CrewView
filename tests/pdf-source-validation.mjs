// Run with paths to local pilot PDFs. No personal roster data is committed.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]})));
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
for(const file of process.argv.slice(2)){
 const ctx=vm.createContext({console,Intl,Date,Map,Set,status:{},officialRosterPeriod:null,officialFH:null,officialDH:null});
 vm.runInContext(functions+'\n'+source.match(/const VALIDATION_FIXTURES=\{[\s\S]*?^\};/m)[0],ctx);
 const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(file))}).promise;
 const evidence={flights:[],duties:[]};let rows=[],text='';
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),v=page.getViewport({scale:1}),tc=await page.getTextContent();
  ctx.items=tc.items.map((item,sourceIndex)=>{const t=pdfjs.Util.transform(v.transform,item.transform);return {s:item.str.trim(),x:t[4],y:v.height-t[5],sourceIndex};}).filter(i=>i.s);
  ctx.w=v.width;ctx.h=v.height;ctx.pageNumber=n;
  const ev=vm.runInContext('readPilotSourceEvidence(items,w)',ctx);assert.ok(ev);evidence.flights.push(...ev.flights);evidence.duties.push(...ev.duties);
  rows.push(...vm.runInContext('buildRows(items,w,h,pageNumber)',ctx));text+=' '+ctx.items.map(i=>i.s).join(' ');
 }
 ctx.rows=rows;ctx.pdfText=text;ctx.evidence=evidence;
 ctx.officialFH=text.match(/FH\s*:\s*(\d+:\d{2})/)[1];ctx.officialDH=text.match(/DH\s*:\s*(\d+:\d{2})/)[1];
 vm.runInContext(`officialRosterPeriod=parseOfficialRosterPeriod(pdfText);
 rows=restoreMissingPilotDates(rows,pdfText);
 rows=fillEveryDay(rows,officialRosterPeriod);
 rows=markLayoverCalendarRows(rows,'KUL');
 rows=moveExplicitNextDayTimings(rows);
 rows=normalizePilotContinuationColumns(rows);
 rows=repairSplitPilotDutyColumns(rows);
 rows=markRemainingBlankDaysAsOff(rows);
 rows=removeSyntheticOffRowsOnOvernightDates(rows);
 rows=removeOffPlaceholdersOnDutyDates(rows);
 rows=removeCompletelyBlankRows(rows);`,ctx);
 let result=vm.runInContext('validateKnownRoster(rows,evidence)',ctx);
 console.log(file,result);assert.equal(result.passed,true);assert.equal(result.notices.length,1);
 // A missing zero-hour return must fail despite leaving duty totals unchanged.
 vm.runInContext("rows=rows.filter(r=>r.item!=='MH144')",ctx);
 assert.equal(vm.runInContext('validateKnownRoster(rows,evidence).passed',ctx),false);
}
