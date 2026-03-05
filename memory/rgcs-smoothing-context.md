# RGCS Smoothing Development — Active Context
*Last updated: 2026-03-04*

## Project Overview
Room-scale Gravity Compensation System — VR controller smoothing via OneEuro/KimiOneEuro low-pass filtering.
- Device 0 = HMD, Device 5 = Left Controller, Device 6 = Right Controller
- Repo: ragesaq's RGCS project (GitHub, build agent pushes/tags)
- Current version in testing: v1.2.348

## Architecture
- **Driver** (C++ DLL): `driver_00rgcs.dll` — lives in SteamVR drivers dir
  - `DeviceHandle.cpp` / `DeviceSmoothing` class — core smoothing logic
  - KimiOneEuro filter: exponential cutoff curve `effectiveMinCutoff = minCutoff * pow(kCutoffRatio, strength)`
  - Rotation cutoff = position cutoff * 0.4 (kRotCutoffRatio)
  - Telemetry: `SmoothingTelemetry deviceId= strength= ... avgPosDeltaMm= maxPosDeltaMm= avgRotDeltaDeg= maxRotDeltaDeg= samples=`
  - Init log: `[SMOOTHING] KimiOneEuro filters initialized: minCutoff=X beta=X dCutoff=X strength=X`
  - Param change log: `>>> OneEuro params changed for device N` + `minCutoff= beta= dCutoff=`
- **Overlay** (Qt/QML C++ app): sends config to driver via shared memory IPC
  - `InputSmoothingController.cpp` — `applySettings()`, `applyToAllDevices()`
  - QML smoothing page — sliders for HMD/controller strength, beta, minCutoff
  - IPC arrives ~300ms after driver start
- **Preset system**: DiagMax, Recommended, High, Low presets
- **Normalization**: `CONTROLLER_MAX_PHYSICAL = 0.16f` — physical strength / 0.16 = normalized value sent to driver

## Bug History

### Bug 1: QML `onValueChanged` init race (FIXED in v1.2.331)
- QML slider `value: 0.15` / `value: 0.02` defaults fired `onValueChanged` during construction
- This happened BEFORE `Component.onCompleted` → before `updatingFromBackend` guard was set
- Result: every page load wrote 15% controller / 2% HMD to driver, overriding saved settings
- **Fix**: Set `updatingFromBackend: true` as default property, only cleared after `refreshDisplay()` loads backend values
- Added `[SMOOTHING_APPLY]` structured logging in C++ and QML `console.log` breadcrumbs
- **Status**: Fixed, pushed, confirmed working

### Bug 2: Double-bake / kCutoffRatio history
- Old DLL versions had `kCutoffRatio = 0.2` (weak curve), then `kCutoffRatio = 0.01` (correct)
- Earlier builds logged `minCutoff=` in SmoothingTelemetry; current HEAD logs same fields
- Previous "stale DLL" issues where build agent pulled wrong commit
- **v1.2.348 DLL confirmed**: built from HEAD, `kCutoffRatio` string absent from binary (constant inlined by compiler), version string present

### Bug 3: IPC timing race — filters init before IPC config arrives (CURRENT WORK)
- Driver KimiOneEuro filters construct at first pose using `m_oneEuroMinCutoff` from INI (~1.5Hz default)
- IPC config (with real 5.0Hz minCutoff) arrives ~300ms later
- `updateFilterParameters()` updates live filters — but they were seeded wrong
- **Proposed fix**: Deferred init — `m_filtersReady` flag, pass-through raw pose until IPC config arrives, then init filters with correct params on first call

### Bug 4: Controller enumeration race (SEPARATE BUG)
- When RGCS overlay opens after SteamVR is already running, it misses `DeviceActivated` events for already-connected controllers
- Controllers only visible after disconnect/reconnect
- **Proposed fix**: `scanExistingDevices()` on overlay init — walk all `k_unMaxTrackedDeviceCount` slots, call `GetTrackedDeviceClass()`, call `onDeviceActivated()` for any controller/tracker found

## Current Task
Write patches for BOTH fixes:
1. **Deferred filter init** in driver (`DeviceHandle.cpp` / `DeviceSmoothing`)
2. **Startup device scan** in overlay (wherever `VREvent_TrackedDeviceActivated` is handled)

**Blocked on**: need source files. User is fetching them.

## Key Parameters
- `minCutoff = 5.0Hz` (configured), actual effective depends on strength via exponential curve
- `kCutoffRatio = 0.01` (current, inlined — strong curve)
- `kRotCutoffRatio = 0.4` (rotation cutoff = 40% of position cutoff)
- `CONTROLLER_MAX_PHYSICAL = 0.16` (normalization cap — constrains DiagMax to effectively mild smoothing)
- DiagMax sends physical 0.16 → normalizes to 1.0 → driver applies `5.0 * 0.01^1.0 = 0.05Hz`
- beta=0.07, dCutoff=2.0 are recommended target values

## What Was Confirmed Working
- v1.2.329 (commit 8d2c97d): smoothing was "overwhelming" — too strong but proved concept
- v1.2.331+: QML init bug fixed, structured logging added
- v1.2.348 DLL: correct build, kCutoffRatio inlined correctly

## Standalone Product Idea
Subtle HMD smoothing for streamers/content creators — "StreamSmooth" mode. Imperceptible to wearer (~3-5% strength, 2-3Hz cutoff) but makes recorded/live VR video dramatically smoother. Real gap in the market.
