/* global window, performance, requestAnimationFrame */
// Run in a dev browser after joining a match as debug:
// agent-browser eval --stdin < scripts/benchmarks/browser-rendering.benchmark.js
// Poll: agent-browser eval 'window.lastBrowserRenderingBenchmark'
// This measures real Pixi/HUD/minimap/lighting frames, not just interpolation.
window.lastBrowserRenderingBenchmark = { status: "running" };
window.browserRenderingBenchmarkPromise = (async () => {
  const client = window.gameClient;
  const world = client?.worldState?.clientWorld;
  if (!client?.isInActiveMatch() || !world || world.entities.size < 200) {
    throw new Error(
      "Join a match as debug first (the benchmark needs the full map).",
    );
  }
  const renderer = client.renderer;
  const view = renderer.worldView;
  const structures = [...world.entities.values()].filter(
    (entity) => entity.kind === "structure",
  );
  const villages = view.mapState.features.filter(
    (feature) => feature.role === "village",
  );
  const center = villages
    .map((feature) => ({
      x: feature.centerX,
      y: feature.centerY,
      nearbyStructures: structures.filter(
        (entity) =>
          Math.hypot(entity.x - feature.centerX, entity.y - feature.centerY) <
          900,
      ).length,
    }))
    .sort((a, b) => b.nearbyStructures - a.nearbyStructures)[0];
  if (!center) throw new Error("No village scene found");
  const original = {
    night: view.gridNightBlend,
    infrastructure: { ...view.infrastructureState },
    suppressed: view.lightsOutSuppressed,
  };
  const summarize = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: sorted.length,
      meanMs: values.reduce((a, b) => a + b, 0) / values.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      maxMs: sorted.at(-1),
    };
  };
  const scenes = [];
  client.stopFrameLoop();
  try {
    for (const scene of [
      "day-stationary",
      "night-stationary",
      "night-moving",
    ]) {
      const intervals = [],
        cpu = [],
        entitySync = [],
        draw = [];
      let previous;
      for (let frame = 0; frame < 150; frame++) {
        const time = await new Promise((resolve) =>
          requestAnimationFrame(resolve),
        );
        const delta = previous === undefined ? 16.67 : time - previous;
        previous = time;
        const start = performance.now();
        client.interpolator.updateInterpolation(
          client.worldState,
          time,
          delta,
          client.playerEntityId,
        );
        const syncStart = performance.now();
        client.presentationSink.update(delta, world);
        const drawStart = performance.now();
        renderer.setGridNightBlend(scene === "day-stationary" ? 0 : 1);
        renderer.setLightsOutSuppressed(false);
        renderer.updateInfrastructureState({
          energyActive: false,
          commsActive: true,
        });
        const x =
          center.x +
          (scene === "night-moving" ? Math.sin(frame / 30) * 180 : 0);
        renderer.setCameraToPlayer(x, center.y);
        renderer.setPlayerPosition(x, center.y);
        renderer.update(delta);
        if (frame >= 30) {
          intervals.push(delta);
          cpu.push(performance.now() - start);
          entitySync.push(drawStart - syncStart);
          draw.push(performance.now() - drawStart);
        }
      }
      scenes.push({
        scene,
        frameInterval: summarize(intervals),
        frameCpu: summarize(cpu),
        entitySync: summarize(entitySync),
        pixiHudMinimapLighting: summarize(draw),
      });
    }
    const report = {
      measurement:
        "real browser rAF and CPU submission; GPU time is not isolated",
      tickRate: client.gameConfig.tickRate,
      entities: world.entities.size,
      structures: structures.length,
      viewport: {
        width: renderer.app.screen.width,
        height: renderer.app.screen.height,
        resolution: renderer.app.renderer.resolution,
      },
      center,
      scenes,
      netcode: client.getNetcodeDebugMetrics(),
    };
    window.lastBrowserRenderingBenchmark = report;
    return report;
  } finally {
    renderer.setGridNightBlend(original.night);
    renderer.updateInfrastructureState(original.infrastructure);
    renderer.setLightsOutSuppressed(original.suppressed);
    client.startFrameLoop();
  }
})().catch((error) => {
  window.lastBrowserRenderingBenchmark = {
    status: "failed",
    error: String(error),
  };
});
window.console.info(
  "Browser benchmark started; poll window.lastBrowserRenderingBenchmark for results.",
);
