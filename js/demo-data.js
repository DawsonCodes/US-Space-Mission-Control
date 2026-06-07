// Offline/demo missions used when the live API is unavailable or for quick UI
// testing. Dates are generated relative to "now" so demo launches always sit in
// the future and never go stale (the previous version used hard-coded dates that
// silently drifted into the past).

const DAY_MS = 1000 * 60 * 60 * 24;

function inDays(days, hour = 12, minute = 0) {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

// Returns a fresh array of demo launches with up-to-date future dates.
export function getDemoLaunches() {
  return [
    {
      id: "demo-starlink-1",
      name: "Falcon 9 Block 5 | Starlink 12-2",
      net: inDays(9, 0, 18),
      missionName: "Starlink Group 12-2",
      missionType: "Communications",
      details:
        "Demo mission so the tracker still feels alive even when the live API has a bad day.",
      statusName: "Go for Launch",
      probability: 80,
      provider: "SpaceX",
      rocket: "Falcon 9 Block 5",
      padName: "Space Launch Complex 40",
      location: "Cape Canaveral, Florida, USA",
      image: "",
      imageCredit: "",
      webcast: "https://www.youtube.com/@SpaceX",
      article: "https://www.spacex.com/launches/",
      wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Starlink",
      upcoming: true
    },
    {
      id: "demo-crew-1",
      name: "Falcon 9 Block 5 | Crew Dragon Demo",
      net: inDays(23, 16, 35),
      missionName: "Crew Rotation Demo",
      missionType: "Human Exploration",
      details:
        "Crew-style demo mission with enough metadata to test badges, favorites, and countdown cards.",
      statusName: "To Be Determined",
      probability: 65,
      provider: "SpaceX",
      rocket: "Falcon 9 Block 5",
      padName: "Launch Complex 39A",
      location: "Kennedy Space Center, Florida, USA",
      image: "",
      imageCredit: "",
      webcast: "https://www.youtube.com/@SpaceX",
      article: "https://www.spacex.com/humanspaceflight/",
      wikipedia: "https://en.wikipedia.org/wiki/Crew_Dragon",
      upcoming: true
    },
    {
      id: "demo-starship-1",
      name: "Starship | Integrated Flight Test Demo",
      net: inDays(51, 13, 10),
      missionName: "Starship Demo",
      missionType: "Test Flight",
      details:
        "A Starship-flavored demo mission so your filtering and sorting can flex every category.",
      statusName: "Watch for Update",
      probability: null,
      provider: "SpaceX",
      rocket: "Starship",
      padName: "Orbital Launch Pad A",
      location: "Starbase, Texas, USA",
      image: "",
      imageCredit: "",
      webcast: "https://www.youtube.com/@SpaceX",
      article: "https://www.spacex.com/vehicles/starship/",
      wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Starship",
      upcoming: true
    }
  ];
}
