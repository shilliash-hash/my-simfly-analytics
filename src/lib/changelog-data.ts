export interface ChangelogItem {
  id: string;
  version: string;
  type: "FEATURE" | "FIX" | "UPGRADE";
  text: string;
}

// TUTAJ WPISUJESZ NOWE AKTUALIZACJE - NAJNOWSZA ZAWSZE NA SAMEJ GÓRZE
export const staticChangelogFeed: ChangelogItem[] = [
 {
    id: "1",
    version: "v 0.904",
    type: "UPGRADE",
    text: "Single airport license checker option added. DB traffic from server reduced."
  },
  {
    id: "2",
    version: "v 0.903",
    type: "FEATURE",
    text: "Dynamic database architecture optimized and cloud sweeps operational."
  },
  {
    id: "3",
    version: "v 0.902",
    type: "FIX",
    text: "Fixed hydration mismatches and stabilized dashboard components."
  },
  {
    id: "4",
    version: "v 0.901",
    type: "UPGRADE",
    text: "Upgraded edge server transport layers for smoother performance."
  }
];
