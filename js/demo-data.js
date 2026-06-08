// Offline/demo missions used when the live API is unavailable or for quick UI
// testing. Dates are generated relative to "now" so demo launches always sit in
// the future and never go stale. Records are already in the normalized internal
// shape (they bypass api.js/simplifyLaunch) and intentionally exercise the new
// v3 model: NASA agency overlays, SpaceX/Blue Origin providers, orbital +
// suborbital flights, the mission-type taxonomy, and overlapping org tags.

const DAY_MS = 1000 * 60 * 60 * 24;

function inDays(days, hour = 12, minute = 0) {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

const NASA = { id: 44, name: "National Aeronautics and Space Administration", type: "Government", abbrev: "NASA" };
const SPACEX = { provider: "SpaceX", providerName: "SpaceX", providerId: 121, providerType: "Commercial" };
const BLUE_ORIGIN = { provider: "Blue Origin", providerName: "Blue Origin", providerId: 141, providerType: "Commercial" };

function record(base) {
  return {
    lastUpdated: inDays(-1),
    missionName: base.name,
    program: "",
    agencies: [],
    rocketFamily: "",
    orbitName: "",
    orbitAbbrev: "",
    image: "",
    missionImage: "",
    missionThumb: "",
    rocketImage: "",
    providerImage: "",
    imageCredit: "",
    webcast: "",
    official: "",
    wikipedia: "",
    probability: null,
    upcoming: true,
    ...base
  };
}

// Returns a fresh array of demo launches with up-to-date future dates.
export function getDemoLaunches() {
  return [
    record({
      ...SPACEX,
      agencies: [NASA],
      id: "demo-nasa-science-spacex",
      name: "Falcon Heavy | NASA Planetary Science Probe",
      net: inDays(12, 14, 5),
      missionType: "Planetary Science",
      details:
        "A NASA planetary-science payload flying on a SpaceX Falcon Heavy — a NASA mission AND a SpaceX launch, so it appears under both organizations.",
      statusName: "Go for Launch",
      probability: 70,
      rocket: "Falcon Heavy",
      rocketFamily: "Falcon",
      orbitName: "Heliocentric Orbit",
      orbitAbbrev: "Helio",
      padName: "Launch Complex 39A",
      location: "Kennedy Space Center, Florida, USA",
      padLat: 28.6084,
      padLon: -80.6043,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.nasa.gov/",
      wikipedia: "https://en.wikipedia.org/wiki/Falcon_Heavy"
    }),
    record({
      ...SPACEX,
      agencies: [NASA],
      id: "demo-nasa-crew-spacex",
      name: "Falcon 9 Block 5 | NASA Crew Rotation",
      net: inDays(20, 16, 35),
      missionType: "Human Exploration",
      details:
        "A NASA crewed rotation flight on a SpaceX Crew Dragon. Crew-specific evidence keeps it classified as Crew, not Cargo.",
      statusName: "To Be Determined",
      probability: 60,
      rocket: "Falcon 9 Block 5",
      rocketFamily: "Falcon",
      orbitName: "Low Earth Orbit",
      orbitAbbrev: "LEO",
      padName: "Launch Complex 39A",
      location: "Kennedy Space Center, Florida, USA",
      padLat: 28.6084,
      padLon: -80.6043,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.nasa.gov/humans-in-space/",
      wikipedia: "https://en.wikipedia.org/wiki/Crew_Dragon"
    }),
    record({
      ...SPACEX,
      agencies: [NASA],
      id: "demo-nasa-cargo-spacex",
      name: "Falcon 9 Block 5 | NASA CRS Cargo Dragon",
      net: inDays(7, 9, 20),
      missionType: "Resupply",
      details:
        "A NASA Commercial Resupply Services (CRS) cargo Dragon flight. Cargo signals are checked before crew, so this stays Cargo despite carrying a Dragon.",
      statusName: "Go for Launch",
      probability: 85,
      rocket: "Falcon 9 Block 5",
      rocketFamily: "Falcon",
      orbitName: "Low Earth Orbit",
      orbitAbbrev: "LEO",
      padName: "Space Launch Complex 40",
      location: "Cape Canaveral, Florida, USA",
      padLat: 28.5619,
      padLon: -80.5772,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.nasa.gov/",
      wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Dragon_2"
    }),
    record({
      ...SPACEX,
      id: "demo-starlink",
      name: "Falcon 9 Block 5 | Starlink Group 12-2",
      net: inDays(3, 0, 18),
      missionType: "Communications",
      details:
        "A SpaceX Starlink launch — a SpaceX launch but not a NASA mission, so it appears only under SpaceX.",
      statusName: "Go for Launch",
      probability: 80,
      rocket: "Falcon 9 Block 5",
      rocketFamily: "Falcon",
      orbitName: "Low Earth Orbit",
      orbitAbbrev: "LEO",
      padName: "Space Launch Complex 40",
      location: "Cape Canaveral, Florida, USA",
      padLat: 28.5619,
      padLon: -80.5772,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.spacex.com/launches/",
      wikipedia: "https://en.wikipedia.org/wiki/Starlink"
    }),
    record({
      ...SPACEX,
      id: "demo-rideshare",
      name: "Falcon 9 Block 5 | Transporter Rideshare",
      net: inDays(15, 11, 0),
      missionType: "Dedicated Rideshare",
      details: "A SpaceX Transporter dedicated rideshare mission carrying many small satellites.",
      statusName: "To Be Determined",
      probability: 75,
      rocket: "Falcon 9 Block 5",
      rocketFamily: "Falcon",
      orbitName: "Sun-Synchronous Orbit",
      orbitAbbrev: "SSO",
      padName: "Space Launch Complex 4E",
      location: "Vandenberg SFB, California, USA",
      padLat: 34.632,
      padLon: -120.611,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.spacex.com/launches/",
      wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Transporter"
    }),
    record({
      ...SPACEX,
      id: "demo-falcon-heavy-commercial",
      name: "Falcon Heavy | Commercial GEO Comsat",
      net: inDays(34, 22, 40),
      missionType: "Communications",
      details: "A commercial geostationary communications satellite on a SpaceX Falcon Heavy.",
      statusName: "To Be Determined",
      probability: null,
      rocket: "Falcon Heavy",
      rocketFamily: "Falcon",
      orbitName: "Geostationary Transfer Orbit",
      orbitAbbrev: "GTO",
      padName: "Launch Complex 39A",
      location: "Kennedy Space Center, Florida, USA",
      padLat: 28.6084,
      padLon: -80.6043,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.spacex.com/vehicles/falcon-heavy/",
      wikipedia: "https://en.wikipedia.org/wiki/Falcon_Heavy"
    }),
    record({
      ...SPACEX,
      id: "demo-starship",
      name: "Starship | Integrated Flight Test",
      net: inDays(45, 13, 10),
      missionType: "Test Flight",
      details: "A SpaceX Starship integrated flight test. Classified as a Test flight.",
      statusName: "Watch for Update",
      probability: null,
      rocket: "Starship",
      rocketFamily: "Starship",
      orbitName: "",
      orbitAbbrev: "",
      padName: "Orbital Launch Pad A",
      location: "Starbase, Texas, USA",
      padLat: 25.997,
      padLon: -97.156,
      webcast: "https://www.youtube.com/@SpaceX",
      official: "https://www.spacex.com/vehicles/starship/",
      wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Starship"
    }),
    record({
      ...BLUE_ORIGIN,
      id: "demo-new-glenn",
      name: "New Glenn | Commercial Orbital Demo",
      net: inDays(28, 18, 0),
      missionType: "Communications",
      details: "A Blue Origin New Glenn orbital mission — a Blue Origin flight to orbit.",
      statusName: "To Be Determined",
      probability: null,
      rocket: "New Glenn",
      rocketFamily: "New Glenn",
      orbitName: "Low Earth Orbit",
      orbitAbbrev: "LEO",
      padName: "Launch Complex 36",
      location: "Cape Canaveral, Florida, USA",
      padLat: 28.4707,
      padLon: -80.5419,
      webcast: "https://www.youtube.com/@blueorigin",
      official: "https://www.blueorigin.com/new-glenn",
      wikipedia: "https://en.wikipedia.org/wiki/Blue_Origin_New_Glenn"
    }),
    record({
      ...BLUE_ORIGIN,
      id: "demo-new-shepard",
      name: "New Shepard | NS-Suborbital Flight",
      net: inDays(9, 15, 30),
      missionType: "Tourism",
      details:
        "A Blue Origin New Shepard suborbital flight. Flight type is Suborbital, so it is excluded from the Orbital filter.",
      statusName: "Go for Launch",
      probability: 90,
      rocket: "New Shepard",
      rocketFamily: "New Shepard",
      orbitName: "Suborbital",
      orbitAbbrev: "Sub",
      padName: "Launch Site One",
      location: "Corn Ranch, West Texas, USA",
      padLat: 31.423,
      padLon: -104.757,
      webcast: "https://www.youtube.com/@blueorigin",
      official: "https://www.blueorigin.com/new-shepard",
      wikipedia: "https://en.wikipedia.org/wiki/Blue_Origin_New_Shepard"
    }),
    record({
      ...BLUE_ORIGIN,
      agencies: [NASA],
      id: "demo-nasa-blue-origin",
      name: "New Glenn | NASA Planetary Science Payload",
      net: inDays(60, 12, 0),
      missionType: "Planetary Science",
      details:
        "A NASA planetary-science payload flying on a Blue Origin New Glenn — a NASA mission AND a Blue Origin flight, appearing under both organizations.",
      statusName: "To Be Determined",
      probability: null,
      rocket: "New Glenn",
      rocketFamily: "New Glenn",
      orbitName: "Mars Transfer Orbit",
      orbitAbbrev: "Mars",
      padName: "Launch Complex 36",
      location: "Cape Canaveral, Florida, USA",
      padLat: 28.4707,
      padLon: -80.5419,
      webcast: "https://www.youtube.com/@blueorigin",
      official: "https://www.nasa.gov/",
      wikipedia: "https://en.wikipedia.org/wiki/Blue_Origin_New_Glenn"
    })
  ];
}
