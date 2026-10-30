# Roadwise privacy

Roadwise has no accounts, no ads and no analytics. It doesn't collect your name, phone number or
contacts, and it doesn't keep a record of where you drive on any server. The same text is in the app
under **ℹ️ About, privacy & licences**.

## What stays on your phone

- Home, Work and recent places.
- The stops your phone notices (where you waited and for how long), used for arrival times.
- How the last drive's arrival time compared with the real one, until the next drive or the app closes.
- Downloaded routing maps, and cached speed cameras, toll plazas and speed bumps (kept a week).
- Reports you made while offline, until they can be sent (dropped after 30 minutes).

## What is sent, and to whom

To work, Roadwise asks these services for things. Each gets only what that request needs.

| What | Sent to | Why |
| --- | --- | --- |
| What you search for, with your rough location to rank results | [Photon](https://photon.komoot.io) by komoot; [Nominatim](https://nominatim.openstreetmap.org) (OpenStreetMap) when Photon is down | Finding places |
| A spot you long-press or a place you pick on the map | Photon | Naming it after the nearest street |
| Your start, stops and destination, when no routing map on the phone covers the trip | [OSRM](https://router.project-osrm.org) demo server | Working out routes, and how much time a stop adds |
| The path of your chosen route | [Valhalla](https://valhalla1.openstreetmap.de) by FOSSGIS | Speed limits, tolls, traffic lights, tunnels and lane arrows |
| The area (about 110 km squares) around your route | [Overpass API](https://overpass-api.de) | Speed cameras, toll plazas, railway crossings and speed bumps |
| The area you're looking at | [OpenFreeMap](https://openfreemap.org) | Map tiles |
| The path of each route on offer, and the area you're looking at or driving through | Roadwise's server on Supabase, which asks [TomTom](https://www.tomtom.com) | Live traffic times, slow stretches, speed limits, accidents, roadworks, closures and the traffic map. Answers are shared between phones for two minutes and not kept; TomTom sees Roadwise's server, not your phone. |
| What you search for when you press search, with your rough location | Roadwise's server on Supabase, which asks TomTom | Addresses and shops the free map data doesn't have. Suggestions while you type don't go to TomTom. |
| A short map link you share to Roadwise (maps.app.goo.gl) | Google | Finding out where the link points |
| Reports you choose to send (kind and position) and "still there?" answers | Roadwise's database on [Supabase](https://supabase.com) | Showing them to other drivers; reports stop showing after a few hours but are kept |
| Places you add for everyone (name, kind and position) and "not here" answers | Roadwise's database on Supabase | Other drivers finding them in search; they're public and kept |
| **Only if you tick it when adding a place**: its name, kind and position | [OpenStreetMap](https://www.openstreetmap.org) as an anonymous public note | A mapper checking it and adding it to the map |
| Feature requests you type and send (only the text, and whether it came from the app or the web) | Roadwise's database on Supabase | Deciding what to build next. Don't put your name or phone number in them unless you want a reply. |
| Toll amounts you report, with a random ID the app made (not linked to you) | Roadwise's database on Supabase | Keeping the toll fares up to date |
| The area of your trip | Roadwise's database on Supabase | Reading other drivers' usual waits (nothing about you is sent) |
| **Only if you say yes to "Share stop times"**: where you waited while navigating | Roadwise's database on Supabase | Better arrival times for everyone |
| **Only if you say yes to "Share stop times"**: drives whose arrival time was more than 5 minutes off | Roadwise's database on Supabase | Checking how accurate arrival times are |

### Shared stop times

Off until you say yes. The app asks once, when you start your first navigated drive; you can change it any time (📡 in the list under the search box). Each wait
is sent as:

- the position, rounded to about 11 m;
- the direction you were heading;
- the time of week, in eight bands (weekday or weekend × morning rush, day, evening rush, night);
- how long you waited (0 when you drove straight through).

Nothing identifies you, your phone or the trip: no ID, no date or time, and nothing from the first
and last 300 m of a drive, so your home and work don't show. Waits are sent after the drive, in no
particular order. The database keeps the last 12 weeks and only ever hands out totals per spot.

When a guided drive reaches its destination more than 5 minutes earlier or later than the arrival
time shown at Start, the same setting also sends: the time shown, the time it took, the length
rounded to a km, the time-of-week band and whether live traffic was counted. No positions, no ID.
The phone shows the last drive's result in the list under the search box and forgets it when the
next drive starts or the app closes.

## The web app

[The browser version](https://ycryga.github.io/roadwise-releases/) sends the same requests as the
app, to the same services, for the features it has (search, routes, live traffic, reports, the
traffic map). It keeps only whether the traffic map is on and whether you have seen the first tip, in your browser. It doesn't share stop
times or arrival times.

## Location

Roadwise uses your location to show where you are and to navigate. While you're navigating it keeps
using it with the screen off or another app in front (shown by the "Navigating" notification), so
directions keep coming; it stops when you press ■ or close the app.

## Donations

Donating is optional and happens outside Roadwise: DuitNow in your own bank or e-wallet app, or
Ko-fi and Buy Me a Coffee in your browser, each under its own privacy policy. Roadwise never sees
your payment details, and only shows the month's total raised, which is typed in by hand.

## The public services

Photon, Nominatim, OSRM, Valhalla, Overpass and OpenFreeMap are free community services with their
own privacy policies and fair-use rules. Running your own copies of them would keep those
requests in-house.
