const commands = [
  ["benchmark:network-aoi", ["bun", "run", "benchmark:network-aoi"]],
  ["benchmark:server-scenarios", ["bun", "run", "benchmark:server-scenarios"]],
  ["benchmark:pathfinding", ["bun", "run", "benchmark:pathfinding"]],
  ["benchmark:collision", ["bun", "run", "benchmark:collision"]],
  ["benchmark:combat-burst", ["bun", "run", "benchmark:combat-burst"]],
  ["benchmark:long-run", ["bun", "run", "benchmark:long-run"]],
  [
    "benchmark:multiplayer-scale",
    ["bun", "run", "benchmark:multiplayer-scale"],
  ],
] as const;

const startedAt = performance.now();

const results = [];
for (const [name, command] of commands) {
  const childProcess = Bun.spawn([...command], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text(),
    childProcess.exited,
  ]);
  results.push({ name, stdout, stderr, exitCode });
}

for (const result of results) {
  console.log(`\n=== ${result.name} exit=${result.exitCode} ===`);
  if (result.stdout.trim()) {
    console.log(result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    console.error(result.stderr.trimEnd());
  }
}

const failed = results.filter((result) => result.exitCode !== 0);
console.log(
  `\nall benchmarks completed in ${((performance.now() - startedAt) / 1000).toFixed(2)}s`,
);
if (failed.length > 0) {
  throw new Error(
    `failed benchmarks: ${failed.map((result) => result.name).join(", ")}`,
  );
}
