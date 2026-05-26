/**
 * Lighthouse performance budgets.
 *
 * Lenient thresholds — running in Kind (local Docker network, no CDN).
 * Production would tighten these to Core Web Vitals "good" thresholds.
 *
 * Owner tags route alerts to the responsible team in a multi-repo setup.
 */

export interface InteractionBudget {
  owner: string;
  inp: number;
  tbt: number;
  cls: number;
}

export interface NavigationBudget {
  lcp: number;
  cls: number;
  tbt: number;
  fcp: number;
}

export interface Budgets {
  navigation: NavigationBudget;
  interactions: Record<string, InteractionBudget>;
}

export const budgets: Budgets = {
  navigation: {
    lcp: 10000,
    cls: 0.1,
    tbt: 500,
    fcp: 6000,
  },
  interactions: {
    "type-text": {
      owner: "ui",
      inp: 500,
      tbt: 200,
      cls: 0.05,
    },
    "click-classify": {
      owner: "ui",
      inp: 300,
      tbt: 200,
      cls: 0,
    },
    "result-displayed": {
      owner: "service-a",
      inp: 5000,
      tbt: 500,
      cls: 0.05,
    },
  },
};
