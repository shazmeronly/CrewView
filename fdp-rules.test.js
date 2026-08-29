import test from "node:test";
import assert from "node:assert/strict";
import {
  TABLE_A_BANDS,
  TABLE_B_REST_BANDS,
  calculateFdpLimit,
  tableALimit,
  tableBLimit,
  longRangeSectorSubstitution
} from "./fdp-rules.js";

const clockMinutes=value=>{
  const [hours,minutes]=value.split(":").map(Number);
  return hours*60+minutes;
};
const clock=value=>`${String(Math.floor((value%1440)/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;

test("Table A literal matrix returns every OM-A cell and report-band boundary",()=>{
  TABLE_A_BANDS.forEach(band=>{
    band.limits.forEach((limit,index)=>{
      assert.equal(tableALimit({reportTime:band.start,sectors:index+1}).limitMinutes,limit);
      assert.equal(tableALimit({reportTime:band.end,sectors:index+1}).limitMinutes,limit);
    });
    const next=(clockMinutes(band.end)+1)%1440;
    const nextBand=TABLE_A_BANDS.find(candidate=>{
      const start=clockMinutes(candidate.start), end=clockMinutes(candidate.end);
      return start<=end ? next>=start&&next<=end : next>=start||next<=end;
    });
    assert.equal(tableALimit({reportTime:clock(next),sectors:1}).limitMinutes,nextBand.limits[0]);
  });
  assert.equal(tableALimit({reportTime:"08:00",sectors:99}).tableSectors,8);
  assert.equal(tableALimit({reportTime:"08:00",sectors:99}).limitMinutes,570);
});

test("Table B literal matrix handles all cells, clamping and exact rest boundaries",()=>{
  TABLE_B_REST_BANDS.forEach(band=>{
    band.limits.forEach((limit,index)=>{
      assert.equal(tableBLimit({precedingRestMinutes:band.minimumMinutes,sectors:index+1}).limitMinutes,limit);
      assert.equal(tableBLimit({
        precedingRestMinutes:Number.isFinite(band.maximumMinutes) ? band.maximumMinutes : 100*60,
        sectors:index+1
      }).limitMinutes,limit);
    });
  });
  assert.equal(tableBLimit({precedingRestMinutes:18*60,sectors:1}).limitMinutes,780);
  assert.equal(tableBLimit({precedingRestMinutes:18*60+1,sectors:1}).limitMinutes,690);
  assert.equal(tableBLimit({precedingRestMinutes:30*60,sectors:1}).limitMinutes,690);
  assert.equal(tableBLimit({precedingRestMinutes:30*60+1,sectors:1}).limitMinutes,780);
  assert.equal(tableBLimit({precedingRestMinutes:0,sectors:99}).tableSectors,7);
  assert.equal(tableBLimit({precedingRestMinutes:0,sectors:99}).limitMinutes,540);
});

test("two-pilot long-range substitutions honour all exact boundaries",()=>{
  assert.deepEqual(longRangeSectorSubstitution(420),{sectors:1,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(421),{sectors:2,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(540),{sectors:2,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(541),{sectors:3,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(660),{sectors:3,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(661),{sectors:4,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(421,{acclimatized:false}),{sectors:4,allowed:true});
  assert.deepEqual(longRangeSectorSubstitution(541,{acclimatized:false}),{sectors:4,allowed:true});
  assert.equal(longRangeSectorSubstitution(661,{acclimatized:false}).allowed,false);

  const incomplete=calculateFdpLimit({
    reportTime:"08:00",
    sectors:2,
    sectorDurationsMinutes:[60],
    crewCount:2
  });
  assert.equal(incomplete.allowed,false);
  assert.equal(incomplete.effectiveSectors,2);

  const missing=calculateFdpLimit({
    reportTime:"08:00",
    sectors:1,
    sectorDurationsMinutes:[],
    crewCount:2
  });
  assert.equal(missing.allowed,false);
  assert.match(missing.reason,/timing is required/i);
});

test("three crew uses the table baseline and four crew cap remains explicit",()=>{
  const threeCrew=calculateFdpLimit({
    reportTime:"08:00",sectors:2,sectorDurationsMinutes:[8*60],crewCount:3
  });
  assert.equal(threeCrew.limitMinutes,795);
  assert.equal(threeCrew.crewCount,3);
  assert.equal(threeCrew.effectiveSectors,2);
  assert.equal(threeCrew.allowed,true);
  const unconfirmedFourCrew=calculateFdpLimit({
    reportTime:"08:00",
    crewCount:4,
    sectors:2,
    sectorDurationsMinutes:[13*60,60]
  });
  assert.equal(unconfirmedFourCrew.allowed,false);
  assert.equal(unconfirmedFourCrew.limitMinutes,null);

  const fourCrew=calculateFdpLimit({
    reportTime:"08:00",
    crewCount:4,
    sectors:1,
    sectorDurationsMinutes:[13*60],
    crewBunkAvailable:true,
    dispatchCrewUsed:false,
    postTripDaysOff:2
  });
  assert.equal(fourCrew.limitMinutes,1020);
  assert.equal(fourCrew.scheduledCap,true);
  assert.equal(fourCrew.allowed,true);
});