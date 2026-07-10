export interface ChangelogItem {
  id: string;
  version: string;
  // POPRAWKA: Zmiana na tablicę obsługującą wiele tagów pisanych dużymi literami
  type: ("FEATURE" | "FIX" | "UPGRADE")[];
  text: string;
}

// TUTAJ WPISUJESZ NOWE AKTUALIZACJE - NAJNOWSZA ZAWSZE NA SAMEJ GÓRZE
export const staticChangelogFeed: ChangelogItem[] = [
 {
  id: "1",
  version: "v 0.908 STABLE 10.Jul.26",
  type: ["FEATURE"],["FIX"],
  text: `• Introduced the new My Team Activity module.
  • Build your own team of up to 10 pilots.
  • Follow live flights and parked aircraft on an interactive map.
  • View real-time flight progress, aircraft details and estimated arrival times.
  • Available exclusively for Hub Supporters.
  • License page - revised UI and functionality for timers`
},  
  {
  id: "1",
  version: "v 0.907 STABLE 08.Jul.26",
  type: ["FEATURE"],
  text: `• Introduced the Counter-Visit Finder widget for planning return flights.
  • Added a dynamic "Hubs" search button to the View as Pilot panel.
  • Pilots using SimFly Hub can now be discovered through the Hubs search.
  • Search results display all owned airports with detailed hub information in a dedicated pop-up window.`
},
  {
  id: "1",
  version: "v 0.906 STABLE 08.Jul.26",
  type: ["FEATURE", "UPGRADE", "FIX"],
  text: `• Introduced Pilots Career - a new personal aviation history page.
  • Discover your flying journey through visited airports, longest routes and global travel distance.
  • Added aircraft Tier usage statistics and flight activity breakdown. 
  • Added visited countries with visual flag display. 
  • Career statistics are calculated from complete historical SimFly flight data. 
  • Improved historical flight processing for more accurate achievements and records. 
  • Enhanced layout and readability on all device sizes.`
},
    {
    id: "1",
    version: "v 0.905 STABLE 7.Jul.24",
    type: ["UPGRADE", "FEATURE", "FIX"],
    text: `• Improved visitor cards for better readability.
• Added the Hub Analysis supporter page.
• Improved the robustness of the weekly Hub Support logic.`
  },
  {
    id: "2",
    version: "v 0.904",
    type: ["UPGRADE", "FIX"],
    text: `•Single airport license checker option added. 
    •DB traffic from server reduced.`
  },
  {
    id: "3",
    version: "v 0.903",
    type: ["FEATURE"],
    text: `•Dynamic database architecture optimized and cloud sweeps operational.`
  },
  {
    id: "4",
    version: "v 0.902",
    type: ["FIX"],
    text: `•Fixed hydration mismatches and stabilized dashboard components.`
  },
  {
    id: "5",
    version: "v 0.901",
    type: ["UPGRADE"],
    text: `•Upgraded edge server transport layers for smoother performance.`
  }
];
