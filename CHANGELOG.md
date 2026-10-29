# Changelog

What changed in each Roadwise release. The APK for each one is on its
[GitHub release](https://github.com/ycryga/roadwise-releases/releases).

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
