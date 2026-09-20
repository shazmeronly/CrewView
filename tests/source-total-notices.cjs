const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
const ctx=vm.createContext({officialFH:'02:00',officialDH:'04:15',officialRosterPeriod:{key:'2027-01',start:new Date(2027,0,1),end:new Date(2027,0,31)}});
vm.runInContext(functions+'\n'+source.match(/const VALIDATION_FIXTURES=\{[\s\S]*?^\};/m)[0],ctx);
function items(){return [
 {x:650,s:'Duty'},{x:240,s:'Item'},
 {x:25,s:'01-Jan-2027'},{x:240,s:'MH123'},{x:650,s:'03:00'},
 {x:25,s:'02-Jan-2027'},{x:100,s:'S4-330'},{x:650,s:'01:00'},
 {x:25,s:'01-Feb-2027'},{x:240,s:'MH124'},{x:650,s:'05:00'}
].map((v,sourceIndex)=>({...v,sourceIndex}));}
ctx.items=items();ctx.evidence=vm.runInContext('readPilotSourceEvidence(items,1000)',ctx);
const original=[{date:'01-Jan-2027',item:'MH123',block:'02:00',duty:'03:00'},{date:'02-Jan-2027',item:'S4-330',duty:'01:00'},{date:'01-Feb-2027',item:'MH124',duty:'05:00'}];
ctx.rows=structuredClone(original);
const validate=()=>vm.runInContext('validateKnownRoster(rows,evidence)',ctx);
assert.equal(validate().passed,true);assert.match(validate().notices[0],/04:15.*04:00/);
// Future totals and months require no hardcoded exception.
ctx.officialDH='07:37';assert.equal(validate().passed,true);
ctx.officialDH='04:00';assert.equal(validate().notices.length,0);
ctx.officialDH='04:15';
// Balanced corruption cannot pass merely because the aggregate still matches.
ctx.rows[0].duty='02:59';ctx.rows[1].duty='01:01';assert.equal(validate().passed,false);
ctx.rows=structuredClone(original);ctx.rows[0].date='03-Jan-2027';assert.equal(validate().passed,false);
ctx.rows=structuredClone(original);ctx.rows.pop();assert.equal(validate().passed,false);
ctx.rows=structuredClone(original);ctx.rows.push({...ctx.rows[0]});assert.equal(validate().passed,false);
ctx.rows=structuredClone(original);ctx.rows[0].block='01:59';assert.equal(validate().passed,false);
ctx.rows=structuredClone(original);ctx.evidence=null;assert.equal(validate().passed,false);
// Missing column headings or unidentified positive duty entries fail closed.
ctx.items=items().filter(i=>i.s!=='Duty');assert.equal(vm.runInContext('readPilotSourceEvidence(items,1000)',ctx),null);
ctx.items=items().filter(i=>i.s!=='S4-330');assert.equal(vm.runInContext('readPilotSourceEvidence(items,1000)',ctx),null);
assert.ok(!source.includes('KNOWN_SOURCE_TOTAL_DIFFERENCES'));
console.log('PASS: arbitrary revisions, exact entries, dates, carry-over, duplicates, balanced corruption, flying-hour warnings and unsupported layout fallback');
