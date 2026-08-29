const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const bridge=window.CrewViewV200Bridge;
if(!bridge){
  console.warn("CrewView v200 shell could not find the v171 data bridge.");
}else{
  initialiseCrewViewV200();
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

function initialiseCrewViewV200(){
  document.body.classList.add("cv-v200");

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

  moveExistingContent(screens,footer);

  const bottomNav=makeBottomNav();
  main.after(bottomNav);

  wireNavigation(screens,bottomNav);
  wireDutyDetails();
  wireQuickActions();
  startDataSync();

  const initialLoaded=shellHasRoster();
  routeTo(initialLoaded?"roster":"today",{rosterMode:"classic",remember:false,scroll:false});

  let hadRoster=initialLoaded;
  new MutationObserver(()=>{
    const hasRoster=shellHasRoster();
    document.body.classList.toggle("cv-has-roster",hasRoster);
    refreshShellData();
    if(hasRoster!==hadRoster){
      routeTo(hasRoster?"roster":"today",{rosterMode:"classic",remember:false});
      hadRoster=hasRoster;
    }
  }).observe(document.body,{attributes:true,attributeFilter:["class"]});

  window.addEventListener("crewview:view-changed",event=>{
    const view=event.detail?.view;
    if(view==="classic"||view==="calendar"){
      localStorage.setItem("crewview-v200-roster-mode",view);
      syncRosterModeButtons(view);
    }
  });
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
      <button type="button" class="btn primary" id="cvEmptyLoad">${icon("upload")} Load Current Roster</button>
    </article>
    <section class="cv-today-after-duty" id="cvTodayAfterDuty">
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
    ${sectionHeading("LOADED ROSTER","Roster","Your original Classic report and colour-coded Calendar stay together.")}
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
  const nextDuty=$("#nextDutyCard");
  const todayAfter=$("#cvTodayAfterDuty",screens.today);
  if(nextDuty) screens.today.insertBefore(nextDuty,todayAfter);

  const rosterMode=$("#viewSwitcher");
  const compactProfile=$("#compactProfile");
  const classic=$("#classicView");
  const calendar=$("#calendarView");
  [rosterMode,compactProfile,classic,calendar].filter(Boolean).forEach(element=>screens.roster.append(element));

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

  // The legacy view layer uses a short transition lock. Bottom navigation is
  // intentionally immediate, including when a crew member taps two tabs fast.
  document.body.classList.remove("view-switching","view-switch-cover");

  if(tab==="roster"){
    const mode=rosterMode||localStorage.getItem("crewview-v200-roster-mode")||"classic";
    bridge.switchRosterView(mode==="calendar"?"calendar":"classic");
    syncRosterModeButtons(mode);
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

function syncRosterModeButtons(view){
  $$("#viewSwitcher .view-tab[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
}

function wireQuickActions(){
  $("#cvEmptyLoad")?.addEventListener("click",()=>$("#pdfInput")?.click());
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
    $("#resultCard")
  ].filter(Boolean);
  const observer=new MutationObserver(scheduleRefresh);
  sources.forEach(source=>observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class","value"]}));
  window.addEventListener("crewview:theme-changed",scheduleRefresh);
  window.addEventListener("crewview:ready",settleShellData);
  window.addEventListener("crewview:roster-state",settleShellData);
  settleShellData();
}

let refreshFrame=0;
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
  const block=text("fh","00:00");
  const duty=text("dh","00:00");
  const off=text("off","0");

  $("#cvRosterName").textContent=name;
  $("#cvRosterMeta").textContent=meta;
  $("#cvRosterAvatar").textContent=initials(name);
  $("#cvRosterBlockBadge").textContent=`${block} block`;
  $("#cvProfileName").textContent=name;
  $("#cvProfileMeta").textContent=hasRoster?meta:"No roster loaded";
  $("#cvTodayBlock").textContent=block;
  $("#cvTodayDuty").textContent=duty;
  $("#cvTodayOff").textContent=off;

  const product=text("smartDutyProductivityAllowance","RM0.00");
  const layover=text("smartDutyLayoverAllowance","RM0.00");
  $("#cvTodayEstimateTotal").textContent=money(rmNumber(product)+rmNumber(layover));
  $("#cvTodayEstimateParts").textContent=`Productivity ${product} · Layover ${layover}`;

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
