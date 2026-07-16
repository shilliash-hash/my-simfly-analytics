// Income Intelligence — thin server function.
// Reads the shared income ledger produced by getSimflyPayload and classifies
// it. No SQL, no re-scanning. Single accounting source.

import { createServerFn } from "@tanstack/react-start";
import { classify, type IncomeRange, type IncomeReport } from "./income-classifier";

export type { IncomeRange, IncomeReport } from "./income-classifier";
// Legacy alias — routes/income.tsx still imports IncomeSummaryPayload.
export type IncomeSummaryPayload = IncomeReport;

export const getIncomeSummary = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; range?: IncomeRange }) => ({
    username: d?.username,
    range: (d?.range ?? "30d") as IncomeRange,
  }))
  .handler(async ({ data }): Promise<IncomeReport> => {
    const { getSimflyPayload } = await import("./simfly.functions");
    const payload = await getSimflyPayload({
      data: data.username ? { username: data.username } : undefined,
    });
    const ledger = payload.incomeLedger;
    if (!ledger) {
      // Should not happen — getSimflyPayload always attaches the ledger.
      return classify(
        {
          myFlights: [],
          visitorFlights: [],
          ownedAircraft: [],
          ownedAirports: [],
          window: { earliestIso: null, latestIso: null },
        },
        data.range,
      );
    }
    return classify(ledger, data.range);
  });

