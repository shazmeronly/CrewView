const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

let bridge=null;
let v200Initialised=false;

function bootCrewViewV200(){
  if(v200Initialised) return;
  bridge=window.CrewViewV200Bridge;
  if(!bridge) return;
  v200Initialised=true;
  initialiseCrewViewV200();
}

window.addEventListener("crewview:ready",bootCrewViewV200);
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",bootCrewViewV200,{once:true});
}else{
  queueMicrotask(bootCrewViewV200);
}

function node(tag,className="",html=""){
  const element=document.createElement(tag);
  if(className) element.className=className;
  if(html) element.innerHTML=html;
  return element;
}

function brandMark(className=""){
  return `<span class="cv-approved-mark ${className}" aria-hidden="true"><img src="crewview-mark-final.png" alt=""></span>`;
}

function shellHasRoster(){
  if(document.body.classList.contains("roster-loaded")) return true;
  const rows=bridge.getRows?.()||[];
  return rows.some(row=>
    ["date","item","dutyStart","dep","arr"].some(key=>String(row?.[key]||"").trim())
  );
}

function icon(name){
  const paths={
    today:'<path d="M3 10.8 12 3l9 7.8v8.7a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5Z"/>',
    roster:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    timeline:'<path d="M5 4v16M5 7h8l2 2h4M5 13h6l2 2h6M5 19h10"/><circle cx="5" cy="7" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="5" cy="19" r="1.5"/>',
    earnings:'<path d="M5 7.5h14v11H5z"/><path d="M7 7.5V5h10v2.5M8 13h8M9.5 10.5h5"/>',
    profile:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    upload:'<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    pdf:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M8.5 16h7M8.5 12h4"/>',
    arrow:'<path d="m9 18 6-6-6-6"/>',
    plane:'<path d="m3 11 8.5-2.5L16 3l2 1-2.5 6 4.5 2-1 2-5-.5-3 5-1.7-.8.7-5.2-6 1.5Z"/>',
    shield:'<path d="M12 3 5 6v5c0 4.7 2.8 8.5 7 10 4.2-1.5 7-5.3 7-10V6Z"/><path d="m9 12 2 2 4-4"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.arrow}</svg>`;
}

function sectionHeading(eyebrow,title,copy){
  return `<div class="cv-screen-heading"><div><small>${eyebrow}</small><h2>${title}</h2><p>${copy}</p></div></div>`;
}

function ensureDutyEnhancementMarkup(){
  const overview=$("#dutyDetailOverviewPanel");
  const detailGrid=overview?.querySelector(".duty-detail-grid");
  if(overview && !$("#detailFtlSummary")){
    overview.insertAdjacentHTML("afterbegin",`
      <section class="duty-ftl-summary" id="detailFtlSummary">
        <div class="duty-ftl-head"><span><small>AUTOMATIC FTL / FDP</small><strong id="detailFtlStatus">—</strong></span><em id="detailFtlAssumption">—</em></div>
        <div class="duty-ftl-metrics">
          <div><small>FTL LIMIT</small><strong id="detailFtlLimit">—</strong></div>
          <div><small>PLANNED FDP</small><strong id="detailPlannedFdp">—</strong></div>
          <div id="detailFtlMarginCell"><small>SPARE / OVERRUN</small><strong id="detailFtlMargin">—</strong></div>
        </div>
        <p id="detailFtlMeta">Report to final scheduled on-chocks.</p>
      </section>`);
  }
  if(detailGrid && !$("#detailLayoverSummary")){
    detailGrid.insertAdjacentHTML("afterend",`
      <section class="duty-layover-summary hidden" id="detailLayoverSummary">
        <div><small>DESTINATION LAYOVER</small><strong id="detailLayoverDestination">—</strong><span id="detailLayoverDuration">—</span></div>
        <div><small>HOTEL</small><strong id="detailHotel">—</strong><span id="detailNextReport">—</span></div>
      </section>`);
  }

  const earningsTotal=$("#dutyDetailEarningsPanel .duty-earnings-total");
  if(earningsTotal && !$("#detailOver80Allowance")){
    earningsTotal.insertAdjacentHTML("beforebegin",`
      <article class="duty-earnings-card over80">
        <div><small>80+ BLOCK-HOUR CONTRIBUTION</small><strong id="detailOver80Allowance">RM0.00</strong></div>
        <p id="detailOver80Formula">No block time from this duty falls above 80:00.</p>
      </article>`);
    const description=earningsTotal.querySelector("span");
    if(description) description.textContent="Productivity + 80+ contribution + layover";
  }

  const calendarMeta=$("#calendarSelected .v125-meta-grid");
  if(calendarMeta && !$("#selectedFtlSummary")){
    calendarMeta.insertAdjacentHTML("afterend",`
      <div class="selected-ftl-summary" id="selectedFtlSummary">
        <span><small>FTL LIMIT</small><strong id="selectedFtlLimit">—</strong></span>
        <span><small>PLANNED FDP</small><strong id="selectedPlannedFdp">—</strong></span>
        <span><small>SPARE / OVERRUN</small><strong id="selectedFtlMargin">—</strong></span>
      </div>`);
  }
}

function initialiseCrewViewV200(){
  document.body.classList.add("cv-v200");
  reconcileOverlayState();
  ensureDutyEnhancementMarkup();

  const main=$("body > main");
  const legacyHeader=$("body > header");
  const footer=$("body > footer");
  if(!main) return;

  const appBar=node("header","cv-appbar");
  appBar.id="cvAppBar";
  appBar.innerHTML=`
    <button type="button" class="cv-brand-button" id="cvBrandHome" aria-label="Open Today">
      ${brandMark("cv-appbar-mark")}
      <span class="cv-brand-word"><b>Crew</b><strong>View</strong></span>
    </button>
    <div class="cv-appbar-title"><small id="cvAppEyebrow">CREW COMPANION</small><strong id="cvAppTitle">Today</strong></div>
    <div class="cv-appbar-actions" id="cvAppBarActions"></div>`;

  main.before(appBar);
  main.classList.add("cv-app-main");
  legacyHeader?.classList.add("cv-legacy-header");

  const appBarActions=$("#cvAppBarActions",appBar);
  const loadedActions=$("#loadedRosterActions");
  const themeToggle=$("#themeToggle");
  if(loadedActions) appBarActions.append(loadedActions);
  if(themeToggle) appBarActions.append(themeToggle);

  const deck=node("div","cv-screen-deck");
  deck.id="cvScreenDeck";

  const today=makeTodayScreen();
  const roster=makeRosterScreen();
  const timeline=makeTimelineScreen();
  const earnings=makeEarningsScreen();
  const profile=makeProfileScreen();
  const screens={today,roster,timeline,earnings,profile};
  Object.values(screens).forEach(screen=>deck.append(screen));
  main.prepend(deck);

  // Mount the primary navigation before moving the legacy views. If Safari
  // restores an interrupted page, the user must never be left on a single
  // screen without a way to reach the other four sections.
  const bottomNav=makeBottomNav();
  main.after(bottomNav);
  wireNavigation(screens,bottomNav);

  moveExistingContent(screens,footer);
  wireDutyDetails();
  wireQuickActions();
  startDataSync();

  const initialLoaded=shellHasRoster();
  routeTo("today",{rosterMode:"classic",remember:false,scroll:false});

  let hadRoster=initialLoaded;
  new MutationObserver(()=>{
    const hasRoster=shellHasRoster();
    document.body.classList.toggle("cv-has-roster",hasRoster);
    refreshShellData();
    if(hasRoster!==hadRoster){
      routeTo("today",{rosterMode:"classic",remember:false});
      hadRoster=hasRoster;
    }
  }).observe(document.body,{attributes:true,attributeFilter:["class"]});

  window.addEventListener("crewview:view-changed",event=>{
    const view=event.detail?.view;
    if(view==="classic"||view==="calendar"){
      localStorage.setItem("crewview-v200-roster-mode",view);
      syncRosterModeButtons(view);
      if(view==="classic") fitClassicAfterReveal();
    }
  });

  window.addEventListener("pageshow",()=>{
    reconcileOverlayState();
    ensureBottomNavMounted(main,bottomNav);
    if(document.body.dataset.appTab==="roster"&&bridge.currentRosterView()==="classic"){
      fitClassicAfterReveal();
    }
  });
}

function reconcileOverlayState(){
  const dutySheet=$("#dutyDetailSheet");
  const dutyOpen=Boolean(dutySheet&&!dutySheet.classList.contains("hidden"));
  document.body.classList.toggle("duty-details-open",dutyOpen);

  const calendarSheet=$("#calendarDetailBackdrop");
  const calendarOpen=Boolean(calendarSheet&&!calendarSheet.classList.contains("hidden"));
  document.body.classList.toggle("calendar-detail-open",calendarOpen);
}

function ensureBottomNavMounted(main,bottomNav){
  if(!bottomNav.isConnected) main.after(bottomNav);
  bottomNav.hidden=false;
  bottomNav.removeAttribute("aria-hidden");
}

function makeTodayScreen(){
  const screen=node("section","cv-app-screen cv-today-screen");
  screen.dataset.appScreen="today";
  screen.innerHTML=`
    ${sectionHeading("TODAY","Your duty at a glance","Smart Duty, actual times and estimated allowances in one place.")}
    <article class="cv-empty-roster" id="cvEmptyRoster">
      ${brandMark("cv-empty-mark")}
      <small>WELCOME TO CREWVIEW</small>
      <h3>Bring your roster to life.</h3>
      <p>Your PDF stays on this device. Load it once to unlock Classic, Calendar, Timeline, Smart Duty and Allowances.</p>
      <label class="btn primary" id="cvEmptyLoad" for="pdfInput" role="button">${icon("upload")} Load Current Roster</label>
    </article>
    <section class="cv-today-after-duty" id="cvTodayAfterDuty">
      <article class="cv-ftl-card hidden" id="cvTodayFtl">
        <div class="cv-ftl-heading"><span><small>AUTOMATIC FTL BASELINE</small><strong id="cvFtlStatus">Table A</strong></span><em id="cvFtlAssumption">Acclimatized assumed</em></div>
        <div class="cv-ftl-grid">
          <div><small>FTL LIMIT</small><strong id="cvFtlLimit">—</strong></div>
          <div><small>PLANNED FDP</small><strong id="cvFtlPlanned">—</strong></div>
          <div id="cvFtlMarginCell"><small>SPARE / OVERRUN</small><strong id="cvFtlMargin">—</strong></div>
        </div>
        <p id="cvFtlNote">Report to final scheduled on-chocks.</p>
      </article>
      <button type="button" class="cv-estimate-card" id="cvTodayEstimate">
        <span class="cv-estimate-icon">${icon("earnings")}</span>
        <span><small>ESTIMATED FOR THIS DUTY</small><strong id="cvTodayEstimateTotal">RM0.00</strong><em id="cvTodayEstimateParts">Productivity RM0.00 · Layover RM0.00</em></span>
        <b>${icon("arrow")}</b>
      </button>
      <div class="cv-today-stats">
        <article><small>BLOCK THIS MONTH</small><strong id="cvTodayBlock">00:00</strong></article>
        <article><small>DUTY HOURS</small><strong id="cvTodayDuty">00:00</strong></article>
        <article><small>OFF DAYS</small><strong id="cvTodayOff">0</strong></article>
      </div>
      <div class="cv-quick-actions">
        <button type="button" data-quick-route="roster">${icon("roster")}<span><strong>Open roster</strong><small>Classic or Calendar</small></span>${icon("arrow")}</button>
        <button type="button" data-quick-route="earnings">${icon("earnings")}<span><strong>Month statement</strong><small>Productivity and layovers</small></span>${icon("arrow")}</button>
      </div>
    </section>`;
  return screen;
}

function makeRosterScreen(){
  const screen=node("section","cv-app-screen cv-roster-screen hidden");
  screen.dataset.appScreen="roster";
  screen.innerHTML=`
    ${sectionHeading("LOADED ROSTER","Roster","A clear daily list in Classic or a visual month in Calendar.")}
    <button type="button" class="cv-roster-duty-strip hidden" id="cvRosterDutyStrip">
      <span class="cv-duty-strip-icon">${icon("plane")}</span>
      <span><small id="cvRosterDutyState">NEXT DUTY</small><strong><b id="cvRosterDutyItem">—</b> <em id="cvRosterDutyRoute">—</em></strong><span id="cvRosterDutyMeta">Report — · —</span></span>
      <i>${icon("arrow")}</i>
    </button>
    <section class="cv-roster-profile" id="cvRosterProfile">
      <span class="cv-avatar" id="cvRosterAvatar">CV</span>
      <span><strong id="cvRosterName">Crew Member</strong><small id="cvRosterMeta">Roster profile</small></span>
      <b id="cvRosterBlockBadge">00:00 block</b>
    </section>`;
  return screen;
}

function makeTimelineScreen(){
  const screen=node("section","cv-app-screen cv-timeline-screen hidden");
  screen.dataset.appScreen="timeline";
  screen.innerHTML=sectionHeading("TRIP FLOW","Timeline","Follow each duty, sector and layover in chronological order.");
  return screen;
}

function makeEarningsScreen(){
  const screen=node("section","cv-app-screen cv-earnings-screen hidden");
  screen.dataset.appScreen="earnings";
  screen.innerHTML=sectionHeading("ROSTER ESTIMATE","Earnings","Review productivity, block-hour and layover allowance estimates.");
  return screen;
}

function makeProfileScreen(){
  const screen=node("section","cv-app-screen cv-profile-screen hidden");
  screen.dataset.appScreen="profile";
  screen.innerHTML=`
    ${sectionHeading("CREWVIEW","Profile & Settings","Manage your roster, appearance, export and on-device information.")}
    <section class="cv-profile-identity">
      ${brandMark("cv-profile-mark")}
      <span><strong id="cvProfileName">Crew Member</strong><small id="cvProfileMeta">No roster loaded</small></span>
    </section>
    <section class="cv-profile-actions" id="cvProfileActions">
      <button type="button" id="cvProfileTheme"><span class="cv-setting-icon">◐</span><span><strong>Appearance</strong><small id="cvProfileThemeText">Follow device or choose manually</small></span>${icon("arrow")}</button>
      <button type="button" id="cvProfileExport"><span class="cv-setting-icon">${icon("pdf")}</span><span><strong>Export PDF</strong><small>Roster and allowance report</small></span>${icon("arrow")}</button>
    </section>
    <section class="cv-privacy-card">${icon("shield")}<span><strong>Private by design</strong><small>Roster parsing and saved operational times remain on this device.</small></span></section>`;
  return screen;
}

function moveExistingContent(screens,footer){
  // Keep the native picker outside the hidden legacy upload card. iOS Safari
  // can refuse a file dialog when its input is inside a hidden ancestor.
  const pdfInput=$("#pdfInput");
  if(pdfInput) document.body.append(pdfInput);

  const nextDuty=$("#nextDutyCard");
  const todayAfter=$("#cvTodayAfterDuty",screens.today);
  if(nextDuty) screens.today.insertBefore(nextDuty,todayAfter);

  const rosterMode=$("#viewSwitcher");
  const compactProfile=$("#compactProfile");
  const classic=$("#classicView");
  const calendar=$("#calendarView");
  [rosterMode,compactProfile,classic,calendar].filter(Boolean).forEach(element=>screens.roster.append(element));

  const resultCard=$("#resultCard");
  const tableWrap=$("#tableWrap");
  if(resultCard&&tableWrap&&!$("#cvClassicCompact")){
    const compact=node("section","cv-classic-compact");
    compact.id="cvClassicCompact";
    compact.innerHTML=`
      <div class="cv-classic-head" aria-hidden="true">
        <span>DATE</span><span>DUTY / ROUTE</span><span>REPORT</span><span>TIMES</span><span>BLOCK</span>
      </div>
      <div class="cv-classic-rows" id="cvClassicRows"></div>`;
    resultCard.insertBefore(compact,tableWrap);
  }

  const calendarGrid=$("#calendarGrid");
  if(calendarGrid&&!$("#cvCalendarInline")){
    const inline=node("button","cv-calendar-inline hidden");
    inline.id="cvCalendarInline";
    inline.type="button";
    calendarGrid.after(inline);
  }

  const timeline=$("#timelineView");
  if(timeline) screens.timeline.append(timeline);

  const pay=$("#payView");
  if(pay) screens.earnings.append(pay);

  const upload=$("#uploadCard");
  if(upload) screens.profile.append(upload);

  const printButton=$("#printBtn");
  if(printButton){
    printButton.classList.add("cv-profile-export-source");
    printButton.hidden=true;
    screens.profile.append(printButton);
  }
  if(footer) footer.classList.add("cv-legacy-footer");
}

function makeBottomNav(){
  const nav=node("nav","cv-bottom-nav");
  nav.id="cvBottomNav";
  nav.setAttribute("aria-label","CrewView navigation");
  const tabs=[
    ["today","Today"],
    ["roster","Roster"],
    ["timeline","Timeline"],
    ["earnings","Earnings"],
    ["profile","Profile"]
  ];
  nav.innerHTML=tabs.map(([key,label])=>`<button type="button" data-app-tab="${key}" aria-label="${label}">${icon(key)}<span>${label}</span></button>`).join("");
  return nav;
}

function wireNavigation(screens,bottomNav){
  $$("[data-app-tab]",bottomNav).forEach(button=>button.addEventListener("click",()=>routeTo(button.dataset.appTab)));
  $("#cvBrandHome")?.addEventListener("click",()=>routeTo("today"));

  $$("#viewSwitcher .view-tab[data-view]").forEach(button=>{
    if(button.dataset.view==="classic"||button.dataset.view==="calendar"){
      button.addEventListener("click",()=>localStorage.setItem("crewview-v200-roster-mode",button.dataset.view));
    }
  });

  $("#cvRosterDutyStrip")?.addEventListener("click",()=>{
    routeTo("today");
    requestAnimationFrame(()=>$("#nextDutyCard")?.scrollIntoView({behavior:"smooth",block:"start"}));
  });
}

function routeTo(tab,{rosterMode,remember=true,scroll=true}={}){
  if(!["today","roster","timeline","earnings","profile"].includes(tab)) tab="today";
  let activeRosterMode=null;

  // The legacy view layer uses a short transition lock. Bottom navigation is
  // intentionally immediate, including when a crew member taps two tabs fast.
  document.body.classList.remove("view-switching","view-switch-cover");

  if(tab==="roster"){
    const mode=rosterMode||localStorage.getItem("crewview-v200-roster-mode")||"classic";
    activeRosterMode=mode==="calendar"?"calendar":"classic";
    bridge.switchRosterView(activeRosterMode);
    syncRosterModeButtons(activeRosterMode);
  }else if(tab==="timeline"){
    bridge.switchRosterView("timeline");
    bridge.renderTimelineView();
  }else if(tab==="earnings"){
    bridge.switchRosterView("pay");
    bridge.renderPayView();
  }else if(["calendar","timeline","pay"].includes(bridge.currentRosterView())){
    bridge.switchRosterView("classic");
  }

  document.body.dataset.appTab=tab;
  $$("[data-app-screen]").forEach(screen=>screen.classList.toggle("hidden",screen.dataset.appScreen!==tab));
  if(tab==="roster"&&activeRosterMode==="classic") fitClassicAfterReveal();
  $$("#cvBottomNav [data-app-tab]").forEach(button=>{
    const active=button.dataset.appTab===tab;
    button.classList.toggle("active",active);
    button.setAttribute("aria-current",active?"page":"false");
  });

  const labels={
    today:["CREW COMPANION","Today"],
    roster:["YOUR MONTH","Roster"],
    timeline:["TRIP FLOW","Timeline"],
    earnings:["ROSTER ESTIMATE","Earnings"],
    profile:["CREWVIEW","Profile"]
  };
  $("#cvAppEyebrow").textContent=labels[tab][0];
  $("#cvAppTitle").textContent=labels[tab][1];
  if(remember) localStorage.setItem("crewview-v200-app-tab",tab);
  if(scroll) window.scrollTo({top:0,left:0,behavior:"auto"});
  refreshShellData();
}

function fitClassicAfterReveal(){
  requestAnimationFrame(()=>bridge.fitClassicView?.());
}

function syncRosterModeButtons(view){
  $$("#viewSwitcher .view-tab[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
}

function wireQuickActions(){
  $$("[data-quick-route]").forEach(button=>button.addEventListener("click",()=>routeTo(button.dataset.quickRoute)));
  $("#cvTodayEstimate")?.addEventListener("click",()=>{
    const duty=bridge.activeDuty();
    if(duty){
      bridge.openDutyDetailsFor(duty);
      requestAnimationFrame(()=>selectDutyDetailTab("earnings"));
    }else{
      routeTo("earnings");
    }
  });
  $("#cvProfileTheme")?.addEventListener("click",()=>$("#themeToggle")?.click());
  $("#cvProfileExport")?.addEventListener("click",()=>bridge.saveCrewViewPdfDirect());
  $("#cvClassicRows")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-classic-row]");
    const row=button?classicRenderedRows[Number(button.dataset.classicRow)]:null;
    if(row&&!button.disabled) bridge.openDutyDetailsFor(row);
  });
  $("#cvCalendarInline")?.addEventListener("click",()=>{
    if(calendarInlineDuty) bridge.openDutyDetailsFor(calendarInlineDuty);
  });
}

