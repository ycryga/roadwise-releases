# Changelog

What changed in each Mana release (called Roadwise until 0.13). The APK for each one is on its
[GitHub release](https://github.com/ycryga/roadwise-releases/releases).

## 0.16.0 — 2026-10-31

- **Easier to read the road**: roads are drawn twice as wide, the route line is thicker, and while
  you drive every turn ahead shows a white arrow, so you see the next few turns before you reach
  them.
- **Easier to read for everyone**: a few colours were too faint and are now stronger (grey hints,
  green route labels, the red **Exit** at night), report icons stand out from their tiles day and
  night, and **Add stop** and **Exit** are bigger to tap while driving. Checked at night and with
  large text.
- **Credits**: About now names every service a route uses (OSRM, Valhalla, Overpass, Photon), and
  the browser version has the same About page.
- The same in the browser version.

## 0.15.0 — 2026-10-31

- **Browser version**: Mana in the browser now looks and works like the app. The same navy and red
  colours; while driving, the map zooms with your speed and keeps your car low on the screen, with
  one arrow at the next turn, your speed on the left and a big red **Report** on the right. Report
  and **Add stop** open as big tiles, three to a row. The **☰ Menu** sits in the search bar, the
  place card shows how far it is first, and choosing a route ends with a **Go** button. Words
  instead of emoji throughout.

## 0.14.1 — 2026-10-31

- **Fixed**: tapping **Save** without typing a name closed the box, and you had to start saving
  again. Now it stays open and says a name is needed. The same goes for adding a missing place,
  requesting a feature, and the toll amount, where a wrong amount skipped straight to the next toll.

## 0.14.0 — 2026-10-31

A new look, in Mana's navy, red and white, made for a quick glance while driving.

- **Driving screen**: a navy turn banner, and the map zooms out as you speed up (close in town,
  further out on the highway) with your car lower on the screen, so you see more of the road ahead.
  Shops and other place icons step aside while you drive, and one white arrow marks the next turn.
  Your speed sits alone on the left; the buttons, with a bigger red **Report**, sit on the right.
- **Report** and **Add stop** open as big tiles you can tap without scrolling. Add stop shows
  petrol, food, toilet, rest area, shop and mosque; one tap finds them along your route.
- **Menu**: settings moved out of the search list into a **☰ Menu** in the search bar, grouped
  (Driving, Help other drivers, Support, About), with each setting's value shown.
- **Search and place card**: Home and Work side by side, clearer results with shorter addresses,
  and the place card shows how far it is first, with labelled **Directions**, **Save** and
  **Close** buttons. A saved place says **Saved**.
- **Choosing a route**: the routes come first, then labelled **Add stop**, **Parking** and
  **Save**, and the button says **Go**. Numbers no longer split from their units across lines.
- **Words instead of emoji**: buttons and messages say what they mean ("Still there", "Gone",
  "Saved as Home"), and dialogs are rounded, with darker colours at night.

## 0.13.1 — 2026-10-30

- **Neater icon**: the m now sits in the middle of the app icon, with the red dot in the corner.

## 0.13.0 — 2026-10-30

- **Roadwise is now Mana**: *mana* is Malay for "where". It has a new logo and app icon: a rounded
  **m** that arrives at a red dot, in the navy, red and white of the Johor flag. The update installs
  over Roadwise and keeps your saved places, maps and settings.
- **Ke mana?**: with your phone or browser set to Malay, the search box asks "Ke mana?". Otherwise it
  still says "Where to?".

## 0.12.6 — 2026-10-30

- **Fixed**: your position could jump somewhere else for a second and come back. A rough location
  from Wi-Fi or phone towers was mixed in with GPS; now it's only used when GPS has gone quiet,
  indoors or in a tunnel.

## 0.12.5 — 2026-10-30

- **Help make arrival times better**: on your first navigated drive, Roadwise asks once whether to
  share where traffic stops, anonymously, to estimate arrival times better for everyone. Tap
  **Share** or **Not now**; you can change it any time in More → Share stop times.

## 0.12.4 — 2026-10-30

- **Add a place from coordinates in one tap**: search coordinates (or drop a pin) and the place card
  shows **Add this place to the map**. Pick a kind, type its name, and every driver can find it.
  The same in the browser version.

## 0.12.3 — 2026-10-30

- **Browser version**:
  - Pressing Enter on coordinates goes straight to that spot.
  - When a new version comes out, a **Tap to update** button appears under the search box and
    loads it, instead of the browser holding on to the old one for a while.

## 0.12.2 — 2026-10-30

- **Coordinates in the browser version**: type or paste coordinates like "3.43999, 101.69213" and
  the search goes to that exact spot, as it already did in the app, instead of nearby addresses.

## 0.12.1 — 2026-10-30

- **Search finds far-away places again**: 0.12.0 only showed results within 50 km, which hid
  places you meant to find in another town or state.
- **Best match first**: places whose name has every word you typed come first, then the nearest.
  Searching "Jambatan Pulau Pinang" from KL now shows the bridge, not a KL street with "Pulau
  Pinang" in its name.
- **All result pins in view**: the map leaves room for the list above it and the buttons below it.

## 0.12.0 — 2026-10-30

- **Search results on the map**: press search (or the 🔍 button) and up to 10 results are
  numbered, nearest first, with matching numbered pins on the map. Tap a pin or a row to see the
  place.
- **A calmer map**: reports and roadworks close together show as one small grey dot until you zoom
  in. Tap a dot to zoom in and see each one.
- **Back to your results**: after looking at a place, Back or ✕ brings the numbered list back,
  so you can try the next one.
- **Only places you can drive to**: results within 50 km that have a driving route come first; a
  far-away place still shows when its name matches exactly.
- **Easier to fill in**: the name box for a missing place now has a "Place name" label, which
  screen readers read out too.

## 0.11.0 — 2026-10-30

- **Name any place for later**: ⭐ → **Give it a name** keeps a dropped pin, typed coordinates or
  any place in a new **Saved** list. Long-press a saved place to rename or remove it.
- **Add places the map is missing, for everyone**: More → **Add a place missing from the map** (or
  ⭐ → **Add to the map for everyone** on a dropped pin), pick a kind and type a name. Every driver
  then finds it in search, by name or under its kind. You can also send it to OpenStreetMap so it
  goes on the real map. If a place isn't there, long-press it in search and say **Not here**.
- **Quieter when speeding**: "Speed limit 90" is no longer spoken when you go over, unless you turn
  on More → **Say when over the speed limit**. The red speed bubble works as before.
- **Browser version**: add a missing place too, and find places other drivers added.

## 0.10.4 — 2026-10-29

- **Fixed**: sharing stop times could stop for good if the server once turned a batch away; the
  phone now drops that batch and carries on.
- **Steadier map**: updated the map library (MapLibre 13.7.1), which fixes several rare crashes.

## 0.10.3 — 2026-10-29

- **Fixed**: after planning a trip from another place, there was no clear way back to your own
  location. Tapping "From …" now offers **Your location** first, and the button at the end of
  that row shows the my-location icon.

## 0.10.2 — 2026-10-29

- **Easier to read route details**: the route card and route choices say it in words, like
  "No tolls · 2 lights · traffic +7 min" and "via Jalan Istana", instead of small emoji.

## 0.10.1 — 2026-10-29

- **Clearer reports**: reports and incidents on the map, and the report buttons, use proper icons
  (police badge, crashed car, traffic jam, roadworks, flood…) instead of emoji, so they're sharp
  and easy to tell apart at a glance.
- **Report button**: an orange megaphone, so it's easy to find and doesn't look like a warning.
- Same in the browser version.

## 0.10.0 — 2026-10-29

- **Several stops**: add up to 8 stops on the way (📍+, a place on the map, or a road you tap).
  The route card lists them in order, numbered like their dots on the map; move each one earlier
  or later, or remove it. While driving, Roadwise tells you as you reach each stop.
- **Best order**: one tap puts your stops in the quickest order.
- **Plan from somewhere else**: tap "From your location" on the route card to start the trip from
  another place, and see the route and arrival time from there. Tap ✕ to go back to your location.
- Same in the browser version.

## 0.9.0 — 2026-10-29

- **See the place before the route**: picking a search result, a recent place, a place on the map
  or a shared location now shows where it is first, with its address and distance. Tap
  **Directions** for routes, the star to save it, or ✕ to close. Home and Work still go straight
  to directions.
- **A real map pin**: the destination is a red pin instead of a dot, and it drops onto the place
  when you pick it, so you see straight away where it is.
- **Smoother cards**: the place and route cards slide up gently instead of popping in, and get out
  of the way quickly. Turned off when your phone is set to remove animations.
- **Browser version**: the same place card, and night colours for the map and panels after sunset.

## 0.8.1 — 2026-10-29

- **Fixed**: in 0.8.0 the icons next to recent places were invisible in daytime.
- **Clearer buttons**: the traffic, add-stop, parking, save and start buttons, and the list under
  the search box, use proper icons instead of emoji, so they look the same on every phone and
  dim properly at night. Same in the browser version.

## 0.8.0 — 2026-10-29

- **New icon**: the arrow on its route, filling the home-screen icon shape instead of sitting small
  on a white tile. Works with Android 13+ themed icons. The browser version has it too.
- **Easier on the eyes at night**: the search box, lists, route card and buttons now go dark with
  the map after sunset and in tunnels, instead of staying bright white.
- **Easier to tap**: the rows under the search box (Support, Request a feature, Share stop times,
  About…) are full-size and readable, and the route card's stop, parking and save buttons are bigger.
- **Browser version**: clearer keyboard focus, less motion when your phone asks for it, and
  screen readers announce turns and messages.

## 0.7.1 — 2026-10-29

- **Arriving in a car park works**: stopping within about 100 m of where you're going now counts as
  arrived, so navigation ends there. Before, a car park or basement away from the road could keep
  it saying "Rerouting". No more rerouting while you look for a spot to park.

## 0.7.0 — 2026-10-29

- **Roadwise in your browser**: [ycryga.github.io/roadwise-releases](https://ycryga.github.io/roadwise-releases/)
  works on any phone, iPhone too, with nothing to install. Add it to your home screen. It has
  search, route choices with live traffic, voice directions, drivers' reports and the traffic map;
  keep it open on screen while driving.
- **☕ Support Roadwise**: Roadwise stays free with no ads. The list under the search box shows this
  month's donations towards the running costs, with DuitNow QR and Ko-fi.
- **💡 Request a feature**: tell us what would make Roadwise better, right from the app.

## 0.6.0 — 2026-10-29

- **Traffic map** (🚦): slow (orange) and stopped (red) traffic on every road, drawn thin down the
  middle of the road. Free-flowing roads are left alone. Remembered between launches.
- **More places in search**: pressing search also finds houses and shops the free map data lacks.
- **Speed limits** on roads OpenStreetMap has none for.
- **Reports show their symbol** on the map (👮 📸 💥 🚧 …) instead of a plain coloured dot; so do
  accidents, roadworks and closures.
- **A loading bar** under the search box while searching and while the route is worked out, so
  the wait doesn't look like nothing's happening.
- **How accurate was the arrival time?** After a drive, the list under the search box shows what
  Roadwise said and how long it really took. With "Share stop times" on, drives more than 5 minutes
  off are sent (no positions) so arrival times can be checked.
- **Fixed**: towns turned black on the zoomed-out map after the night colours switched back to day.
- **Fixed**: shared stop times weren't being saved.

## 0.5.0 — 2026-10-29

- **Live traffic** (from TomTom): arrival times count today's traffic, slow and stopped stretches
  are coloured on the route, and each route choice shows how much traffic adds ("🚗 +5 min").
- **Accidents, roadworks and closures** on the map (tap one for details), with a voice warning when
  one is ahead on your route.
- **Lane arrows fixed at busy junctions**: they could show the lanes of a junction just before the
  turn, with the wrong number of lanes. Lanes that don't help (every lane, or none, marked) are no
  longer shown.

## 0.4.0 — 2026-10-29

First public release.

- **Install once again**: Roadwise has its own app ID now (it used a placeholder before) and is
  signed with its own release key. Uninstall the old Roadwise after installing this one; set Home
  and Work again (pick them on the map).
- Download it from [ycryga/roadwise-releases](https://github.com/ycryga/roadwise-releases/releases/latest).
- Limits against spam reports in the shared database.

## 0.3.0 — 2026-10-29

### Getting there
- **Add a stop**: 📍+ on the route card (also while driving) finds petrol, food, toilets, rest areas,
  shops, mosques or any place along the route, each showing how much time it adds ("+3 min"), and
  asks before adding it. Tapping a place's icon on the map offers the same.
- **Parking** (🅿️): car parks near the destination; picking one drives you there.
- **Search by kind of place** in English or Malay: "petrol", "stesen minyak", "makan", "klinik",
  "tandas", "surau", "parking". Tap a petrol station, shop or station on the map to go there.
- **Places search doesn't know**, like most house addresses: long-press the map, type coordinates,
  paste a map link, or share a location to Roadwise from WhatsApp or Google Maps.
- **Home and Work** can be picked straight on the map; ⭐ saves any destination as either.
- **Downloadable routing maps** for any country or region, so routes work out on the phone.

### While driving
- **Arrival time** is the big number once you start, with time and distance left counting down.
- **Keeps going with the phone locked**: GPS, voice and the next-turn notification carry on, the
  screen stays on, and the map shows over the lock screen (unlocking is only needed to leave it).
- **Speed limit stacked on your speed**, which flashes red when you go over and then stays red.
- **Report menu as big icon tiles** (👮 💥 🚗 ⚠️ ⛔), easy to hit without reading; 👍 / 👎 for
  "still there?".
- **Slimmer turn banner**, with the turn after in its own darker pill.
- **Follows the car again** by itself after you've moved the map, once you're moving.
- **The road already driven turns grey.**
- **Night colours** from sunset to sunrise and in tunnels.
- **Overpasses** the route goes under are drawn on top of it and turn see-through as you pass
  beneath (replacing the experimental 3D flyovers).
- **A boxy 1980s-saloon car icon** seen from above.
- ▶ / ■ for go and stop; symbols instead of words where you glance at them.
- Nothing pops up in the middle of the map: buttons and questions sit at the edges.

### Learning the roads
- Roadwise notices **where you wait** (lights, junctions, jams) and for how long. Usual waits show
  on the map, are added to arrival times, and spots where cars keep stopping without a mapped
  traffic light are listed so they can be added to OpenStreetMap.
- **Share stop times anonymously** (off unless you switch it on) so every driver's arrival times
  improve. See [PRIVACY.md](PRIVACY.md) for exactly what is sent.
- Reports **fade as they get older**; reporting the same thing again confirms the first report.

### Fits your phone
- Any screen: the Flip's cover screen gets a compact layout; unfolded Folds, phones on their side
  and tablets keep the map open beside a side column; split screen works.
- Folding, unfolding or a dark-mode switch no longer interrupts a drive (it also caused the
  half-dark map at night).
- **Back** steps back one level (menu, search, route) instead of closing the app.

### Reliability
- Search falls back to OpenStreetMap's Nominatim when Photon is down or answering with errors,
  and goes back to Photon by itself once it recovers.

## 0.2.0 — 2026-10-28

- Routing on the phone (GraphHopper) with up to three route choices and a toll-free option, each
  with its time, distance, tolls and traffic lights.
- Speed limits with a current-speed bubble, and alerts for speed cameras, toll plazas, railway
  crossings and speed bumps.
- Toll estimates per route, with a fare table drivers keep up to date.
- Driver reports with subtypes and "still there?" votes, sent later when offline.
- Turn arrow, "then…" line and lane arrows.

## 0.1.0 — 2026-10-27

- First release: map, place search, Home/Work and recent places, routing with alternatives,
  turn-by-turn voice guidance with lane arrows, and driver reports.
