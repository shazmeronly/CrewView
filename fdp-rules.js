/**
 * MAB OM-A flight-crew FDP baseline rules.
 *
 * Durations are expressed in minutes.  The module deliberately contains no
 * browser or roster dependencies so it can also be used by validation tools.
 * An FDP starts at report and ends at final on-chocks.
 */

export const FOUR_CREW_LONG_HAUL_SCHEDULED_CAP_MINUTES=17*60;

const MIN_SECTORS=1;
const TABLE_A_MAX_SECTORS=8;
const TABLE_B_MAX_SECTORS=7;

export const TABLE_A_BANDS=Object.freeze([
  {start:"06:00",end:"07:59",limits:[780,735,690,645,600,570,540,540]},
  {start:"08:00",end:"12:59",limits:[840,795,750,705,660,630,600,570]},
  {start:"13:00",end:"17:59",limits:[780,735,690,645,600,570,540,540]},
  {start:"18:00",end:"21:59",limits:[720,675,630,585,540,540,540,540]},
  {start:"22:00",end:"05:59",limits:[660,615,570,540,540,540,540,540]}
]);

export const TABLE_B_REST_BANDS=Object.freeze([
  {minimumMinutes:0,maximumMinutes:18*60,limits:[780,735,690,645,600,570,540],label:"Up to 18 hours or over 30 hours"},
  {minimumMinutes:18*60+1,maximumMinutes:30*60,limits:[690,660,630,585,540,540,540],label:"Between 18 and 30 hours"},
  {minimumMinutes:30*60+1,maximumMinutes:Infinity,limits:[780,735,690,645,600,570,540],label:"Up to 18 hours or over 30 hours"}
]);

function clockMinutes(value){
  const match=String(value??"").match(/^(\d{1,2}):(\d{2})$/);
  if(!match) throw new TypeError("reportTime must be an HH:MM local clock");
  const hours=Number(match[1]);
  const minutes=Number(match[2]);
  if(hours>23 || minutes>59) throw new RangeError("reportTime is not a valid local clock");
  return hours*60+minutes;
}

function bandContains(minutes,band){
  const start=clockMinutes(band.start);
  const end=clockMinutes(band.end);
  return start<=end
    ? minutes>=start && minutes<=end
    : minutes>=start || minutes<=end;
}

export function clampTableSectors(sectors,maxSectors=TABLE_A_MAX_SECTORS){
  const count=Math.trunc(Number(sectors));
  if(!Number.isFinite(count)) throw new TypeError("sectors must be a number");
  return Math.min(maxSectors,Math.max(MIN_SECTORS,count));
}

/**
 * A long-range sector is substituted for the stated number of table sectors.
 * Values exactly at 7, 9 and 11 hours stay in the lower band; “over” is
 * intentional in OM-A.
 */
export function longRangeSectorSubstitution(durationMinutes,{acclimatized=true}={}){
  const duration=Number(durationMinutes);
  if(!Number.isFinite(duration) || duration<0) throw new TypeError("durationMinutes must be a non-negative number");
  if(duration<=7*60) return {sectors:1,allowed:true};
  if(duration<=9*60) return {sectors:acclimatized?2:4,allowed:true};
  if(duration<=11*60) return {sectors:acclimatized?3:4,allowed:true};
  return acclimatized
    ? {sectors:4,allowed:true}
    : {sectors:4,allowed:false,reason:"A two-pilot sector over 11 hours is not allowed when not acclimatized"};
}

export function effectiveSectorCount(
  sectorDurationsMinutes,
  {acclimatized=true,fallbackSectors=1,requireDurations=true}={}
){
  const scheduledSectors=Math.max(MIN_SECTORS,Math.trunc(Number(fallbackSectors)||MIN_SECTORS));
  if(!Array.isArray(sectorDurationsMinutes) || !sectorDurationsMinutes.length){
    return {
      sectors:scheduledSectors,
      allowed:!requireDurations,
      reason:requireDurations
        ? "Scheduled sector timing is required for a two-pilot calculation"
        : ""
    };
  }
  let sectors=0;
  let allowed=sectorDurationsMinutes.length>=scheduledSectors;
  let reason=allowed ? "" : "Scheduled timing is incomplete for one or more sectors";
  sectorDurationsMinutes.forEach(duration=>{
    const substitution=longRangeSectorSubstitution(duration,{acclimatized});
    sectors+=substitution.sectors;
    if(!substitution.allowed){
      allowed=false;
      reason=substitution.reason;
    }
  });
  return {
    sectors:Math.max(scheduledSectors,sectors),
    rawSectors:sectors,
    allowed,
    reason
  };
}

