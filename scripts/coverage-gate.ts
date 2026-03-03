import { existsSync, readFileSync } from "node:fs";

type CoverageSummary = {
  total?: {
    lines?: { pct?: number };
    branches?: { pct?: number };
  };
};

const summaryPath =
  process.env.COVERAGE_SUMMARY_PATH ?? "coverage/coverage-summary.json";

if (!existsSync(summaryPath)) {
  const allowMissingSummary =
    process.env.COVERAGE_ALLOW_MISSING_SUMMARY === "1";
  if (allowMissingSummary) {
    console.warn(
      `[coverage-gate] summary not found at ${summaryPath}; skipping gate due to COVERAGE_ALLOW_MISSING_SUMMARY=1.`,
    ); // eslint-disable-line no-console
    process.exit(0);
  }
  console.error(
    `[coverage-gate] summary not found at ${summaryPath}; failing gate.`,
  ); // eslint-disable-line no-console
  process.exit(1);
}

const raw = readFileSync(summaryPath, "utf8");
const parsed = JSON.parse(raw) as CoverageSummary;

const linePct = parsed.total?.lines?.pct ?? 0;
const branchPct = parsed.total?.branches?.pct ?? 0;

const minLines = Number(process.env.COVERAGE_MIN_LINES ?? 60);
const minBranches = Number(process.env.COVERAGE_MIN_BRANCHES ?? 50);

if (linePct < minLines || branchPct < minBranches) {
  console.error(
    `[coverage-gate] failed: lines=${linePct.toFixed(2)} (min ${minLines}), branches=${branchPct.toFixed(2)} (min ${minBranches})`,
  ); // eslint-disable-line no-console
  process.exit(1);
}

console.log(
  // eslint-disable-line no-console
  `[coverage-gate] passed: lines=${linePct.toFixed(2)} branches=${branchPct.toFixed(2)}.`,
);
