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
  version: "v 1.01 EXPERIMENTAL 30.Jul.26",
  type: ["FEATURE", "FIX"],
  text: `• A brand-new analytics module focused on fleet efficiency rather than income.
• Aircraft Utilization is currently released as Beta.
• Historical operational utilization becomes progressively more accurate as Grounded Time data is collected automatically from new flights. No user action is required.
• Weekly Aircraft Utilization dashboard
• Fleet Operational Utilization
• Flight Activity vs Operational Utilization comparison
• Aircraft rotation tracking
• Flight hours per aircraft
• Fleet summary cards
• Aircraft classification: Workhorse - Active - Underused - Grounded - Idle
• Detailed evidence popover for every aircraft
• 7-week utilization timeline
• Fleet-wide utilization statistics
• Added Grounded Time support for utilization calculations
• Improved operational utilization algorithm
• Added partial-evidence handling for historical data
• Removed misleading XP values from utilization tables
• Improved owned-aircraft filtering
• Various backend optimizations
• Improved data consistency
• Better caching behaviour
• Additional stability improvements
`
},     
  
  {
  id: "1",
  version: "v 1.0 FULL RELEASE 25.Jul.26",
  type: ["FEATURE", "UPGRADE", "FIX"],
  text: `• Introducing full release - Mission Intelligence Update. This marks the first major milestone for SimFly Hub.
  The application has evolved from a collection of statistics into a complete operational intelligence
  platform built around your historical SimFly data.

  • UI / UX Updates - Redesigned homepage for improved responsiveness and cleaner information hierarchy.
  • Reduced visual clutter by replacing large static panels with contextual hover pop-outs.
  • Improved overall navigation and dashboard usability.
  • Refined typography, spacing and component consistency across the application.

  • New Operational Widgets
  • New hover pop-outs provide instant access to operational information without leaving the current page.
  • Fleet Status
  • Ready aircraft overview
  • Quick fleet availability check
  • Active licences with live timers
  • Remaining licence availability
  • Immediate operational readiness overview

  • Airports Intelligence - A brand new airport capacity visualization has been added.
  • Weekly Arrivals vs Capacity
  • Compare actual completed arrivals against available weekly arrival slots.
  • Visualize airport utilization trends over time.
  • Compare utilization across your owned airports.
  • Historical weekly navigation.
  • Optimized data loading and caching architecture.
  • This metric makes it much easier to identify underutilized airports and optimize airport investment decisions.

  • Mission Intelligence continues to evolve as the core prediction engine.
  • Improved prediction methodology.
  • Better licence awareness.
  • Additional historical intelligence inputs.
  • Multiple UI refinements for prediction transparency.

  • Bug Fixes
  • Fixed airport income calculations for owner-operated flights.
  • Fixed historical activity edge cases affecting statistics.
  • Resolved duplicated activity records created under specific ownership scenarios.
  • Improved overall data consistency across analytical modules.

  • Performance
  • Improved responsiveness throughout the application.
  • Reduced unnecessary page navigation through contextual widgets.
  • Backend optimizations for analytical workloads.
  • Multiple internal stability improvements.
Thank you to everyone testing the Hub and providing feedback. Many of the improvements in this release originated directly from real-world usage and community suggestions.`
},      
  {
  id: "1",
  version: "v 0.92 EXPERIMENTAL 23.Jul.26",
  type: ["FEATURE", "FIX"],
  text: `• Brand new prediction engine for planned flights.
• Predicts expected PAX before departure.
• Full component-by-component income analysis.
• Statistical confidence scoring.
• Transparent prediction methodology.
• Experimental self-learning prediction model.
• Historical Intelligence - Prediction now uses your complete historical flight ledger.
• Dynamic reference matrices built automatically from historical flights.
• Aircraft Tier × Airport Tier intelligence.
• Airport reference matrix.
• Aircraft reference matrix.
• Near-history and direct-history matching.
• Community Intelligence - optional mode.
• Supplements your own data with anonymized global statistics.
• Community influence decreases automatically as your own history grows.
• Community never replaces your own data.
• Transparent contribution shown in prediction details.
• Aircraft Intelligence - prediction for owned aircraft.
• Generic aircraft support (Tier 1–7).
• Dedicated Prediction Ledger for aircraft income.
• Owner-income prediction separated from accounting.
• Historical aircraft median prediction.
• Improved aircraft confidence model.
• Airport Intelligence - prediction based on airport tier.
• Historical airport intelligence.
• Weekly bonus prediction.
• Independent departure and arrival analysis.
• Improved handling of sparse historical data.
• Licence Intelligence - historical licence median prediction.
• Weekly eligibility verification.
• Confidence-aware licence estimation.
• Decision Support Workflow
• Planner redesigned into an intentional decision-support workflow.
• Added Begin Data Mining execution model.
• Eliminated unnecessary live recalculations.
• Resource-efficient prediction execution.
• Prediction Accuracy Framework - now combines multiple evidence sources:
• Direct historical evidence
• Near historical evidence
• Reference matrices
• Community Intelligence
• Statistical fallbacks
• Each prediction displays confidence based on actual evidence quality.
`
},      
  {
  id: "1",
  version: "v 0.911 STABLE 18.Jul.26",
  type: ["FEATURE", "UPGRADE"],
  text: `• SimBrief Quick Dispatch is live. Click any ICAO in an Alliance pilot card to instantly open SimBrief with the destination pre-filled.
  • Updated table for airports upgrade cost to reflect real values with better accuracy.`
},      
  {
  id: "1",
  version: "v 0.910 STABLE 17.Jul.26",
  type: ["FEATURE", "UPGRADE"],
  text: `• New Income Intelligence analytics module.
  • Active vs Passive income breakdown.
  • Financial trends and historical analysis.
  • Airport and aircraft income attribution.
  • Dashboard Total Income now includes both Active and Passive income.
  • Improved loading experience and accounting consistency.
  • Resource-intensive analytics — now available for all HUB Supporters.`
},    
  {
  id: "1",
  version: "v 0.909 STABLE 13.Jul.26",
  type: ["FEATURE", "UPGRADE", "FIX"],
  text: `• Added the new Alliance Intelligence module.
  • Interactive alliance visualization with pilot relationships and airport intelligence.
  • Introduced session-based SimFly identity with per-pilot nonce resolution.
  • Improved Alliance build pipeline with automatic resume after interrupted builds.
  • Enhanced caching, reliability and overall performance of Alliance data generation.
  • Alliance Intelligence is now available exclusively for Hub Supporters.`
},  
  {
  id: "2",
  version: "v 0.908 STABLE 10.Jul.26",
  type: ["FEATURE", "FIX"],
  text: `• Introduced the new My Team Activity module.
  • Build your own team of up to 10 pilots.
  • Follow live flights and parked aircraft on an interactive map.
  • View real-time flight progress, aircraft details and estimated arrival times.
  • Available exclusively for Hub Supporters.
  • License page - revised UI and functionality for timers.`
},  
  {
  id: "3",
  version: "v 0.907 STABLE 08.Jul.26",
  type: ["FEATURE"],
  text: `• Introduced the Counter-Visit Finder widget for planning return flights.
  • Added a dynamic "Hubs" search button to the View as Pilot panel.
  • Pilots using SimFly Hub can now be discovered through the Hubs search.
  • Search results display all owned airports with detailed hub information in a dedicated pop-up window.`
},
  {
  id: "4",
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
    id: "5",
    version: "v 0.905 STABLE 7.Jul.24",
    type: ["UPGRADE", "FEATURE", "FIX"],
    text: `• Improved visitor cards for better readability.
• Added the Hub Analysis supporter page.
• Improved the robustness of the weekly Hub Support logic.`
  },
  {
    id: "6",
    version: "v 0.904",
    type: ["UPGRADE", "FIX"],
    text: `•Single airport license checker option added. 
    •DB traffic from server reduced.`
  },
  {
    id: "7",
    version: "v 0.903",
    type: ["FEATURE"],
    text: `•Dynamic database architecture optimized and cloud sweeps operational.`
  },
  {
    id: "8",
    version: "v 0.902",
    type: ["FIX"],
    text: `•Fixed hydration mismatches and stabilized dashboard components.`
  },
  {
    id: "9",
    version: "v 0.901",
    type: ["UPGRADE"],
    text: `•Upgraded edge server transport layers for smoother performance.`
  }
];