export function tableALimit({reportTime,sectors}){
  const reportMinutes=clockMinutes(reportTime);
  const band=TABLE_A_BANDS.find(candidate=>bandContains(reportMinutes,candidate));
  const tableSectors=clampTableSectors(sectors,TABLE_A_MAX_SECTORS);
  return {
    limitMinutes:band.limits[tableSectors-1],
    table:"A",
    band,
    tableSectors
  };
}

export function tableBLimit({precedingRestMinutes,sectors}){
  const rest=Number(precedingRestMinutes);
  if(!Number.isFinite(rest) || rest<0){
    throw new TypeError("precedingRestMinutes is required for a not-acclimatized calculation");
  }
  const band=TABLE_B_REST_BANDS.find(candidate=>
    rest>=candidate.minimumMinutes && rest<=candidate.maximumMinutes
  );
  const tableSectors=clampTableSectors(sectors,TABLE_B_MAX_SECTORS);
  return {
    limitMinutes:band.limits[tableSectors-1],
    table:"B",
    band,
    tableSectors
  };
}

export function calculateFdpLimit({
  reportTime,
  sectors=1,
  sectorDurationsMinutes=[],
  acclimatized=true,
  precedingRestMinutes,
  crewCount=2,
  crewBunkAvailable=false,
  dispatchCrewUsed=true,
  postTripDaysOff=0
}={}){
  const complement=Number(crewCount);
  if(complement===4){
    const scheduledSectors=Math.max(MIN_SECTORS,Math.trunc(Number(sectors)||MIN_SECTORS));
    const hasSingleLongHaulSector=
      scheduledSectors===1 &&
      Array.isArray(sectorDurationsMinutes) &&
      sectorDurationsMinutes.length===1 &&
      Number(sectorDurationsMinutes[0])>12*60;
    const conditions={
      fourFlightCrew:true,
      singleLongHaulSector:hasSingleLongHaulSector,
      crewBunkAvailable:crewBunkAvailable===true,
      noDispatchCrew:dispatchCrewUsed===false,
      twoPostTripDaysOff:Number(postTripDaysOff)>=2
    };
    const unmet=Object.entries(conditions)
      .filter(([,met])=>!met)
      .map(([condition])=>condition);
    if(unmet.length){
      return {
        limitMinutes:null,
        table:"FOUR_CREW_LONG_HAUL",
        crewCount:4,
        allowed:false,
        reason:`Four-crew 17:00 variation not established: ${unmet.join(", ")}`,
        definition:"Report to final on-chocks",
        scheduledCap:false,
        conditions
      };
    }
    return {
      limitMinutes:FOUR_CREW_LONG_HAUL_SCHEDULED_CAP_MINUTES,
      table:"FOUR_CREW_LONG_HAUL",
      crewCount:4,
      allowed:true,
      definition:"Report to final on-chocks",
      scheduledCap:true,
      conditions
    };
  }
  if(complement!==2 && complement!==3){
    throw new RangeError("crewCount must explicitly be 2, 3 or 4");
  }

  const effective=effectiveSectorCount(complement===2 ? sectorDurationsMinutes : [],{
    acclimatized,
    fallbackSectors:sectors,
    requireDurations:complement===2
  });
  const result=acclimatized
    ? tableALimit({reportTime,sectors:effective.sectors})
    : tableBLimit({precedingRestMinutes,sectors:effective.sectors});

  return {
    ...result,
    allowed:effective.allowed,
    reason:effective.reason||"",
    effectiveSectors:effective.sectors,
    rawEffectiveSectors:effective.rawSectors??effective.sectors,
    acclimatized:Boolean(acclimatized),
    crewCount:complement,
    definition:"Report to final on-chocks",
    fourCrewLongHaulScheduledCapMinutes:FOUR_CREW_LONG_HAUL_SCHEDULED_CAP_MINUTES,
    fourCrewCapApplied:false
  };
}