function wireDutyDetails(){
  $$("[data-duty-detail-tab]").forEach(button=>button.addEventListener("click",()=>{
    const tab=button.dataset.dutyDetailTab;
    if(tab==="actuals"){
      bridge.closeDutyDetails();
      routeTo("today");
      bridge.setSmartDutyExpanded(true);
      requestAnimationFrame(()=>$("#nextDutyCard")?.scrollIntoView({behavior:"smooth",block:"start"}));
      return;
    }
    selectDutyDetailTab(tab);
  }));

  $("#detailMonthStatement")?.addEventListener("click",()=>{
    bridge.closeDutyDetails();
    routeTo("earnings");
  });
}

function selectDutyDetailTab(tab){
  const selected=tab==="earnings"?"earnings":"overview";
  $$("[data-duty-detail-tab]").forEach(button=>{
    const active=button.dataset.dutyDetailTab===selected;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  $("#dutyDetailOverviewPanel")?.classList.toggle("hidden",selected!=="overview");
  $("#dutyDetailEarningsPanel")?.classList.toggle("hidden",selected!=="earnings");
}

function startDataSync(){
  const sources=[
    $("#nextDutyCard"),
    $("#profileForm"),
    $("#payView"),
    $("#tableWrap"),
    $("#calendarView"),
    $("#fh"),
    $("#dh"),
    $("#off")
  ].filter(Boolean);
  const observer=new MutationObserver(scheduleRefresh);
  sources.forEach(source=>observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class","value"]}));
  window.addEventListener("crewview:theme-changed",scheduleRefresh);
  window.addEventListener("crewview:ready",settleShellData);
  window.addEventListener("crewview:roster-state",settleShellData);
  window.addEventListener("crewview:active-duty-changed",settleShellData);
  window.addEventListener("crewview:view-changed",scheduleRefresh);
  window.addEventListener("crewview:calendar-selection",event=>renderCalendarInline(event.detail?.row||null));
  settleShellData();
}

let refreshFrame=0;
let classicRenderedRows=[];
let calendarInlineDuty=null;
function scheduleRefresh(){
  cancelAnimationFrame(refreshFrame);
  refreshFrame=requestAnimationFrame(refreshShellData);
}

function settleShellData(){
  scheduleRefresh();
  [80,300,900].forEach(delay=>setTimeout(scheduleRefresh,delay));
}

function text(id,fallback="—"){
  const value=$("#"+id)?.textContent?.trim();
  return value||fallback;
}

function input(id,fallback=""){
  const value=$("#"+id)?.value?.trim();
  return value||fallback;
}

function initials(name){
  const letters=String(name||"").trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase();
  return letters||"CV";
}

function rmNumber(value){
  const number=Number(String(value||"").replace(/[^0-9.-]/g,""));
  return Number.isFinite(number)?number:0;
}

function money(value){
  return `RM${Number(value||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}

function durationMinutes(value){
  const match=String(value||"").match(/(-?\d+):(\d{2})/);
  if(!match) return 0;
  const sign=Number(match[1])<0?-1:1;
  return sign*(Math.abs(Number(match[1]))*60+Number(match[2]));
}

function durationLabel(minutes){
  const absolute=Math.abs(Math.round(Number(minutes)||0));
  return `${String(Math.floor(absolute/60)).padStart(2,"0")}:${String(absolute%60).padStart(2,"0")}`;
}

function rosterDate(value){
  const raw=String(value||"").trim();
  const match=raw.match(/(\d{1,2})[-\s/]([A-Za-z]{3,9}|\d{1,2})[-\s/](\d{4})/);
  if(match){
    const months=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const month=/^\d+$/.test(match[2])?Number(match[2])-1:months.indexOf(match[2].slice(0,3).toUpperCase());
    if(month>=0) return new Date(Number(match[3]),month,Number(match[1]));
  }
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?null:parsed;
}

function clockFrom(value){
  const matches=String(value||"").match(/\b\d{1,2}:\d{2}\b/g);
  return matches?.at(-1)||"—";
}

function airportFrom(value){
  return String(value||"").trim().match(/\b[A-Z]{3}\b/i)?.[0]?.toUpperCase()||"";
}

function routeFor(row){
  const airports=(row?._routeAirports||[]).filter(Boolean);
  if(airports.length>1) return airports.join(" → ");
  const departure=airportFrom(row?.dep);
  const arrival=airportFrom(row?._arrival||row?.arr);
  return departure&&arrival?`${departure} → ${arrival}`:(departure||arrival||"");
}

function categoryFor(row){
  if(row?._calendarCategory) return row._calendarCategory;
  if(row?._layoverDay) return "layover";
  if(row?._overnightContinuation) return "continuation";
  const item=String(row?.item||"").trim().toUpperCase();
  const work=String(row?.work||"").trim().toUpperCase();
  if(row?._syntheticCalendarRow&&!item&&!row?.dep&&!row?.arr) return "empty";
  if(["D","DO","DO1","OFF"].includes(item)||(!item&&!row?.dep&&!row?.arr)) return "off";
  if(/\b(AL|CL|EL|MC|ML|PL|UL)\b|LEAVE/.test(item)) return "leave";
  if(/STBY|STANDBY|SBY|RSV|ASB|HSB/.test(item)) return "standby";
  if(/SIM|DSA|TRAIN|OPC|GROUND|COURSE|ETOPS|LVO/.test(item)) return "training";
  if(work==="PS"||/POSITION|PAX/.test(item)) return "positioning";
  if(routeFor(row)||durationMinutes(row?.block)>0||/^[A-Z]{2}\d+/.test(item)) return "flight";
  return "admin";
}

function categoryName(category){
  return ({flight:"Flight",positioning:"Positioning",standby:"Standby",training:"Training",simulator:"Simulator",layover:"Layover",continuation:"Arrival",leave:"Leave",off:"Off",empty:"No roster entry",admin:"Duty"})[category]||"Duty";
}

function rowTitle(row){
  const category=categoryFor(row);
  const item=String(row?._displayItems||row?.item||"").trim();
  if(category==="empty") return "—";
  if(category==="off") return "OFF DAY";
  if(category==="layover") return `${row?._layoverAirport||airportFrom(row?.arr||row?.dep)||"OUTSTATION"} LAYOVER`;
  return item||categoryName(category).toUpperCase();
}

function rowDateLabel(row){
  const date=rosterDate(row?.date);
  if(!date) return escapeHtml(row?.date||"—");
  return `<b>${date.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase()}</b><strong>${String(date.getDate()).padStart(2,"0")}</strong>`;
}

function compactRouteFor(row){
  const airports=(row?._routeAirports||[]).filter(Boolean);
  if(airports.length>1) return airports.join("–");
  const departure=airportFrom(row?.dep);
  const arrival=airportFrom(row?._arrival||row?.arr);
  return departure&&arrival?`${departure}–${arrival}`:(departure||arrival||"");
}

function compactDutyTitle(row){
  const category=categoryFor(row);
  const raw=String(row?._displayItems||row?.item||"").trim().toUpperCase();
  if(category==="empty") return "—";
  if(category==="off") return "OFF";
  if(category==="layover") return `${row?._layoverAirport||airportFrom(row?.arr||row?.dep)||"OUTSTATION"} LAYOVER`;
  if(category==="leave") return /LEAVE/.test(raw)?raw:`${raw||"AL"} LEAVE`;
  if(category==="training") return /TRAIN/.test(raw)?raw:`${raw||"SIM"} TRAINING`;
  if(category==="standby") return raw||"STBY";
  return raw||categoryName(category).toUpperCase();
}

function compactRowTimes(row,category){
  if(category==="layover") return String(row?._hotel||"").trim()||"Hotel not listed";
  if(["off","leave","empty"].includes(category)) return "—";
  const start=clockFrom(row?.dep||row?.dutyStart);
  const end=clockFrom(row?._arrival||row?.arr);
  return start!=="—"&&end!=="—"?`${start} → ${end}`:"—";
}

function compactRowReport(row,category){
  return ["flight","positioning","admin"].includes(category)
    ? String(row?.dutyStart||"—")
    : "—";
}

function compactRowBlock(row,category){
  let value=String(row?.block||"").trim();
  if(category==="standby"&&durationMinutes(value)<=0) value=String(row?.duty||"").trim();
  if(["layover","leave","off","training","empty"].includes(category)||durationMinutes(value)<=0) return "—";
  return value.replace(/^0(?=\d:)/,"");
}

function airportForLayover(rows,index,row){
  const explicit=airportFrom(row?._arrival||row?.arr||row?.dep);
  if(explicit) return explicit;
  let previous="";
  let next="";
  for(let cursor=index-1;cursor>=0&&!previous;cursor-=1){
    previous=airportFrom(rows[cursor]?._arrival||rows[cursor]?.arr);
  }
  for(let cursor=index+1;cursor<rows.length&&!next;cursor+=1){
    next=airportFrom(rows[cursor]?.dep);
  }
  return previous&&next&&previous===next?previous:(previous||next||"");
}

function hotelForLayover(rows,index,row,airport){
  if(String(row?._hotel||"").trim()) return row._hotel;
  for(let cursor=index-1;cursor>=0;cursor-=1){
    const candidate=rows[cursor];
    const hotel=String(candidate?._hotel||"").trim();
    if(!hotel) continue;
    const destination=airportFrom(candidate?._arrival||candidate?.arr);
    if(!airport||!destination||destination===airport) return hotel;
  }
  return "";
}

function compactDutyRows(rows){
  const output=[];
  const handledGroups=new Set();
  rows.forEach((row,index)=>{
    if(!String(row?.date||"").trim()) return;
    if(row._overnightContinuation&&!row._layoverDay) return;
    if(row._layoverDay){
      const airport=airportForLayover(rows,index,row);
      output.push({...row,_layoverAirport:airport,_hotel:hotelForLayover(rows,index,row,airport)});
      return;
    }
    if(!row._dutyGroup){
      output.push({...row});
      return;
    }
    if(handledGroups.has(row._dutyGroup)) return;
    handledGroups.add(row._dutyGroup);
    const group=rows.filter(item=>item._dutyGroup===row._dutyGroup&&!item._overnightContinuation);
    const flights=group.filter(item=>["flight","positioning"].includes(categoryFor(item)));
    if(!flights.length){
      output.push({...row});
      return;
    }
    const first=flights[0];
    const last=flights.at(-1);
    const airports=[];
    const origin=airportFrom(first.dep);
    if(origin) airports.push(origin);
    flights.forEach(item=>{
      const arrival=airportFrom(item.arr);
      if(arrival&&airports.at(-1)!==arrival) airports.push(arrival);
    });
    const block=flights.reduce((sum,item)=>sum+durationMinutes(item.block),0);
    output.push({
      ...first,
      _displayItems:flights.map(item=>item.item).filter(Boolean).join(" · "),
      _routeAirports:airports,
      _arrival:last.arr||first.arr,
      block:block?durationLabel(block):first.block
    });
  });
  return output;
}

function renderClassicCompact(rows){
  const container=$("#cvClassicRows");
  if(!container) return;
  classicRenderedRows=rows.filter(row=>String(row?.date||"").trim()).slice(0,70);
  if(!classicRenderedRows.length){
    container.innerHTML='<p class="cv-empty-list">Load a roster to view Classic.</p>';
    return;
  }
  container.innerHTML=classicRenderedRows.map((row,index)=>{
    const category=categoryFor(row);
    const route=compactRouteFor(row);
    const secondary=category==="flight"||category==="positioning"
      ? route
      : category==="standby"
        ? compactRowTimes(row,category).replaceAll(":","").replace(" → ","–")
        : "";
    const disabled=["off","empty","layover","leave"].includes(category);
    return `<button type="button" class="cv-classic-row ${category}" data-classic-row="${index}" ${disabled?"disabled":""}>
      <span class="cv-classic-date">${rowDateLabel(row)}</span>
      <span class="cv-classic-duty"><strong>${escapeHtml(compactDutyTitle(row))}</strong>${secondary?`<small>${escapeHtml(secondary)}</small>`:""}</span>
      <span class="cv-classic-report">${escapeHtml(compactRowReport(row,category))}</span>
      <span class="cv-classic-times">${escapeHtml(compactRowTimes(row,category))}</span>
      <span class="cv-classic-block">${escapeHtml(compactRowBlock(row,category))}</span>
    </button>`;
  }).join("");
}

function renderCalendarInline(row){
  const panel=$("#cvCalendarInline");
  calendarInlineDuty=row;
  if(!panel) return;
  panel.classList.toggle("hidden",!row);
  if(!row) return;
  const category=categoryFor(row);
  const date=rosterDate(row.date);
  const dateLabel=date?date.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}):row.date||"Selected duty";
  panel.className=`cv-calendar-inline ${category}`;
  panel.innerHTML=`<span class="cv-calendar-inline-copy"><small>${escapeHtml(dateLabel)}</small><strong>${escapeHtml(rowTitle(row))}<em>${escapeHtml(routeFor(row))}</em></strong><span><b>Report ${escapeHtml(row.dutyStart||"—")}</b><b>Depart ${escapeHtml(clockFrom(row.dep))}</b><b>Arrive ${escapeHtml(clockFrom(row._arrival||row.arr))}</b></span></span><i>${category==="flight"?icon("plane"):icon("arrow")}</i>`;
}

function rosterTotals(rows){
  let blockMinutes=0;
  let dutyMinutes=0;
  const rowsByDate=new Map();

  rows.forEach(row=>{
    if(!row) return;
    blockMinutes+=durationMinutes(row.block);
    dutyMinutes+=durationMinutes(row.duty);
    const date=String(row.date||"").trim();
    if(!date) return;
    if(!rowsByDate.has(date)) rowsByDate.set(date,[]);
    rowsByDate.get(date).push(row);
  });

  let offDays=0;
  rowsByDate.forEach(dateRows=>{
    const items=dateRows
      .filter(row=>!row._overnightContinuation)
      .map(row=>String(row.item||"").trim().toUpperCase());
    const hasOff=items.some(item=>["D","DO","DO1","OFF"].includes(item));
    const hasDuty=items.some(item=>item&&!["D","DO","DO1","OFF"].includes(item));
    if(hasOff&&!hasDuty) offDays+=1;
  });

  return {blockMinutes,dutyMinutes,offDays};
}

function duration(minutes,{signed=false}={}){
  if(!Number.isFinite(Number(minutes))) return "—";
  const value=Math.round(Number(minutes));
  const sign=signed?(value<0?"−":"+"):"";
  const absolute=Math.abs(value);
  return `${sign}${String(Math.floor(absolute/60)).padStart(2,"0")}:${String(absolute%60).padStart(2,"0")}`;
}

function refreshShellData(){
  const hasRoster=shellHasRoster();
  document.body.classList.toggle("cv-has-roster",hasRoster);
  $("#cvEmptyRoster")?.classList.toggle("hidden",hasRoster);
  $("#cvTodayAfterDuty")?.classList.toggle("hidden",!hasRoster);

  const name=input("name","Crew Member");
  const rank=input("rank","");
  const fleet=input("fleet","");
  const base=input("base","");
  const meta=[fleet,rank,base].filter(Boolean).join(" · ")||"Roster profile";
  const rows=bridge.getRows?.()||[];
  const totals=rosterTotals(rows);
  const sourceBlock=text("fh","00:00");
  const sourceDuty=text("dh","00:00");
  const sourceOff=Number(text("off","0"));
  const block=durationMinutes(sourceBlock)>0?sourceBlock:durationLabel(totals.blockMinutes);
  const duty=durationMinutes(sourceDuty)>0?sourceDuty:durationLabel(totals.dutyMinutes);
  const off=sourceOff>0?String(sourceOff):String(totals.offDays);

  $("#cvRosterName").textContent=name;
  $("#cvRosterMeta").textContent=meta;
  $("#cvRosterAvatar").textContent=initials(name);
  $("#cvRosterBlockBadge").textContent=`${block} block`;
  $("#cvProfileName").textContent=name;
  $("#cvProfileMeta").textContent=hasRoster?meta:"No roster loaded";
  $("#cvTodayBlock").textContent=block;
  $("#cvTodayDuty").textContent=duty;
  $("#cvTodayOff").textContent=off;
  renderClassicCompact(compactDutyRows(rows));

  const selectedDuty=bridge.activeDuty?.();
  const productValue=selectedDuty?Number(bridge.productivityAllowanceForDuty?.(selectedDuty)||0):0;
  const layoverValue=selectedDuty?Number(bridge.layoverForDuty?.(selectedDuty)?.amount||0):0;
  const product=money(productValue);
  const layover=money(layoverValue);
  $("#cvTodayEstimateTotal").textContent=money(productValue+layoverValue);
  $("#cvTodayEstimateParts").textContent=`Productivity ${product} · Layover ${layover}`;

  const fdp=selectedDuty ? bridge.automaticFdpForDuty?.(selectedDuty) : null;
  const ftlCard=$("#cvTodayFtl");
  ftlCard?.classList.toggle("hidden",!fdp);
  if(fdp){
    $("#cvFtlStatus").textContent=fdp.applicable
      ? (fdp.allowed===false?"NOT ALLOWED":`Table ${fdp.table}`)
      : "NOT APPLICABLE";
    $("#cvFtlAssumption").textContent=fdp.assumption||"";
    $("#cvFtlLimit").textContent=fdp.applicable?duration(fdp.limitMinutes):"—";
    $("#cvFtlPlanned").textContent=fdp.applicable?duration(fdp.plannedMinutes):"—";
    $("#cvFtlMargin").textContent=fdp.applicable?duration(fdp.spareMinutes,{signed:true}):"—";
    $("#cvFtlMarginCell")?.classList.toggle("overrun",fdp.applicable&&Number(fdp.spareMinutes)<0);
    $("#cvFtlNote").textContent=fdp.applicable
      ? `${fdp.fdpDefinition}. ${fdp.scheduledSectorCount} operating sector${fdp.scheduledSectorCount===1?"":"s"}${fdp.aircraft?` · ${fdp.aircraft}`:""}. Four-crew 17:00 cap is not applied without confirmed crew complement.`
      : fdp.reason;
  }

  const dutyCard=$("#nextDutyCard");
  const strip=$("#cvRosterDutyStrip");
  const dutyVisible=hasRoster&&dutyCard&&!dutyCard.classList.contains("hidden");
  strip?.classList.toggle("hidden",!dutyVisible);
  if(strip&&dutyVisible){
    ["state-next","state-active","state-completed","state-layover","soon","urgent"].forEach(className=>strip.classList.toggle(className,dutyCard.classList.contains(className)));
    $("#cvRosterDutyState").textContent=text("smartDutyEyebrow","NEXT DUTY");
    $("#cvRosterDutyItem").textContent=text("nextDutyItem","Duty");
    $("#cvRosterDutyRoute").textContent=text("nextDutyRoute","");
    $("#cvRosterDutyMeta").textContent=`Report ${text("nextDutyReport")} · ${text("nextDutyCountdown")}`;
  }

  const theme=document.documentElement.dataset.theme||"light";
  $("#cvProfileThemeText").textContent=theme==="dark"?"Dark mode selected":"Light mode selected";
}

window.addEventListener("crewview:navigate",event=>routeTo(event.detail?.tab||"today",event.detail||{}));
