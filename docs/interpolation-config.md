# Interpolation Configuration

This project now treats interpolation behavior as runtime config that flows from `GameConfig` to the client via `/runtime-config`.

The knobs below all live under `gameConfig.interpolation` in `packages/shared/src/config/GameConfig.ts` and can be overridden with environment variables on the server.

## Core buffering and timing knobs

- `snapDistance` (`INTERPOLATION_SNAP_DISTANCE`, default `192`)
  - Base distance budget used by hard snap thresholds.
  - Increase: fewer hard snaps, but larger authoritative errors can persist longer before correction.
  - Decrease: more aggressive snapping back to server state.

- `historySize` (`INTERPOLATION_HISTORY_SIZE`, default `8`)
  - Number of snapshot frames retained in client world/entity history.
  - Increase: smoother interpolation under jitter and better tick-duration estimation, with slightly higher memory and per-frame search cost.
  - Decrease: lower memory/cost, but more frequent hold/extrapolate behavior.

- `tickDurationSmoothing` (`INTERPOLATION_TICK_DURATION_SMOOTHING`, default `0.2`)
  - EWMA factor for tracking observed server tick duration.
  - Increase: adapts faster to true tick-rate shifts, but noisier under jitter.
  - Decrease: more stable estimate, but slower adaptation.

- `tickDurationMinFactor` (`INTERPOLATION_TICK_DURATION_MIN_FACTOR`, default `0.7`)
- `tickDurationMaxFactor` (`INTERPOLATION_TICK_DURATION_MAX_FACTOR`, default `1.4`)
  - Clamp range for measured tick duration as a factor of expected tick duration.
  - Wider range: tolerates bigger server/network variation before clamping; can track unstable cadence better.
  - Narrower range: more stable estimate, but can underreact during real cadence changes.

## Adaptive jitter buffer (Option 1)

- `minRenderDelayTicks` (`INTERPOLATION_MIN_RENDER_DELAY_TICKS`, default `0.9`)
- `maxRenderDelayTicks` (`INTERPOLATION_MAX_RENDER_DELAY_TICKS`, default `3.2`)
  - Lower/upper bounds of render delay behind estimated server time.
  - Higher max: stronger jitter resistance and fewer snaps, but increases visual latency.
  - Lower max: lower latency, but more risk of extrapolate/hold/snap bursts when packets are uneven.

- `renderDelaySmoothing` (`INTERPOLATION_RENDER_DELAY_SMOOTHING`, default `0.15`)
  - EWMA factor for how quickly rendered delay follows the adaptive target.
  - Increase: quicker delay response to jitter spikes; can feel more elastic.
  - Decrease: smoother delay changes; can lag behind sudden jitter changes.

- `arrivalEwmaSmoothing` (`INTERPOLATION_ARRIVAL_EWMA_SMOOTHING`, default `0.12`)
  - EWMA factor for per-tick snapshot arrival interval.
  - Increase: tracks latest arrival cadence quickly, more sensitive to noise.
  - Decrease: steadier baseline arrival estimate.

- `jitterEwmaSmoothing` (`INTERPOLATION_JITTER_EWMA_SMOOTHING`, default `0.12`)
  - EWMA factor for arrival deviation (jitter estimate).
  - Increase: jitter estimate reacts quickly.
  - Decrease: jitter estimate is steadier but slower.

- `jitterBufferMultiplier` (`INTERPOLATION_JITTER_BUFFER_MULTIPLIER`, default `2`)
  - Multiplier applied to EWMA jitter when computing target playout delay.
  - Increase: significantly reduces snaps under bursty jitter at the cost of delay.
  - Decrease: lower latency but less jitter tolerance.

- `jitterBufferSafetyMs` (`INTERPOLATION_JITTER_BUFFER_SAFETY_MS`, default `8`)
  - Constant safety margin added to playout delay.
  - Increase: extra protection against jitter outliers.
  - Decrease: trims latency but removes guard band.

- `maxExtrapolationTicks` (`INTERPOLATION_MAX_EXTRAPOLATION_TICKS`, default `0.5`)
  - Maximum extrapolation when render time gets ahead of newest server frame.
  - Increase: fewer immediate holds during short gaps, but larger potential misprediction.
  - Decrease: tighter authority adherence, but more visible stalls when packets are late.

## Follow smoothing and correction behavior (Option 2)

- `correctionFollowSharpness` (`INTERPOLATION_CORRECTION_FOLLOW_SHARPNESS`, default `18`)
  - Exponential follow rate for non-hard-snap correction.
  - Increase: converges to target faster (less lag, more abrupt).
  - Decrease: smoother, softer correction (more trailing).

- `correctionEpsilon` (`INTERPOLATION_CORRECTION_EPSILON`, default `0.01`)
  - Deadzone distance under which position snaps directly to target.
  - Increase: suppresses tiny oscillation at very low error.
  - Decrease: tighter precision, potentially more tiny micro-adjustments.

- `correctionFrameScaleMin` (`INTERPOLATION_CORRECTION_FRAME_SCALE_MIN`, default `0.5`)
- `correctionFrameScaleMax` (`INTERPOLATION_CORRECTION_FRAME_SCALE_MAX`, default `2.5`)
  - Clamp for delta-time scaling of per-frame correction budget.
  - Higher max: allows larger correction on long frames (faster catch-up after hitches).
  - Lower max: avoids huge one-frame corrections after hitches.
  - Higher min: guarantees stronger correction on very short frames.
  - Lower min: gentler correction at high frame rates.

## Debug and observability

- `maxDebugLogEntries` (`INTERPOLATION_MAX_DEBUG_LOG_ENTRIES`, default `600`)
  - Number of interpolation debug frames retained for inspection/export.
  - Increase: longer history for tuning and diagnosis.
  - Decrease: lower memory footprint.

## Practical tuning guidance

- To prioritize smoothness under poor networks: increase `maxRenderDelayTicks`, `jitterBufferMultiplier`, and maybe `jitterBufferSafetyMs`.
- To prioritize low latency on stable networks: decrease `maxRenderDelayTicks`, `jitterBufferMultiplier`, and `jitterBufferSafetyMs`.
- If corrections feel too snappy: lower `correctionFollowSharpness`.
- If corrections feel too floaty: raise `correctionFollowSharpness` modestly.
