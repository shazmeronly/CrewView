CREWVIEW V5

Changes:
- Removed the August sample button and all sample roster data.
- Main button is now "Load Current Roster".
- Added "Load Another Roster".
- Keeps colour coding, all calendar days, one-page view, editing and PDF export.

Deploy:
Upload the contents of this ZIP to Netlify Drop.


CrewView v90: Smart Duty Card added. The card now transitions between Next Duty, Active Duty and Completed Duty. Pilot flight duties can record Pushback, Airborne, Landing and On Chocks locally on-device; cabin crew receive a role-specific active-duty view.

CrewView v91: UTC Smart Duty Engine. Pilot Pushback, Airborne, Landing, On Chocks and Duty End/Released are stored as UTC timestamps. Airport local time is derived from a bundled IATA-to-IANA timezone database. Actual Block, Air Time, Taxi Out/In and Actual Duty are calculated from UTC, with roster-vs-actual duty comparison.
Airport timezone data source: airportsdata by Mario Borsetti and contributors (MIT License), https://github.com/mborsetti/airportsdata.

CrewView v92: Active/Completed Smart Duty cards now stay compact by default. Tap the card (or Open Active Duty) to expand the full UTC operational workspace; use Minimise to return to the compact card.

CrewView v96: replaced iOS wheel time pickers with direct 4-digit UTC keypad entry (HHMM). Typing 0202 auto-formats/saves as 02:02. Invalid 0000-2359 values are rejected; Now buttons remain available.
