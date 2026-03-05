# Session: 2026-03-04 09:38:38 UTC

- **Session Key**: agent:channel-mini:discord:channel:1478240533557022730
- **Session ID**: 2ab361b9-2149-408e-85ee-ef6133795b73
- **Source**: discord

## Conversation Summary

assistant: The QML HMD buttons hardcode `/0.02` and `*0.02` divisors. These are correct for `HMD_MAX_PHYSICAL=0.02f`. But the actual math for 1% UI:
- `newPhysical = (1.0/100.0) * 0.02 = 0.0002`
- Normalized: `0.0002 / 0.02 = 0.01`
- `effCutoff = 5.0 × 0.01^0.01 ≈ 4.77 Hz`
- Lag at 4.77 Hz: `1/(2π×4.77) ≈ 33ms`

33ms of added latency on head tracking is genuinely nauseating. So ragesaq's experience is correct — the math confirms it. The fix isn't the range, it's that the HMD filter uses the same exponential curve as controllers, but HMD is FAR more sensitive to latency than controllers.

The real fix: **use a different curve for HMD** — much steeper exponential so that even at 50% HMD strength, the cutoff stays above 10 Hz. Something like using `0.001^strength` instead of `0.01^strength` for HMD, or using a separate `kHmdMinCutoffBase` that's higher.

Or simpler: change `kHmdBaseMinCutoff` from `4.0 Hz` to `20.0 Hz`. Then at 100% strength: `20.0 × 0.01^1.0 = 0.2 Hz` (max lag), at 50%: `20.0 × 0.01^0.5 = 2.0 Hz`, at 1%: `20.0 × 0.01^0.01 = 19.05 Hz` → lag ≈ 8ms. Much better.

This is the right approach — HMD `minCutoff` base should be much higher to shift the entire usable range to lower-lag territory. Let me check where `kHmdBaseMinCutoff` or the HMD-specific minCutoff is set:
assistant: `kHmdMinCutoff = 4.0f`. I'll raise this to `20.0f`. That shifts the HMD range dramatically — at 1% UI, lag drops from 33ms to ~8ms. At 100% UI (DiagMax), cutoff = `20.0 × 0.01^1.0 = 0.2 Hz` — still very aggressive for diagnostic use. Also update the default loadSettings, applyPreset references, and the driver-side `m_oneEuroMinCutoff` for device class HMD.
assistant: Now update the loadSettings defaults (two places) and also update the migration guard to detect stale `4.0` and remap:
assistant: Also update the profile loadSettings at line 884:
assistant: Now also update the driver-side HMD minCutoff default so it matches. Check what the driver uses:
assistant: The driver's default `m_oneEuroMinCutoff = 5.0f` is for controllers. The HMD's `minCutoff` gets set from the overlay IPC config via `setOneEuroParams(minCutoff, beta, dCutoff)`. The overlay sends `m_oneEuroParams[0].minCutoff = 20.0f` for HMD now, which will flow through IPC correctly. The driver default only matters if IPC hasn't arrived yet — and it's per-device class, so this is fine. No driver change needed for this.

Now bump to v1.2.354 and commit:
assistant: [[reply_to_current]] `30cf996` — three things fixed:

---

**1. Notchy at 10 o'clock roll — root cause found and fixed**

The quaternion filter was filtering only x/y/z and *reconstructing* w from the unit-sphere constraint (`w = √(1 - x² - y² - z²)`). This breaks badly when the controller is rolled ~180° from identity (10 o'clock is right in that zone) — at that orientation `|x,y,z|` ≈ 1.0, so `wSq` ≈ 0, and small independent drift in the filtered x/y/z components blows up into large w errors. The result is the jump-around behavior you described, specifically in that orientation.

Fix: added a 4th filter for w, filter all four components independently, then normalize. Sign canonicalization before filtering keeps them all consistent. This should eliminate the orientation-dependent notchiness entirely.

**2. HMD 1% still too strong — confirmed by math, fixed**

At the old `minCutoff=4.0 Hz` base: 1% UI → effective cutoff ≈ 3.8 Hz → **~42ms of added latency**. The vestibular system detects lag at ~20ms, so 1% was genuinely perceptible. Raised HMD base to `20.0 Hz`:
- 1% → ~19 Hz → ~8ms lag (imperceptible)
- 25% (default) → ~4 Hz → ~40ms (light stabilization)
- 50% → ~2 Hz → meaningful hold
- 100% (DiagMax) → 0.2 Hz (brick-wall reference)

Migration guard remaps saved `4.0` → `20.0` automatically — no need to delete ini.

**3. One Euro layout + drag issue — fixed**

- The section had a hardcoded `height: 250` but the actual content (4 rows of controls + labels + spacing) is ~420px — it was visually clipping and the overflow was landing directly on top of the Recommended/Default buttons
- Switched to `implicitHeight: oneEuroColumn.implicitHeight + 24` so it sizes to actual content
- Added a `MouseArea` blocker inside the rectangle so ScrollView stops eating button presses as scroll drag events

---

Re calibration drift — `947ffe1`'s fix (rotate by `qOrig` not `qFinal`) is already in current main. The drift ragesaq is seeing now may be a separate interaction with the rotation smoothing filter introducing small per-frame rotation that compounds over time in the offset path. Worth logging `[EffectiveConfig]` during the drifting session to see if smoothing is enabled and what strength — can you share the driver log from the session where you noticed it?
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

### Facts

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

**Status:** All identified improvements from summary are now implemented and production-ready. Two deferred optional enhancements (cluster monitoring, auto-tuning) available for future Phase 3.

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

### Contexts

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[media attached: 5 files]
[media attached 1/5: /home/lumadmin/.openclaw/media/inbound/8d9662a3-c22a-4506-ad16-07a94d2f7680.txt (text/plain) | /home/lumadmin/.openclaw/media/inbound/8d9662a3-c22a-4506-ad16-07a94d2f7680.txt]
[media attached 2/5: /home/lumadmin/.openclaw/media/inbound/139ae26d-4cf9-43b8-8b0b-747369495c7c.txt (text/plain) | /home/lumadmin/.openclaw/media/inbound/139ae26d-4cf9-43b8-8b0b-747369495c7c.txt]
[media attached 3/5: https://cdn.discordapp.com/attachments/1478240533557022730/1478685143026892981/driver.log?ex=69a94c5a&is=69a7fada&hm=ac8f3252042cff71de99bc0ff0fb5b30b95a26ba3d814fe86621862e68fb729e& (text/plain; charset=utf-8) | https://cdn.discordapp.com/attachments/1478240533557022730/1478685143026892981/driver.log?ex=69a94c5a&is=69a7fada&hm=ac8f3252042cff71de99bc0ff0fb5b30b95a26ba3d814fe86621862e68fb729e&]
[media attached 4/5: /home/lumadmin/.openclaw/media/inbound/96da1c84-c777-447f-a07d-f702980c1c5e.txt (text/plain) | /home/lumadmin/.openclaw/media/inbound/96da1c84-c777-447f-a07d-f702980c1c5e.txt]
[media attached 5/5: /home/lumadmin/.openclaw/media/inbound/c8bc256c-3977-4c07-8bd5-6c597d3be901.txt (text/plain) | /home/lumadmin/.openclaw/media/inbound/c8bc256c-3977-4c07-8bd5-6c597d3be901.txt]
To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg. Avoid absolute paths (MEDIA:/...) and ~ paths — they are blocked for security. Keep caption in the text body.
[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478685144050171945",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:26 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

[Discord Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730 Wed 2026-03-04 09:26 UTC] ragesaq: <media:document> (5 files)

<file name="8d9662a3-c22a-4506-ad16-07a94d2f7680.txt" mime="text/plain">
[2026-03-04 01:12:39.361] [STARTUP] RGCS_gunstock log started (version=v1.2.360)
[2026-03-04 01:12:39.361] Connected to RGCS driver via SharedMemoryIPC
[2026-03-04 01:12:39.361] loadReticleManualOffset: X=0.0000 Y=0.0000 rad (0.00, 0.00 deg)
[2026-03-04 01:12:39.361] loadReticleDepth: 5.50 m
[2026-03-04 01:13:12.911] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=39581 ms, source=system button deactivate seq=0
[2026-03-04 01:13:12.921] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:13:13.593] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=682 ms, source=system button activate seq=1
[2026-03-04 01:13:13.593] Dashboard opened - forcing device refresh
[2026-03-04 01:13:13.597] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:13:59.657] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=46062 ms, source=system button deactivate seq=2
[2026-03-04 01:13:59.660] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:14:01.052] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=1395 ms, source=system button activate seq=3
[2026-03-04 01:14:01.052] Dashboard opened - forcing device refresh
[2026-03-04 01:14:01.055] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:14:22.571] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=21519 ms, source=system button deactivate seq=4
[2026-03-04 01:14:22.575] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:14:24.333] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=1761 ms, source=system button activate seq=5
[2026-03-04 01:14:24.333] Dashboard opened - forcing device refresh
[2026-03-04 01:14:24.336] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:14:33.674] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=9341 ms, source=system button deactivate seq=6
[2026-03-04 01:14:33.677] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:14:49.357] applyProfile: Loading and applying profile 'EZ : SA58'
[2026-03-04 01:14:49.361] applyProfileOffsetsToControllers: Applying profile 'EZ : SA58' offsets to both controllers
[2026-03-04 01:14:49.361] -> Left: pitch=4.17, yaw=1.21, roll=0.00, x=-3.146, y=0.791, z=-0.974
[2026-03-04 01:14:49.361] setRotationOffsets: role=Left, pitch=4.17, yaw=1.21, roll=0.00
[2026-03-04 01:14:49.361] -> OpenVR deviceId for Left = 6
[2026-03-04 01:14:49.361] -> Preserving existing translation: x=0.000, y=0.000, z=0.000
[2026-03-04 01:14:49.361] -> Applying via SharedMemoryIPC: rot(pitch=-0.000,yaw=-1.206,roll=-4.174)
[2026-03-04 01:14:49.363] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:14:49.364] setTranslationOffsets: role=Left, x=-3.15, y=0.79, z=-0.97
[2026-03-04 01:14:49.364] -> OpenVR deviceId for Left = 6
[2026-03-04 01:14:49.364] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:14:49.364] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.031m)
[2026-03-04 01:14:49.371] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:14:49.373] -> Right: pitch=0.67, yaw=0.67, roll=18.15, x=-3.574, y=-0.258, z=-0.125
[2026-03-04 01:14:49.373] setRotationOffsets: role=Right, pitch=0.67, yaw=0.67, roll=18.15
[2026-03-04 01:14:49.373] -> OpenVR deviceId for Right = 5
[2026-03-04 01:14:49.373] -> Preserving existing translation: x=0.000, y=0.000, z=0.000
[2026-03-04 01:14:49.373] -> Applying via SharedMemoryIPC: rot(pitch=0.673,yaw=0.672,roll=18.152)
[2026-03-04 01:14:49.376] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:14:49.377] setTranslationOffsets: role=Right, x=-3.57, y=-0.26, z=-0.13
[2026-03-04 01:14:49.377] -> OpenVR deviceId for Right = 5
[2026-03-04 01:14:49.377] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:14:49.377] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.003m, z=-0.001m)
[2026-03-04 01:14:49.379] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:14:49.380] applyProfileOffsetsToControllers: DONE
[2026-03-04 01:14:49.380] applyProfile: Profile 'EZ : SA58' loaded and applied successfully
[2026-03-04 01:15:37.693] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=64018 ms, source=system button activate seq=7
[2026-03-04 01:15:37.693] Dashboard opened - forcing device refresh
[2026-03-04 01:15:37.700] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:15:44.053] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=6360 ms, source=system button deactivate seq=8
[2026-03-04 01:15:44.058] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:15:52.052] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=7998 ms, source=system button activate seq=9
[2026-03-04 01:15:52.052] Dashboard opened - forcing device refresh
[2026-03-04 01:15:52.056] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:16:04.273] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=12220 ms, source=system button deactivate seq=10
[2026-03-04 01:16:04.277] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:16:08.491] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=4218 ms, source=system button activate seq=11
[2026-03-04 01:16:08.491] Dashboard opened - forcing device refresh
[2026-03-04 01:16:08.496] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:16:12.512] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=4020 ms, source=system button deactivate seq=12
[2026-03-04 01:16:12.516] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:16:23.251] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=10739 ms, source=system button activate seq=13
[2026-03-04 01:16:23.251] Dashboard opened - forcing device refresh
[2026-03-04 01:16:23.255] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:18.432] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=55179 ms, source=system button deactivate seq=14
[2026-03-04 01:17:18.439] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:23.633] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=5201 ms, source=system button activate seq=15
[2026-03-04 01:17:23.633] Dashboard opened - forcing device refresh
[2026-03-04 01:17:23.636] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:30.613] startAdjustmentMode: role=Left, mode=rotation, currentlyActive=0
[2026-03-04 01:17:30.614] FindOverlay result: error=10, handle=0
[2026-03-04 01:17:30.614] CreateOverlay result: error=0, handle=231928234022
[2026-03-04 01:17:30.614] createOverlayTexture: ENTRY - mode=rotation, controller=Left, width=600, height=280
[2026-03-04 01:17:30.614] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:17:30.614] createOverlayTexture: QImage created and filled
[2026-03-04 01:17:30.614] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:17:30.632] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:17:30.632] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:17:30.632] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:17:30.633] ShowOverlay result: error=0
[2026-03-04 01:17:30.634] Adjustment mode started successfully
[2026-03-04 01:17:30.634] Input focus capture: SUCCESS
[2026-03-04 01:17:30.636] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:31.251] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=7618 ms, source=system button deactivate seq=16
[2026-03-04 01:17:31.256] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:17:32.071] cycleAdjustmentMode: ENTRY - current mode=rotation
[2026-03-04 01:17:32.071] cycleAdjustmentMode: About to change mode from rotation
[2026-03-04 01:17:32.071] cycleAdjustmentMode: State changed to POSITION mode
[2026-03-04 01:17:32.071] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=translation
[2026-03-04 01:17:32.071] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:17:32.071] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:17:32.071] createOverlayTexture: QImage created and filled
[2026-03-04 01:17:32.071] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:17:32.075] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:17:32.075] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:17:32.075] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:17:32.075] updateFloatingOverlay: Updated overlay with mode=translation, controller=Left
[2026-03-04 01:17:32.075] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:17:32.075] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=translation
[2026-03-04 01:17:32.076] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:17:32.511] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:17:32.511] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:17:32.511] createOverlayTexture: QImage created and filled
[2026-03-04 01:17:32.511] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:17:32.512] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:17:32.512] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:17:32.512] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:17:32.512] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:17:34.413] setTranslationOffsets: role=Right, x=-3.57, y=-0.27, z=-0.13
[2026-03-04 01:17:34.413] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.413] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.413] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.003m, z=-0.001m)
[2026-03-04 01:17:34.417] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.446] setTranslationOffsets: role=Right, x=-3.57, y=-0.31, z=-0.13
[2026-03-04 01:17:34.446] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.446] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.446] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.003m, z=-0.001m)
[2026-03-04 01:17:34.453] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.479] setTranslationOffsets: role=Right, x=-3.57, y=-0.35, z=-0.13
[2026-03-04 01:17:34.479] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.479] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.479] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.003m, z=-0.001m)
[2026-03-04 01:17:34.485] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.512] setTranslationOffsets: role=Right, x=-3.56, y=-0.39, z=-0.13
[2026-03-04 01:17:34.512] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.512] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.512] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.004m, z=-0.001m)
[2026-03-04 01:17:34.514] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.545] setTranslationOffsets: role=Right, x=-3.55, y=-0.42, z=-0.13
[2026-03-04 01:17:34.545] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.545] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.545] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.004m, z=-0.001m)
[2026-03-04 01:17:34.548] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.579] setTranslationOffsets: role=Right, x=-3.54, y=-0.45, z=-0.13
[2026-03-04 01:17:34.579] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.579] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.579] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.005m, z=-0.001m)
[2026-03-04 01:17:34.584] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.612] setTranslationOffsets: role=Right, x=-3.54, y=-0.46, z=-0.13
[2026-03-04 01:17:34.612] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.612] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.612] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.005m, z=-0.001m)
[2026-03-04 01:17:34.617] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.809] setTranslationOffsets: role=Right, x=-3.53, y=-0.48, z=-0.13
[2026-03-04 01:17:34.809] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.809] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.809] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.005m, z=-0.001m)
[2026-03-04 01:17:34.814] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.843] setTranslationOffsets: role=Right, x=-3.50, y=-0.51, z=-0.13
[2026-03-04 01:17:34.843] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.843] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.843] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.005m, z=-0.001m)
[2026-03-04 01:17:34.845] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.875] setTranslationOffsets: role=Right, x=-3.48, y=-0.53, z=-0.13
[2026-03-04 01:17:34.875] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.875] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.875] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.005m, z=-0.001m)
[2026-03-04 01:17:34.878] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.908] setTranslationOffsets: role=Right, x=-3.45, y=-0.56, z=-0.13
[2026-03-04 01:17:34.908] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.908] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.908] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:34.912] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.942] setTranslationOffsets: role=Right, x=-3.43, y=-0.59, z=-0.13
[2026-03-04 01:17:34.942] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.942] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.942] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:34.946] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:34.974] setTranslationOffsets: role=Right, x=-3.41, y=-0.62, z=-0.13
[2026-03-04 01:17:34.974] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:34.974] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:34.974] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:34.978] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.007] setTranslationOffsets: role=Right, x=-3.38, y=-0.65, z=-0.13
[2026-03-04 01:17:35.007] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.007] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.007] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:35.011] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.239] setTranslationOffsets: role=Right, x=-3.38, y=-0.68, z=-0.13
[2026-03-04 01:17:35.239] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.239] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.239] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.007m, z=-0.001m)
[2026-03-04 01:17:35.241] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.271] setTranslationOffsets: role=Right, x=-3.37, y=-0.72, z=-0.13
[2026-03-04 01:17:35.271] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.271] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.271] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.007m, z=-0.001m)
[2026-03-04 01:17:35.273] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.305] setTranslationOffsets: role=Right, x=-3.36, y=-0.75, z=-0.13
[2026-03-04 01:17:35.306] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.306] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.306] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:35.308] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.337] setTranslationOffsets: role=Right, x=-3.35, y=-0.79, z=-0.13
[2026-03-04 01:17:35.337] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.337] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.337] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:35.343] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.639] setTranslationOffsets: role=Right, x=-3.32, y=-0.81, z=-0.13
[2026-03-04 01:17:35.639] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.639] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.639] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:35.640] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.669] setTranslationOffsets: role=Right, x=-3.29, y=-0.83, z=-0.13
[2026-03-04 01:17:35.669] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.669] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.669] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:35.676] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.703] setTranslationOffsets: role=Right, x=-3.27, y=-0.85, z=-0.13
[2026-03-04 01:17:35.703] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.703] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.703] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:35.707] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:35.998] setTranslationOffsets: role=Right, x=-3.23, y=-0.85, z=-0.13
[2026-03-04 01:17:35.998] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:35.998] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:35.998] -> Applying via SharedMemoryIPC: pos(x=-0.032m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:36.004] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:36.030] setTranslationOffsets: role=Right, x=-3.19, y=-0.85, z=-0.13
[2026-03-04 01:17:36.030] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:36.030] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:36.030] -> Applying via SharedMemoryIPC: pos(x=-0.032m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:36.038] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:36.063] setTranslationOffsets: role=Right, x=-3.15, y=-0.85, z=-0.13
[2026-03-04 01:17:36.063] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:36.063] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:36.063] -> Applying via SharedMemoryIPC: pos(x=-0.032m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:36.069] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:36.723] setTranslationOffsets: role=Right, x=-3.19, y=-0.85, z=-0.13
[2026-03-04 01:17:36.723] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:36.723] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:36.723] -> Applying via SharedMemoryIPC: pos(x=-0.032m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:36.725] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:36.756] setTranslationOffsets: role=Right, x=-3.23, y=-0.85, z=-0.13
[2026-03-04 01:17:36.756] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:36.756] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:36.756] -> Applying via SharedMemoryIPC: pos(x=-0.032m, y=-0.009m, z=-0.001m)
[2026-03-04 01:17:36.762] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.042] setTranslationOffsets: role=Right, x=-3.26, y=-0.83, z=-0.13
[2026-03-04 01:17:38.042] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.042] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.042] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:38.045] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.076] setTranslationOffsets: role=Right, x=-3.29, y=-0.81, z=-0.13
[2026-03-04 01:17:38.076] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.076] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.076] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:38.083] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.109] setTranslationOffsets: role=Right, x=-3.32, y=-0.78, z=-0.13
[2026-03-04 01:17:38.109] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.109] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.109] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:38.113] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.141] setTranslationOffsets: role=Right, x=-3.34, y=-0.76, z=-0.13
[2026-03-04 01:17:38.141] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.141] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.141] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:17:38.145] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.340] setTranslationOffsets: role=Right, x=-3.34, y=-0.75, z=-0.13
[2026-03-04 01:17:38.340] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.340] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.340] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.007m, z=-0.001m)
[2026-03-04 01:17:38.343] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.373] setTranslationOffsets: role=Right, x=-3.34, y=-0.71, z=-0.13
[2026-03-04 01:17:38.374] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.374] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.374] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.007m, z=-0.001m)
[2026-03-04 01:17:38.376] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.406] setTranslationOffsets: role=Right, x=-3.33, y=-0.67, z=-0.13
[2026-03-04 01:17:38.406] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.406] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.406] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.007m, z=-0.001m)
[2026-03-04 01:17:38.410] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.439] setTranslationOffsets: role=Right, x=-3.32, y=-0.64, z=-0.13
[2026-03-04 01:17:38.439] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.439] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.439] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:38.443] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.472] setTranslationOffsets: role=Right, x=-3.32, y=-0.60, z=-0.13
[2026-03-04 01:17:38.472] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.472] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.472] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:38.476] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:38.505] setTranslationOffsets: role=Right, x=-3.32, y=-0.56, z=-0.13
[2026-03-04 01:17:38.505] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:38.505] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:38.505] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:38.508] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:39.528] setTranslationOffsets: role=Right, x=-3.32, y=-0.57, z=-0.13
[2026-03-04 01:17:39.528] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:39.528] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:39.528] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:39.532] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:39.562] setTranslationOffsets: role=Right, x=-3.32, y=-0.60, z=-0.13
[2026-03-04 01:17:39.562] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:39.562] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:39.562] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:39.569] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:39.596] setTranslationOffsets: role=Right, x=-3.32, y=-0.63, z=-0.13
[2026-03-04 01:17:39.596] -> OpenVR deviceId for Right = 5
[2026-03-04 01:17:39.596] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:17:39.596] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:17:39.598] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:17:46.111] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=14859 ms, source=system button activate seq=17
[2026-03-04 01:17:46.111] Dashboard opened - forcing device refresh
[2026-03-04 01:17:46.112] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:17:46.112] stopAdjustmentMode: active=1, handle=231928234022
[2026-03-04 01:17:46.112] Released input focus
[2026-03-04 01:17:46.117] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:46.117] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:17:46.117] Hiding and destroying overlay
[2026-03-04 01:17:46.120] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:46.127] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:17:48.418] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:17:48.916] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:17:58.211] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=12101 ms, source=system button deactivate seq=18
[2026-03-04 01:17:58.214] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:06.932] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=8719 ms, source=system button activate seq=19
[2026-03-04 01:18:06.932] Dashboard opened - forcing device refresh
[2026-03-04 01:18:06.934] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:12.371] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=5440 ms, source=system button deactivate seq=20
[2026-03-04 01:18:12.378] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:17.212] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=4840 ms, source=system button activate seq=21
[2026-03-04 01:18:17.212] Dashboard opened - forcing device refresh
[2026-03-04 01:18:17.216] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:23.132] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=5919 ms, source=system button deactivate seq=22
[2026-03-04 01:18:23.136] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:31.754] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=8622 ms, source=system button activate seq=23
[2026-03-04 01:18:31.754] Dashboard opened - forcing device refresh
[2026-03-04 01:18:31.757] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:33.991] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2237 ms, source=system button deactivate seq=24
[2026-03-04 01:18:33.995] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:41.892] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=7900 ms, source=system button activate seq=25
[2026-03-04 01:18:41.892] Dashboard opened - forcing device refresh
[2026-03-04 01:18:41.899] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:49.951] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=8058 ms, source=system button deactivate seq=26
[2026-03-04 01:18:49.957] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:18:54.472] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=4520 ms, source=system button activate seq=27
[2026-03-04 01:18:54.472] Dashboard opened - forcing device refresh
[2026-03-04 01:18:54.478] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:01.192] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:19:01.193] FindOverlay result: error=10, handle=0
[2026-03-04 01:19:01.193] CreateOverlay result: error=0, handle=236223201318
[2026-03-04 01:19:01.193] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:19:01.193] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:19:01.193] createOverlayTexture: QImage created and filled
[2026-03-04 01:19:01.193] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:19:01.200] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:19:01.200] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:19:01.200] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:19:01.200] ShowOverlay result: error=0
[2026-03-04 01:19:01.201] Adjustment mode started successfully
[2026-03-04 01:19:01.201] Input focus capture: SUCCESS
[2026-03-04 01:19:01.204] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:01.811] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=7339 ms, source=system button deactivate seq=28
[2026-03-04 01:19:01.814] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:19:04.371] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:19:04.371] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:19:04.371] createOverlayTexture: QImage created and filled
[2026-03-04 01:19:04.371] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:19:04.372] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:19:04.372] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:19:04.372] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:19:04.373] updateFloatingOverlay: Updated overlay with mode=translation, controller=Left
[2026-03-04 01:19:06.279] setTranslationOffsets: role=Left, x=-3.19, y=0.79, z=-0.97
[2026-03-04 01:19:06.279] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.279] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.279] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.032m)
[2026-03-04 01:19:06.281] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.312] setTranslationOffsets: role=Left, x=-3.23, y=0.79, z=-0.97
[2026-03-04 01:19:06.312] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.312] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.312] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.032m)
[2026-03-04 01:19:06.314] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.345] setTranslationOffsets: role=Left, x=-3.26, y=0.79, z=-0.97
[2026-03-04 01:19:06.345] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.345] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.345] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.033m)
[2026-03-04 01:19:06.352] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.377] setTranslationOffsets: role=Left, x=-3.28, y=0.79, z=-0.97
[2026-03-04 01:19:06.378] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.378] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.378] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.033m)
[2026-03-04 01:19:06.380] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.773] setTranslationOffsets: role=Left, x=-3.29, y=0.79, z=-0.97
[2026-03-04 01:19:06.773] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.773] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.773] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.033m)
[2026-03-04 01:19:06.777] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.809] setTranslationOffsets: role=Left, x=-3.33, y=0.79, z=-0.97
[2026-03-04 01:19:06.809] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.809] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.809] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.033m)
[2026-03-04 01:19:06.812] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.841] setTranslationOffsets: role=Left, x=-3.37, y=0.79, z=-0.97
[2026-03-04 01:19:06.841] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.841] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.841] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.034m)
[2026-03-04 01:19:06.843] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.873] setTranslationOffsets: role=Left, x=-3.41, y=0.79, z=-0.97
[2026-03-04 01:19:06.873] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.873] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.873] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.034m)
[2026-03-04 01:19:06.877] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:06.906] setTranslationOffsets: role=Left, x=-3.42, y=0.79, z=-0.97
[2026-03-04 01:19:06.906] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:06.906] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:06.906] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.034m)
[2026-03-04 01:19:06.908] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:07.368] setTranslationOffsets: role=Left, x=-3.45, y=0.79, z=-0.97
[2026-03-04 01:19:07.368] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:07.368] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:07.368] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.034m)
[2026-03-04 01:19:07.372] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:07.403] setTranslationOffsets: role=Left, x=-3.49, y=0.79, z=-0.97
[2026-03-04 01:19:07.403] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:07.403] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:07.403] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.035m)
[2026-03-04 01:19:07.405] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:07.434] setTranslationOffsets: role=Left, x=-3.52, y=0.79, z=-0.97
[2026-03-04 01:19:07.434] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:07.434] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:07.434] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.035m)
[2026-03-04 01:19:07.437] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:07.467] setTranslationOffsets: role=Left, x=-3.56, y=0.80, z=-0.97
[2026-03-04 01:19:07.467] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:07.467] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:07.467] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:19:07.472] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:07.996] setTranslationOffsets: role=Left, x=-3.60, y=0.80, z=-0.97
[2026-03-04 01:19:07.996] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:07.996] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:07.996] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:19:08.001] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:08.028] setTranslationOffsets: role=Left, x=-3.64, y=0.80, z=-0.97
[2026-03-04 01:19:08.028] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:08.028] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:08.028] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:19:08.037] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:08.062] setTranslationOffsets: role=Left, x=-3.68, y=0.80, z=-0.97
[2026-03-04 01:19:08.062] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:08.062] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:08.062] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:19:08.067] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:10.604] setTranslationOffsets: role=Left, x=-3.70, y=0.80, z=-0.97
[2026-03-04 01:19:10.604] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:10.604] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:10.604] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:19:10.608] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:10.642] setTranslationOffsets: role=Left, x=-3.74, y=0.80, z=-0.97
[2026-03-04 01:19:10.642] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:10.642] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:10.642] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:19:10.645] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:10.673] setTranslationOffsets: role=Left, x=-3.77, y=0.80, z=-0.97
[2026-03-04 01:19:10.673] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:10.673] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:10.673] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.038m)
[2026-03-04 01:19:10.675] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:10.703] setTranslationOffsets: role=Left, x=-3.81, y=0.80, z=-0.97
[2026-03-04 01:19:10.703] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:10.704] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:10.704] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.038m)
[2026-03-04 01:19:10.706] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:11.196] setTranslationOffsets: role=Left, x=-3.85, y=0.80, z=-0.97
[2026-03-04 01:19:11.196] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:11.196] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:11.196] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.039m)
[2026-03-04 01:19:11.203] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:11.230] setTranslationOffsets: role=Left, x=-3.89, y=0.80, z=-0.97
[2026-03-04 01:19:11.230] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:11.230] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:11.230] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.039m)
[2026-03-04 01:19:11.235] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:11.262] setTranslationOffsets: role=Left, x=-3.93, y=0.81, z=-0.97
[2026-03-04 01:19:11.262] -> OpenVR deviceId for Left = 6
[2026-03-04 01:19:11.262] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:19:11.262] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.039m)
[2026-03-04 01:19:11.266] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:19:12.752] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:19:12.752] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:19:12.752] createOverlayTexture: QImage created and filled
[2026-03-04 01:19:12.752] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:19:12.752] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:19:12.752] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:19:12.752] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:19:12.753] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:19:13.143] setTranslationOffsets: role=Right, x=-3.32, y=-0.65, z=-0.13
[2026-03-04 01:19:13.143] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.143] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.143] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.006m, z=-0.001m)
[2026-03-04 01:19:13.147] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:13.178] setTranslationOffsets: role=Right, x=-3.32, y=-0.69, z=-0.13
[2026-03-04 01:19:13.178] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.178] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.178] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.007m, z=-0.001m)
[2026-03-04 01:19:13.179] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:13.210] setTranslationOffsets: role=Right, x=-3.33, y=-0.73, z=-0.13
[2026-03-04 01:19:13.210] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.210] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.210] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.007m, z=-0.001m)
[2026-03-04 01:19:13.215] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:13.242] setTranslationOffsets: role=Right, x=-3.35, y=-0.76, z=-0.13
[2026-03-04 01:19:13.242] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.242] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.242] -> Applying via SharedMemoryIPC: pos(x=-0.033m, y=-0.008m, z=-0.001m)
[2026-03-04 01:19:13.245] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:13.840] setTranslationOffsets: role=Right, x=-3.39, y=-0.75, z=-0.13
[2026-03-04 01:19:13.840] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.840] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.840] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.007m, z=-0.001m)
[2026-03-04 01:19:13.843] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:13.870] setTranslationOffsets: role=Right, x=-3.42, y=-0.73, z=-0.13
[2026-03-04 01:19:13.870] -> OpenVR deviceId for Right = 5
[2026-03-04 01:19:13.870] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:19:13.870] -> Applying via SharedMemoryIPC: pos(x=-0.034m, y=-0.007m, z=-0.001m)
[2026-03-04 01:19:13.876] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:19:18.812] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=17000 ms, source=system button activate seq=29
[2026-03-04 01:19:18.812] Dashboard opened - forcing device refresh
[2026-03-04 01:19:18.812] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:19:18.812] stopAdjustmentMode: active=1, handle=236223201318
[2026-03-04 01:19:18.813] Released input focus
[2026-03-04 01:19:18.816] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:18.816] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:19:18.816] Hiding and destroying overlay
[2026-03-04 01:19:18.818] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:18.821] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:19.652] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=840 ms, source=system button deactivate seq=30
[2026-03-04 01:19:19.654] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:20.751] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=1099 ms, source=system button activate seq=31
[2026-03-04 01:19:20.751] Dashboard opened - forcing device refresh
[2026-03-04 01:19:20.758] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:19:21.478] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:19:22.372] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=1620 ms, source=system button deactivate seq=32
[2026-03-04 01:19:22.378] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:07.172] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=104800 ms, source=system button activate seq=33
[2026-03-04 01:21:07.172] Dashboard opened - forcing device refresh
[2026-03-04 01:21:07.178] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:15.252] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=8079 ms, source=system button deactivate seq=34
[2026-03-04 01:21:15.257] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:21.972] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=6719 ms, source=system button activate seq=35
[2026-03-04 01:21:21.972] Dashboard opened - forcing device refresh
[2026-03-04 01:21:21.978] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:28.372] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:21:28.373] FindOverlay result: error=10, handle=0
[2026-03-04 01:21:28.373] CreateOverlay result: error=0, handle=240518168614
[2026-03-04 01:21:28.373] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:21:28.373] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:21:28.373] createOverlayTexture: QImage created and filled
[2026-03-04 01:21:28.373] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:21:28.377] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:21:28.377] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:21:28.377] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:21:28.377] ShowOverlay result: error=0
[2026-03-04 01:21:28.378] Adjustment mode started successfully
[2026-03-04 01:21:28.378] Input focus capture: SUCCESS
[2026-03-04 01:21:28.381] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:28.992] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=7021 ms, source=system button deactivate seq=36
[2026-03-04 01:21:28.997] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:21:29.931] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:21:29.931] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:21:29.931] createOverlayTexture: QImage created and filled
[2026-03-04 01:21:29.931] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:21:29.932] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:21:29.932] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:21:29.932] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:21:29.932] updateFloatingOverlay: Updated overlay with mode=translation, controller=Left
[2026-03-04 01:21:31.476] setTranslationOffsets: role=Left, x=-3.89, y=0.81, z=-0.97
[2026-03-04 01:21:31.476] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.476] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.476] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.039m)
[2026-03-04 01:21:31.482] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.510] setTranslationOffsets: role=Left, x=-3.85, y=0.81, z=-0.97
[2026-03-04 01:21:31.510] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.510] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.510] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.039m)
[2026-03-04 01:21:31.511] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.542] setTranslationOffsets: role=Left, x=-3.81, y=0.81, z=-0.97
[2026-03-04 01:21:31.542] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.542] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.542] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.038m)
[2026-03-04 01:21:31.547] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.575] setTranslationOffsets: role=Left, x=-3.77, y=0.81, z=-0.97
[2026-03-04 01:21:31.575] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.575] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.575] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.038m)
[2026-03-04 01:21:31.580] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.872] setTranslationOffsets: role=Left, x=-3.73, y=0.81, z=-0.97
[2026-03-04 01:21:31.872] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.872] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.872] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:21:31.879] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.905] setTranslationOffsets: role=Left, x=-3.69, y=0.81, z=-0.97
[2026-03-04 01:21:31.905] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.905] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.905] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:21:31.909] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.937] setTranslationOffsets: role=Left, x=-3.65, y=0.81, z=-0.97
[2026-03-04 01:21:31.937] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.937] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.937] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.037m)
[2026-03-04 01:21:31.939] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:31.970] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-0.97
[2026-03-04 01:21:31.970] -> OpenVR deviceId for Left = 6
[2026-03-04 01:21:31.970] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:21:31.970] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:21:31.977] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:21:32.552] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:21:32.552] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:21:32.552] createOverlayTexture: QImage created and filled
[2026-03-04 01:21:32.552] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:21:32.552] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:21:32.552] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:21:32.552] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:21:32.554] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:21:32.964] setTranslationOffsets: role=Right, x=-3.46, y=-0.73, z=-0.13
[2026-03-04 01:21:32.964] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:32.964] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:32.964] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:32.970] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:32.994] setTranslationOffsets: role=Right, x=-3.50, y=-0.73, z=-0.13
[2026-03-04 01:21:32.994] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:32.994] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:32.994] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:32.998] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.030] setTranslationOffsets: role=Right, x=-3.54, y=-0.73, z=-0.13
[2026-03-04 01:21:33.030] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.030] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.030] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.034] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.060] setTranslationOffsets: role=Right, x=-3.58, y=-0.73, z=-0.13
[2026-03-04 01:21:33.061] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.061] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.061] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.064] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.323] setTranslationOffsets: role=Right, x=-3.62, y=-0.73, z=-0.13
[2026-03-04 01:21:33.323] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.323] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.323] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.326] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.356] setTranslationOffsets: role=Right, x=-3.66, y=-0.73, z=-0.13
[2026-03-04 01:21:33.356] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.356] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.356] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.360] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.389] setTranslationOffsets: role=Right, x=-3.70, y=-0.72, z=-0.13
[2026-03-04 01:21:33.389] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.389] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.389] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.392] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.422] setTranslationOffsets: role=Right, x=-3.74, y=-0.71, z=-0.13
[2026-03-04 01:21:33.422] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.422] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.422] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.425] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.454] setTranslationOffsets: role=Right, x=-3.77, y=-0.70, z=-0.13
[2026-03-04 01:21:33.455] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.455] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.455] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.458] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:33.488] setTranslationOffsets: role=Right, x=-3.80, y=-0.69, z=-0.13
[2026-03-04 01:21:33.488] -> OpenVR deviceId for Right = 5
[2026-03-04 01:21:33.488] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:21:33.488] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.007m, z=-0.001m)
[2026-03-04 01:21:33.491] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:21:36.732] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=7739 ms, source=system button activate seq=37
[2026-03-04 01:21:36.732] Dashboard opened - forcing device refresh
[2026-03-04 01:21:36.734] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:21:36.734] stopAdjustmentMode: active=1, handle=240518168614
[2026-03-04 01:21:36.734] Released input focus
[2026-03-04 01:21:36.739] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:36.739] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:21:36.739] Hiding and destroying overlay
[2026-03-04 01:21:36.741] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:36.745] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:37.779] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:21:38.792] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2058 ms, source=system button deactivate seq=38
[2026-03-04 01:21:38.801] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:21:50.811] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=12019 ms, source=system button activate seq=39
[2026-03-04 01:21:50.811] Dashboard opened - forcing device refresh
[2026-03-04 01:21:50.817] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:22:32.635] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=41823 ms, source=system button deactivate seq=40
[2026-03-04 01:22:32.637] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:23:43.292] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=70657 ms, source=system button activate seq=41
[2026-03-04 01:23:43.292] Dashboard opened - forcing device refresh
[2026-03-04 01:23:43.296] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:23:44.812] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=1519 ms, source=system button deactivate seq=42
[2026-03-04 01:23:44.815] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:23:50.731] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=5919 ms, source=system button activate seq=43
[2026-03-04 01:23:50.731] Dashboard opened - forcing device refresh
[2026-03-04 01:23:50.734] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:23:53.337] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:24:01.472] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=10740 ms, source=system button deactivate seq=44
[2026-03-04 01:24:01.476] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:24:12.092] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=10619 ms, source=system button activate seq=45
[2026-03-04 01:24:12.092] Dashboard opened - forcing device refresh
[2026-03-04 01:24:12.099] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:24:14.814] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2723 ms, source=system button deactivate seq=46
[2026-03-04 01:24:14.818] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:24:26.552] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=11737 ms, source=system button activate seq=47
[2026-03-04 01:24:26.552] Dashboard opened - forcing device refresh
[2026-03-04 01:24:26.557] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:09.653] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=43100 ms, source=system button deactivate seq=48
[2026-03-04 01:25:09.654] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:10.051] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=398 ms, source=system button activate seq=49
[2026-03-04 01:25:10.051] IGNORED - Too soon after last change (debouncing spurious event)
[2026-03-04 01:25:14.695] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=5042 ms, source=system button deactivate seq=50
[2026-03-04 01:25:14.697] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:24.531] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=9835 ms, source=system button activate seq=51
[2026-03-04 01:25:24.531] Dashboard opened - forcing device refresh
[2026-03-04 01:25:24.537] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:29.431] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:25:29.432] FindOverlay result: error=10, handle=0
[2026-03-04 01:25:29.432] CreateOverlay result: error=0, handle=244813135910
[2026-03-04 01:25:29.432] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:25:29.432] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:25:29.432] createOverlayTexture: QImage created and filled
[2026-03-04 01:25:29.432] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:25:29.440] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:25:29.440] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:25:29.440] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:25:29.440] ShowOverlay result: error=0
[2026-03-04 01:25:29.441] Adjustment mode started successfully
[2026-03-04 01:25:29.441] Input focus capture: SUCCESS
[2026-03-04 01:25:29.443] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:30.051] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=5520 ms, source=system button deactivate seq=52
[2026-03-04 01:25:30.055] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:25:30.782] setTranslationOffsets: role=Right, x=-3.79, y=-0.66, z=-0.13
[2026-03-04 01:25:30.782] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.782] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.782] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.007m, z=-0.001m)
[2026-03-04 01:25:30.784] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.816] setTranslationOffsets: role=Right, x=-3.79, y=-0.62, z=-0.13
[2026-03-04 01:25:30.816] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.816] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.816] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.006m, z=-0.001m)
[2026-03-04 01:25:30.821] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.850] setTranslationOffsets: role=Right, x=-3.79, y=-0.58, z=-0.13
[2026-03-04 01:25:30.850] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.850] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.850] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.006m, z=-0.001m)
[2026-03-04 01:25:30.856] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.881] setTranslationOffsets: role=Right, x=-3.79, y=-0.54, z=-0.13
[2026-03-04 01:25:30.881] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.881] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.881] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.005m, z=-0.001m)
[2026-03-04 01:25:30.885] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.915] setTranslationOffsets: role=Right, x=-3.79, y=-0.50, z=-0.13
[2026-03-04 01:25:30.915] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.915] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.915] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.005m, z=-0.001m)
[2026-03-04 01:25:30.917] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.947] setTranslationOffsets: role=Right, x=-3.79, y=-0.46, z=-0.13
[2026-03-04 01:25:30.947] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.947] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.947] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.005m, z=-0.001m)
[2026-03-04 01:25:30.951] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:30.981] setTranslationOffsets: role=Right, x=-3.79, y=-0.42, z=-0.13
[2026-03-04 01:25:30.981] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:30.981] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:30.981] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.004m, z=-0.001m)
[2026-03-04 01:25:30.983] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.014] setTranslationOffsets: role=Right, x=-3.79, y=-0.38, z=-0.13
[2026-03-04 01:25:31.014] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.014] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.014] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.004m, z=-0.001m)
[2026-03-04 01:25:31.016] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.046] setTranslationOffsets: role=Right, x=-3.79, y=-0.34, z=-0.13
[2026-03-04 01:25:31.046] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.046] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.046] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.003m, z=-0.001m)
[2026-03-04 01:25:31.048] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.079] setTranslationOffsets: role=Right, x=-3.79, y=-0.30, z=-0.13
[2026-03-04 01:25:31.079] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.079] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.079] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.003m, z=-0.001m)
[2026-03-04 01:25:31.082] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.112] setTranslationOffsets: role=Right, x=-3.79, y=-0.26, z=-0.13
[2026-03-04 01:25:31.112] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.112] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.112] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.003m, z=-0.001m)
[2026-03-04 01:25:31.117] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.146] setTranslationOffsets: role=Right, x=-3.79, y=-0.23, z=-0.13
[2026-03-04 01:25:31.146] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.146] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.146] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.002m, z=-0.001m)
[2026-03-04 01:25:31.152] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.178] setTranslationOffsets: role=Right, x=-3.79, y=-0.19, z=-0.13
[2026-03-04 01:25:31.178] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.178] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.178] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.002m, z=-0.001m)
[2026-03-04 01:25:31.184] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:31.212] setTranslationOffsets: role=Right, x=-3.79, y=-0.15, z=-0.13
[2026-03-04 01:25:31.212] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:31.212] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:31.212] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.001m, z=-0.001m)
[2026-03-04 01:25:31.217] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.235] setTranslationOffsets: role=Right, x=-3.79, y=-0.13, z=-0.13
[2026-03-04 01:25:32.235] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.235] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.235] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.001m, z=-0.001m)
[2026-03-04 01:25:32.239] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.266] setTranslationOffsets: role=Right, x=-3.79, y=-0.09, z=-0.13
[2026-03-04 01:25:32.266] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.266] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.266] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.001m, z=-0.001m)
[2026-03-04 01:25:32.268] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.301] setTranslationOffsets: role=Right, x=-3.79, y=-0.05, z=-0.13
[2026-03-04 01:25:32.301] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.301] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.301] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.001m, z=-0.001m)
[2026-03-04 01:25:32.304] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.333] setTranslationOffsets: role=Right, x=-3.79, y=-0.02, z=-0.13
[2026-03-04 01:25:32.333] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.333] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.333] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=-0.000m, z=-0.001m)
[2026-03-04 01:25:32.336] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.366] setTranslationOffsets: role=Right, x=-3.79, y=0.02, z=-0.13
[2026-03-04 01:25:32.366] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.366] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.366] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.000m, z=-0.001m)
[2026-03-04 01:25:32.375] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.399] setTranslationOffsets: role=Right, x=-3.79, y=0.06, z=-0.13
[2026-03-04 01:25:32.399] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.399] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.399] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:25:32.404] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.432] setTranslationOffsets: role=Right, x=-3.79, y=0.10, z=-0.13
[2026-03-04 01:25:32.432] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.432] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.432] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:25:32.437] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.465] setTranslationOffsets: role=Right, x=-3.79, y=0.14, z=-0.13
[2026-03-04 01:25:32.465] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.465] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.465] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:25:32.470] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.498] setTranslationOffsets: role=Right, x=-3.79, y=0.18, z=-0.13
[2026-03-04 01:25:32.498] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.498] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.498] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.002m, z=-0.001m)
[2026-03-04 01:25:32.501] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.534] setTranslationOffsets: role=Right, x=-3.79, y=0.22, z=-0.13
[2026-03-04 01:25:32.534] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.534] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.534] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.002m, z=-0.001m)
[2026-03-04 01:25:32.541] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.564] setTranslationOffsets: role=Right, x=-3.79, y=0.26, z=-0.13
[2026-03-04 01:25:32.564] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.564] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.564] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:32.572] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:32.599] setTranslationOffsets: role=Right, x=-3.79, y=0.30, z=-0.13
[2026-03-04 01:25:32.599] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:32.599] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:32.599] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:32.602] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:33.488] setTranslationOffsets: role=Right, x=-3.79, y=0.33, z=-0.13
[2026-03-04 01:25:33.488] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:33.488] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:33.488] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:33.491] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:33.521] setTranslationOffsets: role=Right, x=-3.79, y=0.37, z=-0.13
[2026-03-04 01:25:33.521] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:33.521] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:33.521] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:33.524] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:33.555] setTranslationOffsets: role=Right, x=-3.79, y=0.40, z=-0.13
[2026-03-04 01:25:33.555] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:33.555] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:33.555] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:33.560] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:33.588] setTranslationOffsets: role=Right, x=-3.79, y=0.44, z=-0.13
[2026-03-04 01:25:33.588] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:33.588] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:33.588] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:33.590] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:33.620] setTranslationOffsets: role=Right, x=-3.79, y=0.48, z=-0.13
[2026-03-04 01:25:33.620] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:33.620] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:33.620] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:25:33.622] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.116] setTranslationOffsets: role=Right, x=-3.79, y=0.47, z=-0.13
[2026-03-04 01:25:34.116] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.116] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.116] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:25:34.118] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.149] setTranslationOffsets: role=Right, x=-3.79, y=0.44, z=-0.13
[2026-03-04 01:25:34.149] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.149] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.149] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:34.151] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.182] setTranslationOffsets: role=Right, x=-3.79, y=0.40, z=-0.13
[2026-03-04 01:25:34.182] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.182] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.182] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:34.191] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.214] setTranslationOffsets: role=Right, x=-3.79, y=0.36, z=-0.13
[2026-03-04 01:25:34.214] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.214] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.214] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:25:34.218] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.248] setTranslationOffsets: role=Right, x=-3.79, y=0.33, z=-0.13
[2026-03-04 01:25:34.248] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.248] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.248] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:34.252] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.281] setTranslationOffsets: role=Right, x=-3.79, y=0.29, z=-0.13
[2026-03-04 01:25:34.281] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.281] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.281] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:34.285] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:34.312] setTranslationOffsets: role=Right, x=-3.79, y=0.26, z=-0.13
[2026-03-04 01:25:34.312] -> OpenVR deviceId for Right = 5
[2026-03-04 01:25:34.312] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:25:34.312] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:25:34.318] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:25:35.271] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=5219 ms, source=system button activate seq=53
[2026-03-04 01:25:35.271] Dashboard opened - forcing device refresh
[2026-03-04 01:25:35.271] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:25:35.271] stopAdjustmentMode: active=1, handle=244813135910
[2026-03-04 01:25:35.272] Released input focus
[2026-03-04 01:25:35.277] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:35.277] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:25:35.277] Hiding and destroying overlay
[2026-03-04 01:25:35.283] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:35.286] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:35.711] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=440 ms, source=system button deactivate seq=54
[2026-03-04 01:25:35.711] IGNORED - Too soon after last change (debouncing spurious event)
[2026-03-04 01:25:36.131] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=859 ms, source=system button activate seq=55
[2026-03-04 01:25:36.131] Dashboard opened - forcing device refresh
[2026-03-04 01:25:36.137] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:25:37.076] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:25:38.132] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2000 ms, source=system button deactivate seq=56
[2026-03-04 01:25:38.135] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:26:16.992] cycleAdjustmentMode: ENTRY - current mode=translation
[2026-03-04 01:26:16.992] cycleAdjustmentMode: About to change mode from translation
[2026-03-04 01:26:16.992] cycleAdjustmentMode: State changed to ROTATION mode
[2026-03-04 01:26:16.992] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=rotation
[2026-03-04 01:26:16.992] updateFloatingOverlay: No overlay active (handle invalid)
[2026-03-04 01:26:16.992] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:26:16.992] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=rotation
[2026-03-04 01:26:16.992] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:28:42.291] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=184159 ms, source=system button activate seq=57
[2026-03-04 01:28:42.291] Dashboard opened - forcing device refresh
[2026-03-04 01:28:42.297] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:28:44.991] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2699 ms, source=system button deactivate seq=58
[2026-03-04 01:28:44.996] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:28:58.752] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=13760 ms, source=system button activate seq=59
[2026-03-04 01:28:58.752] Dashboard opened - forcing device refresh
[2026-03-04 01:28:58.756] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:28:59.372] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=620 ms, source=system button deactivate seq=60
[2026-03-04 01:28:59.376] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:05.272] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=5899 ms, source=system button activate seq=61
[2026-03-04 01:29:05.272] Dashboard opened - forcing device refresh
[2026-03-04 01:29:05.277] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:05.892] startAdjustmentMode: role=Right, mode=rotation, currentlyActive=0
[2026-03-04 01:29:05.892] FindOverlay result: error=10, handle=0
[2026-03-04 01:29:05.892] CreateOverlay result: error=0, handle=249108103206
[2026-03-04 01:29:05.892] createOverlayTexture: ENTRY - mode=rotation, controller=Right, width=600, height=280
[2026-03-04 01:29:05.892] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:29:05.892] createOverlayTexture: QImage created and filled
[2026-03-04 01:29:05.892] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:29:05.903] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:29:05.903] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:29:05.903] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:29:05.903] ShowOverlay result: error=0
[2026-03-04 01:29:05.904] Adjustment mode started successfully
[2026-03-04 01:29:05.904] Input focus capture: SUCCESS
[2026-03-04 01:29:05.907] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:06.532] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=1260 ms, source=system button deactivate seq=62
[2026-03-04 01:29:06.537] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:29:07.192] cycleAdjustmentMode: ENTRY - current mode=rotation
[2026-03-04 01:29:07.192] cycleAdjustmentMode: About to change mode from rotation
[2026-03-04 01:29:07.192] cycleAdjustmentMode: State changed to POSITION mode
[2026-03-04 01:29:07.192] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=translation
[2026-03-04 01:29:07.192] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:29:07.192] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:29:07.192] createOverlayTexture: QImage created and filled
[2026-03-04 01:29:07.192] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:29:07.193] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:29:07.193] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:29:07.193] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:29:07.193] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:29:07.193] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:29:07.193] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=translation
[2026-03-04 01:29:07.193] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:29:08.619] setTranslationOffsets: role=Right, x=-3.79, y=0.29, z=-0.13
[2026-03-04 01:29:08.619] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.620] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.620] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:29:08.623] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.654] setTranslationOffsets: role=Right, x=-3.79, y=0.33, z=-0.13
[2026-03-04 01:29:08.654] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.654] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.654] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:29:08.657] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.686] setTranslationOffsets: role=Right, x=-3.79, y=0.37, z=-0.13
[2026-03-04 01:29:08.686] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.686] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.686] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:29:08.692] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.716] setTranslationOffsets: role=Right, x=-3.79, y=0.41, z=-0.13
[2026-03-04 01:29:08.716] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.716] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.716] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:29:08.722] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.750] setTranslationOffsets: role=Right, x=-3.79, y=0.45, z=-0.13
[2026-03-04 01:29:08.750] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.750] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.750] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:29:08.754] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.783] setTranslationOffsets: role=Right, x=-3.79, y=0.49, z=-0.13
[2026-03-04 01:29:08.783] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.783] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.783] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:29:08.786] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.814] setTranslationOffsets: role=Right, x=-3.79, y=0.53, z=-0.13
[2026-03-04 01:29:08.814] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.814] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.814] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:29:08.816] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.849] setTranslationOffsets: role=Right, x=-3.79, y=0.57, z=-0.13
[2026-03-04 01:29:08.849] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.850] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.850] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:29:08.852] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.879] setTranslationOffsets: role=Right, x=-3.79, y=0.61, z=-0.13
[2026-03-04 01:29:08.879] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.879] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.879] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:29:08.883] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.912] setTranslationOffsets: role=Right, x=-3.79, y=0.65, z=-0.13
[2026-03-04 01:29:08.912] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.912] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.912] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:29:08.915] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.945] setTranslationOffsets: role=Right, x=-3.79, y=0.69, z=-0.13
[2026-03-04 01:29:08.945] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.945] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.945] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.007m, z=-0.001m)
[2026-03-04 01:29:08.952] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:08.978] setTranslationOffsets: role=Right, x=-3.79, y=0.73, z=-0.13
[2026-03-04 01:29:08.978] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:08.978] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:08.978] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.007m, z=-0.001m)
[2026-03-04 01:29:08.983] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.012] setTranslationOffsets: role=Right, x=-3.79, y=0.77, z=-0.13
[2026-03-04 01:29:09.012] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.012] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.012] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:29:09.016] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.044] setTranslationOffsets: role=Right, x=-3.79, y=0.81, z=-0.13
[2026-03-04 01:29:09.044] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.044] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.044] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:29:09.046] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.077] setTranslationOffsets: role=Right, x=-3.79, y=0.84, z=-0.13
[2026-03-04 01:29:09.077] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.077] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.077] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:29:09.079] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.112] setTranslationOffsets: role=Right, x=-3.79, y=0.88, z=-0.13
[2026-03-04 01:29:09.112] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.112] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.112] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.009m, z=-0.001m)
[2026-03-04 01:29:09.114] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.143] setTranslationOffsets: role=Right, x=-3.79, y=0.92, z=-0.13
[2026-03-04 01:29:09.143] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.143] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.143] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.009m, z=-0.001m)
[2026-03-04 01:29:09.146] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:09.177] setTranslationOffsets: role=Right, x=-3.79, y=0.94, z=-0.13
[2026-03-04 01:29:09.177] -> OpenVR deviceId for Right = 5
[2026-03-04 01:29:09.177] -> Preserving existing rotation: pitch=0.673, yaw=0.672, roll=18.152
[2026-03-04 01:29:09.177] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.009m, z=-0.001m)
[2026-03-04 01:29:09.182] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:29:11.251] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=4719 ms, source=system button activate seq=63
[2026-03-04 01:29:11.251] Dashboard opened - forcing device refresh
[2026-03-04 01:29:11.252] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:29:11.252] stopAdjustmentMode: active=1, handle=249108103206
[2026-03-04 01:29:11.253] Released input focus
[2026-03-04 01:29:11.256] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:11.256] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:29:11.256] Hiding and destroying overlay
[2026-03-04 01:29:11.259] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:11.262] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:29:11.871] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=620 ms, source=system button deactivate seq=64
[2026-03-04 01:29:11.876] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:05.032] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=53160 ms, source=system button activate seq=65
[2026-03-04 01:30:05.032] Dashboard opened - forcing device refresh
[2026-03-04 01:30:05.036] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:08.135] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:30:08.136] FindOverlay result: error=10, handle=0
[2026-03-04 01:30:08.136] CreateOverlay result: error=0, handle=253403070502
[2026-03-04 01:30:08.136] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:30:08.136] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:08.136] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:08.136] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:08.143] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:08.143] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:08.143] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:08.143] ShowOverlay result: error=0
[2026-03-04 01:30:08.144] Adjustment mode started successfully
[2026-03-04 01:30:08.144] Input focus capture: SUCCESS
[2026-03-04 01:30:08.150] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:08.771] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=3739 ms, source=system button deactivate seq=66
[2026-03-04 01:30:08.775] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:30:10.091] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:30:10.091] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:10.091] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:10.091] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:10.092] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:10.092] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:10.092] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:10.092] updateFloatingOverlay: Updated overlay with mode=translation, controller=Left
[2026-03-04 01:30:11.184] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.00
[2026-03-04 01:30:11.184] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.184] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.184] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.188] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.216] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.04
[2026-03-04 01:30:11.216] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.216] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.216] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.218] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.249] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.08
[2026-03-04 01:30:11.249] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.249] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.249] -> Applying via SharedMemoryIPC: pos(x=0.011m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.251] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.283] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.12
[2026-03-04 01:30:11.283] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.283] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.283] -> Applying via SharedMemoryIPC: pos(x=0.011m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.285] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.314] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.16
[2026-03-04 01:30:11.314] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.314] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.314] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.319] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.349] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.19
[2026-03-04 01:30:11.350] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.350] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.350] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.355] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.380] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.23
[2026-03-04 01:30:11.380] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.380] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.380] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.384] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.414] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.27
[2026-03-04 01:30:11.414] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.414] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.414] -> Applying via SharedMemoryIPC: pos(x=0.013m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.416] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.447] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.31
[2026-03-04 01:30:11.447] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.447] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.447] -> Applying via SharedMemoryIPC: pos(x=0.013m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.452] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.482] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.35
[2026-03-04 01:30:11.482] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.482] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.482] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.487] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.513] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.39
[2026-03-04 01:30:11.513] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.513] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.513] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.520] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.545] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.43
[2026-03-04 01:30:11.545] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.545] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.545] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.551] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.578] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.47
[2026-03-04 01:30:11.578] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.578] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.578] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.582] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.624] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.51
[2026-03-04 01:30:11.624] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.624] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.624] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.626] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.651] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.55
[2026-03-04 01:30:11.651] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.651] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.651] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.654] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.681] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.59
[2026-03-04 01:30:11.681] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.681] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.681] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.683] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.711] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.62
[2026-03-04 01:30:11.711] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.711] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.711] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.716] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.744] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.66
[2026-03-04 01:30:11.744] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.745] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.745] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.748] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.776] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.70
[2026-03-04 01:30:11.777] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.777] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.777] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.782] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.809] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.74
[2026-03-04 01:30:11.809] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.809] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.809] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.817] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.843] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.78
[2026-03-04 01:30:11.843] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.843] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.843] -> Applying via SharedMemoryIPC: pos(x=0.018m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.848] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.876] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.82
[2026-03-04 01:30:11.876] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.876] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.876] -> Applying via SharedMemoryIPC: pos(x=0.018m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.879] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.909] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.86
[2026-03-04 01:30:11.909] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.909] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.909] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.915] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.941] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.90
[2026-03-04 01:30:11.941] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.941] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.941] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.945] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:11.976] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.94
[2026-03-04 01:30:11.976] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:11.976] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:11.976] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.008m, z=0.036m)
[2026-03-04 01:30:11.979] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.007] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-1.98
[2026-03-04 01:30:12.007] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.007] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.007] -> Applying via SharedMemoryIPC: pos(x=0.020m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.011] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.042] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.02
[2026-03-04 01:30:12.042] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.042] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.042] -> Applying via SharedMemoryIPC: pos(x=0.020m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.044] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.672] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.05
[2026-03-04 01:30:12.672] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.672] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.672] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.679] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.703] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.09
[2026-03-04 01:30:12.703] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.703] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.703] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.705] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.735] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.13
[2026-03-04 01:30:12.735] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.735] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.735] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.741] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.769] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.17
[2026-03-04 01:30:12.769] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.769] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.769] -> Applying via SharedMemoryIPC: pos(x=0.022m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.773] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.799] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.21
[2026-03-04 01:30:12.799] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.799] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.799] -> Applying via SharedMemoryIPC: pos(x=0.022m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.801] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.833] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.25
[2026-03-04 01:30:12.833] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.833] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.833] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.835] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.866] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.29
[2026-03-04 01:30:12.866] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.866] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.866] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.870] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.899] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.33
[2026-03-04 01:30:12.899] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.899] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.899] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.901] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.932] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.37
[2026-03-04 01:30:12.932] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.932] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.932] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.938] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.965] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.41
[2026-03-04 01:30:12.965] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.965] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.965] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.008m, z=0.036m)
[2026-03-04 01:30:12.969] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:12.998] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.45
[2026-03-04 01:30:12.998] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:12.998] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:12.998] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.008m, z=0.036m)
[2026-03-04 01:30:13.001] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:13.032] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.49
[2026-03-04 01:30:13.032] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:13.032] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:13.032] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.008m, z=0.036m)
[2026-03-04 01:30:13.035] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:13.064] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.53
[2026-03-04 01:30:13.064] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:13.064] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:13.064] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.008m, z=0.036m)
[2026-03-04 01:30:13.066] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:13.097] setTranslationOffsets: role=Left, x=-3.62, y=0.81, z=-2.55
[2026-03-04 01:30:13.097] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:13.097] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:13.097] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.008m, z=0.036m)
[2026-03-04 01:30:13.101] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:16.291] cycleAdjustmentMode: ENTRY - current mode=translation
[2026-03-04 01:30:16.291] cycleAdjustmentMode: About to change mode from translation
[2026-03-04 01:30:16.291] cycleAdjustmentMode: State changed to ROTATION mode
[2026-03-04 01:30:16.291] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=rotation
[2026-03-04 01:30:16.291] createOverlayTexture: ENTRY - mode=rotation, controller=Left, width=600, height=280
[2026-03-04 01:30:16.291] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:16.291] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:16.291] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:16.294] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:16.294] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:16.294] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:16.294] updateFloatingOverlay: Updated overlay with mode=rotation, controller=Left
[2026-03-04 01:30:16.294] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:30:16.294] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=rotation
[2026-03-04 01:30:16.295] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:30:16.692] createOverlayTexture: ENTRY - mode=rotation, controller=Right, width=600, height=280
[2026-03-04 01:30:16.692] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:16.692] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:16.692] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:16.693] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:16.693] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:16.693] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:16.693] updateFloatingOverlay: Updated overlay with mode=rotation, controller=Right
[2026-03-04 01:30:17.552] setRotationOffsets: role=Right, pitch=0.79, yaw=0.67, roll=18.15
[2026-03-04 01:30:17.552] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.552] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.552] -> Applying via SharedMemoryIPC: rot(pitch=0.786,yaw=0.672,roll=18.152)
[2026-03-04 01:30:17.556] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.587] setRotationOffsets: role=Right, pitch=1.04, yaw=0.37, roll=18.15
[2026-03-04 01:30:17.587] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.587] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.587] -> Applying via SharedMemoryIPC: rot(pitch=1.043,yaw=0.371,roll=18.152)
[2026-03-04 01:30:17.589] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.624] setRotationOffsets: role=Right, pitch=1.30, yaw=0.07, roll=18.15
[2026-03-04 01:30:17.624] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.624] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.624] -> Applying via SharedMemoryIPC: rot(pitch=1.299,yaw=0.069,roll=18.152)
[2026-03-04 01:30:17.627] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.656] setRotationOffsets: role=Right, pitch=1.55, yaw=-0.23, roll=18.15
[2026-03-04 01:30:17.656] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.656] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.656] -> Applying via SharedMemoryIPC: rot(pitch=1.555,yaw=-0.234,roll=18.152)
[2026-03-04 01:30:17.660] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.688] setRotationOffsets: role=Right, pitch=1.81, yaw=-0.54, roll=18.15
[2026-03-04 01:30:17.688] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.688] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.688] -> Applying via SharedMemoryIPC: rot(pitch=1.811,yaw=-0.536,roll=18.152)
[2026-03-04 01:30:17.689] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.717] setRotationOffsets: role=Right, pitch=2.07, yaw=-0.84, roll=18.15
[2026-03-04 01:30:17.717] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.717] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.717] -> Applying via SharedMemoryIPC: rot(pitch=2.069,yaw=-0.836,roll=18.152)
[2026-03-04 01:30:17.719] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.750] setRotationOffsets: role=Right, pitch=2.33, yaw=-1.13, roll=18.15
[2026-03-04 01:30:17.750] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.750] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.750] -> Applying via SharedMemoryIPC: rot(pitch=2.334,yaw=-1.130,roll=18.152)
[2026-03-04 01:30:17.753] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.785] setRotationOffsets: role=Right, pitch=2.61, yaw=-1.41, roll=18.15
[2026-03-04 01:30:17.785] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.785] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.785] -> Applying via SharedMemoryIPC: rot(pitch=2.611,yaw=-1.413,roll=18.152)
[2026-03-04 01:30:17.787] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:17.816] setRotationOffsets: role=Right, pitch=2.77, yaw=-1.52, roll=18.15
[2026-03-04 01:30:17.816] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:17.816] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:17.816] -> Applying via SharedMemoryIPC: rot(pitch=2.775,yaw=-1.523,roll=18.152)
[2026-03-04 01:30:17.818] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:18.083] setRotationOffsets: role=Right, pitch=2.66, yaw=-1.52, roll=18.15
[2026-03-04 01:30:18.083] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:18.083] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:18.083] -> Applying via SharedMemoryIPC: rot(pitch=2.657,yaw=-1.523,roll=18.152)
[2026-03-04 01:30:18.087] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:18.114] setRotationOffsets: role=Right, pitch=2.38, yaw=-1.52, roll=18.15
[2026-03-04 01:30:18.114] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:18.114] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:18.114] -> Applying via SharedMemoryIPC: rot(pitch=2.379,yaw=-1.523,roll=18.152)
[2026-03-04 01:30:18.117] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:18.146] setRotationOffsets: role=Right, pitch=2.05, yaw=-1.52, roll=18.15
[2026-03-04 01:30:18.146] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:18.146] -> Preserving existing translation: x=-0.038, y=0.009, z=-0.001
[2026-03-04 01:30:18.146] -> Applying via SharedMemoryIPC: rot(pitch=2.046,yaw=-1.523,roll=18.152)
[2026-03-04 01:30:18.150] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.171] cycleAdjustmentMode: ENTRY - current mode=rotation
[2026-03-04 01:30:19.171] cycleAdjustmentMode: About to change mode from rotation
[2026-03-04 01:30:19.171] cycleAdjustmentMode: State changed to POSITION mode
[2026-03-04 01:30:19.171] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=translation
[2026-03-04 01:30:19.171] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:30:19.171] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:19.171] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:19.171] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:19.172] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:19.172] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:19.172] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:19.173] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:30:19.173] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:30:19.173] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=translation
[2026-03-04 01:30:19.174] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:30:19.566] setTranslationOffsets: role=Right, x=-3.78, y=0.92, z=-0.13
[2026-03-04 01:30:19.566] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.566] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.566] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.009m, z=-0.001m)
[2026-03-04 01:30:19.570] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.600] setTranslationOffsets: role=Right, x=-3.77, y=0.89, z=-0.13
[2026-03-04 01:30:19.600] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.600] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.600] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.009m, z=-0.001m)
[2026-03-04 01:30:19.605] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.638] setTranslationOffsets: role=Right, x=-3.77, y=0.85, z=-0.13
[2026-03-04 01:30:19.638] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.638] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.638] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:30:19.642] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.668] setTranslationOffsets: role=Right, x=-3.77, y=0.81, z=-0.13
[2026-03-04 01:30:19.668] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.668] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.669] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:30:19.672] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.700] setTranslationOffsets: role=Right, x=-3.77, y=0.78, z=-0.13
[2026-03-04 01:30:19.701] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.701] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.701] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.008m, z=-0.001m)
[2026-03-04 01:30:19.704] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.729] setTranslationOffsets: role=Right, x=-3.77, y=0.74, z=-0.13
[2026-03-04 01:30:19.729] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.729] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.729] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.007m, z=-0.001m)
[2026-03-04 01:30:19.733] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.763] setTranslationOffsets: role=Right, x=-3.77, y=0.71, z=-0.13
[2026-03-04 01:30:19.764] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.764] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.764] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.007m, z=-0.001m)
[2026-03-04 01:30:19.769] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.795] setTranslationOffsets: role=Right, x=-3.77, y=0.67, z=-0.13
[2026-03-04 01:30:19.795] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.795] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.795] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.007m, z=-0.001m)
[2026-03-04 01:30:19.797] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.829] setTranslationOffsets: role=Right, x=-3.77, y=0.63, z=-0.13
[2026-03-04 01:30:19.829] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.829] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.829] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:30:19.833] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.862] setTranslationOffsets: role=Right, x=-3.77, y=0.60, z=-0.13
[2026-03-04 01:30:19.862] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.862] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.862] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:30:19.866] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.896] setTranslationOffsets: role=Right, x=-3.77, y=0.56, z=-0.13
[2026-03-04 01:30:19.896] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.896] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.896] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.006m, z=-0.001m)
[2026-03-04 01:30:19.900] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.929] setTranslationOffsets: role=Right, x=-3.77, y=0.52, z=-0.13
[2026-03-04 01:30:19.929] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.929] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.929] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:30:19.933] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:19.961] setTranslationOffsets: role=Right, x=-3.77, y=0.49, z=-0.13
[2026-03-04 01:30:19.961] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:19.961] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:19.961] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:30:19.965] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:23.831] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=15060 ms, source=system button activate seq=67
[2026-03-04 01:30:23.831] Dashboard opened - forcing device refresh
[2026-03-04 01:30:23.832] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:30:23.832] stopAdjustmentMode: active=1, handle=253403070502
[2026-03-04 01:30:23.833] Released input focus
[2026-03-04 01:30:23.835] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:23.835] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:30:23.835] Hiding and destroying overlay
[2026-03-04 01:30:23.842] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:23.845] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:24.152] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=320 ms, source=system button deactivate seq=68
[2026-03-04 01:30:24.152] IGNORED - Too soon after last change (debouncing spurious event)
[2026-03-04 01:30:37.911] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=14080 ms, source=system button activate seq=69
[2026-03-04 01:30:37.911] Dashboard opened - forcing device refresh
[2026-03-04 01:30:37.915] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:38.973] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:30:38.974] FindOverlay result: error=10, handle=0
[2026-03-04 01:30:38.974] CreateOverlay result: error=0, handle=257698037798
[2026-03-04 01:30:38.974] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:30:38.974] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:38.974] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:38.974] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:38.975] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:38.975] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:38.975] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:38.975] ShowOverlay result: error=0
[2026-03-04 01:30:38.977] Adjustment mode started successfully
[2026-03-04 01:30:38.977] Input focus capture: SUCCESS
[2026-03-04 01:30:38.979] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:30:39.511] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=1599 ms, source=system button deactivate seq=70
[2026-03-04 01:30:39.513] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:30:40.587] setTranslationOffsets: role=Right, x=-3.77, y=0.48, z=-0.13
[2026-03-04 01:30:40.587] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.587] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.587] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.005m, z=-0.001m)
[2026-03-04 01:30:40.594] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.624] setTranslationOffsets: role=Right, x=-3.77, y=0.44, z=-0.13
[2026-03-04 01:30:40.625] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.625] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.625] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:30:40.632] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.654] setTranslationOffsets: role=Right, x=-3.77, y=0.41, z=-0.13
[2026-03-04 01:30:40.654] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.654] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.654] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:30:40.663] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.684] setTranslationOffsets: role=Right, x=-3.77, y=0.37, z=-0.13
[2026-03-04 01:30:40.684] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.684] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.684] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.004m, z=-0.001m)
[2026-03-04 01:30:40.687] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.717] setTranslationOffsets: role=Right, x=-3.77, y=0.33, z=-0.13
[2026-03-04 01:30:40.717] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.717] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.717] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:30:40.720] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.752] setTranslationOffsets: role=Right, x=-3.77, y=0.30, z=-0.13
[2026-03-04 01:30:40.752] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.752] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.752] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:30:40.757] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:40.983] setTranslationOffsets: role=Right, x=-3.77, y=0.27, z=-0.13
[2026-03-04 01:30:40.983] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:40.983] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:40.983] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.003m, z=-0.001m)
[2026-03-04 01:30:40.988] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:41.015] setTranslationOffsets: role=Right, x=-3.77, y=0.23, z=-0.13
[2026-03-04 01:30:41.015] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:41.016] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:41.016] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.002m, z=-0.001m)
[2026-03-04 01:30:41.017] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:41.048] setTranslationOffsets: role=Right, x=-3.77, y=0.19, z=-0.13
[2026-03-04 01:30:41.048] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:41.048] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:41.048] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.002m, z=-0.001m)
[2026-03-04 01:30:41.050] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:41.083] setTranslationOffsets: role=Right, x=-3.77, y=0.15, z=-0.13
[2026-03-04 01:30:41.083] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:41.083] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:41.083] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.002m, z=-0.001m)
[2026-03-04 01:30:41.085] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:41.115] setTranslationOffsets: role=Right, x=-3.77, y=0.14, z=-0.13
[2026-03-04 01:30:41.115] -> OpenVR deviceId for Right = 5
[2026-03-04 01:30:41.115] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:30:41.115] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:30:41.122] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:30:43.112] cycleAdjustmentMode: ENTRY - current mode=translation
[2026-03-04 01:30:43.112] cycleAdjustmentMode: About to change mode from translation
[2026-03-04 01:30:43.112] cycleAdjustmentMode: State changed to ROTATION mode
[2026-03-04 01:30:43.112] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=rotation
[2026-03-04 01:30:43.112] createOverlayTexture: ENTRY - mode=rotation, controller=Right, width=600, height=280
[2026-03-04 01:30:43.112] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:43.112] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:43.112] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:43.113] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:43.113] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:43.113] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:43.113] updateFloatingOverlay: Updated overlay with mode=rotation, controller=Right
[2026-03-04 01:30:43.113] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:30:43.113] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=rotation
[2026-03-04 01:30:43.113] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:30:43.532] cycleAdjustmentMode: ENTRY - current mode=rotation
[2026-03-04 01:30:43.532] cycleAdjustmentMode: About to change mode from rotation
[2026-03-04 01:30:43.532] cycleAdjustmentMode: State changed to POSITION mode
[2026-03-04 01:30:43.532] cycleAdjustmentMode: About to call updateFloatingOverlay() for mode=translation
[2026-03-04 01:30:43.532] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:30:43.532] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:43.532] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:43.532] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:43.532] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:43.532] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:43.532] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:43.532] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:30:43.533] cycleAdjustmentMode: updateFloatingOverlay() completed successfully
[2026-03-04 01:30:43.533] cycleAdjustmentMode: About to emit adjustmentModeChanged signal with mode=translation
[2026-03-04 01:30:43.533] cycleAdjustmentMode: Signal emitted successfully. EXIT
[2026-03-04 01:30:43.793] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:30:43.793] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:30:43.793] createOverlayTexture: QImage created and filled
[2026-03-04 01:30:43.793] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:30:43.794] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:30:43.794] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:30:43.794] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:30:43.795] updateFloatingOverlay: Updated overlay with mode=translation, controller=Left
[2026-03-04 01:30:44.215] setTranslationOffsets: role=Left, x=-3.62, y=0.84, z=-2.55
[2026-03-04 01:30:44.215] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.216] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.216] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.008m, z=0.036m)
[2026-03-04 01:30:44.220] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.249] setTranslationOffsets: role=Left, x=-3.62, y=0.88, z=-2.55
[2026-03-04 01:30:44.249] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.249] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.249] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.009m, z=0.036m)
[2026-03-04 01:30:44.255] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.282] setTranslationOffsets: role=Left, x=-3.62, y=0.92, z=-2.55
[2026-03-04 01:30:44.282] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.282] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.282] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.009m, z=0.036m)
[2026-03-04 01:30:44.287] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.317] setTranslationOffsets: role=Left, x=-3.62, y=0.96, z=-2.55
[2026-03-04 01:30:44.317] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.317] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.317] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.010m, z=0.036m)
[2026-03-04 01:30:44.325] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.350] setTranslationOffsets: role=Left, x=-3.62, y=0.99, z=-2.55
[2026-03-04 01:30:44.350] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.350] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.350] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.010m, z=0.036m)
[2026-03-04 01:30:44.351] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.580] setTranslationOffsets: role=Left, x=-3.60, y=1.03, z=-2.55
[2026-03-04 01:30:44.580] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.580] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.580] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.010m, z=0.036m)
[2026-03-04 01:30:44.586] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.616] setTranslationOffsets: role=Left, x=-3.59, y=1.06, z=-2.55
[2026-03-04 01:30:44.616] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.616] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.616] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.011m, z=0.036m)
[2026-03-04 01:30:44.621] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.647] setTranslationOffsets: role=Left, x=-3.58, y=1.10, z=-2.55
[2026-03-04 01:30:44.647] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.647] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.647] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.011m, z=0.036m)
[2026-03-04 01:30:44.649] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.684] setTranslationOffsets: role=Left, x=-3.57, y=1.14, z=-2.55
[2026-03-04 01:30:44.684] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.684] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.684] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.011m, z=0.036m)
[2026-03-04 01:30:44.685] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.712] setTranslationOffsets: role=Left, x=-3.57, y=1.18, z=-2.55
[2026-03-04 01:30:44.712] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.712] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.712] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.012m, z=0.036m)
[2026-03-04 01:30:44.715] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:44.747] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.55
[2026-03-04 01:30:44.747] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:44.747] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:44.747] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.012m, z=0.036m)
[2026-03-04 01:30:44.756] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.489] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.53
[2026-03-04 01:30:53.489] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.489] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.489] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.494] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.524] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.50
[2026-03-04 01:30:53.524] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.524] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.524] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.527] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.556] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.47
[2026-03-04 01:30:53.556] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.556] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.556] -> Applying via SharedMemoryIPC: pos(x=0.025m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.558] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.591] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.44
[2026-03-04 01:30:53.591] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.591] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.591] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.599] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.626] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.40
[2026-03-04 01:30:53.626] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.626] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.626] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.631] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.662] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.37
[2026-03-04 01:30:53.662] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.662] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.662] -> Applying via SharedMemoryIPC: pos(x=0.024m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.664] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.689] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.34
[2026-03-04 01:30:53.689] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.689] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.689] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.695] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.722] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.30
[2026-03-04 01:30:53.722] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.722] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.722] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.726] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.753] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.27
[2026-03-04 01:30:53.753] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.753] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.753] -> Applying via SharedMemoryIPC: pos(x=0.023m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.759] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.786] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.24
[2026-03-04 01:30:53.786] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.786] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.786] -> Applying via SharedMemoryIPC: pos(x=0.022m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.790] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.818] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.21
[2026-03-04 01:30:53.818] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.818] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.818] -> Applying via SharedMemoryIPC: pos(x=0.022m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.821] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.854] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.17
[2026-03-04 01:30:53.854] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.854] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.854] -> Applying via SharedMemoryIPC: pos(x=0.022m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.858] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.888] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.14
[2026-03-04 01:30:53.888] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.888] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.888] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.892] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.918] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.11
[2026-03-04 01:30:53.918] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.918] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.918] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.920] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.951] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.07
[2026-03-04 01:30:53.951] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.951] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.951] -> Applying via SharedMemoryIPC: pos(x=0.021m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.956] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:53.984] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.04
[2026-03-04 01:30:53.984] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:53.984] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:53.984] -> Applying via SharedMemoryIPC: pos(x=0.020m, y=0.012m, z=0.036m)
[2026-03-04 01:30:53.988] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.018] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-2.01
[2026-03-04 01:30:54.018] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.018] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.018] -> Applying via SharedMemoryIPC: pos(x=0.020m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.021] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.049] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.97
[2026-03-04 01:30:54.050] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.050] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.050] -> Applying via SharedMemoryIPC: pos(x=0.020m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.056] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.085] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.94
[2026-03-04 01:30:54.085] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.085] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.085] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.087] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.115] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.91
[2026-03-04 01:30:54.115] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.115] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.115] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.118] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.148] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.88
[2026-03-04 01:30:54.148] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.148] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.148] -> Applying via SharedMemoryIPC: pos(x=0.019m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.151] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.182] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.84
[2026-03-04 01:30:54.182] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.182] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.182] -> Applying via SharedMemoryIPC: pos(x=0.018m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.187] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.216] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.81
[2026-03-04 01:30:54.216] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.216] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.216] -> Applying via SharedMemoryIPC: pos(x=0.018m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.219] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.248] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.78
[2026-03-04 01:30:54.248] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.248] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.248] -> Applying via SharedMemoryIPC: pos(x=0.018m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.250] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.281] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.75
[2026-03-04 01:30:54.281] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.281] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.281] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.283] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.314] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.71
[2026-03-04 01:30:54.314] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.314] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.314] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.318] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.347] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.68
[2026-03-04 01:30:54.347] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.347] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.347] -> Applying via SharedMemoryIPC: pos(x=0.017m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.350] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.380] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.65
[2026-03-04 01:30:54.380] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.380] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.380] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.386] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.413] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.62
[2026-03-04 01:30:54.413] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.413] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.413] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.415] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.447] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.59
[2026-03-04 01:30:54.447] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.447] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.447] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.452] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.479] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.55
[2026-03-04 01:30:54.479] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.479] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.479] -> Applying via SharedMemoryIPC: pos(x=0.016m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.484] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.512] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.52
[2026-03-04 01:30:54.512] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.512] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.512] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.516] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.546] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.49
[2026-03-04 01:30:54.546] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.546] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.546] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.551] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.579] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.46
[2026-03-04 01:30:54.579] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.579] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.579] -> Applying via SharedMemoryIPC: pos(x=0.015m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.584] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.617] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.42
[2026-03-04 01:30:54.617] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.617] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.617] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.619] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.647] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.39
[2026-03-04 01:30:54.647] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.647] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.647] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.650] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.679] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.36
[2026-03-04 01:30:54.679] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.679] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.679] -> Applying via SharedMemoryIPC: pos(x=0.014m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.681] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.710] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.33
[2026-03-04 01:30:54.710] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.710] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.710] -> Applying via SharedMemoryIPC: pos(x=0.013m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.712] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.743] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.30
[2026-03-04 01:30:54.743] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.743] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.743] -> Applying via SharedMemoryIPC: pos(x=0.013m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.751] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.776] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.26
[2026-03-04 01:30:54.776] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.776] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.776] -> Applying via SharedMemoryIPC: pos(x=0.013m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.778] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.809] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.23
[2026-03-04 01:30:54.809] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.809] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.809] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.814] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.843] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.20
[2026-03-04 01:30:54.843] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.843] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.843] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.846] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.876] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.17
[2026-03-04 01:30:54.876] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.876] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.876] -> Applying via SharedMemoryIPC: pos(x=0.012m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.879] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.919] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.14
[2026-03-04 01:30:54.919] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.919] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.919] -> Applying via SharedMemoryIPC: pos(x=0.011m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.925] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.944] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.10
[2026-03-04 01:30:54.944] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.944] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.944] -> Applying via SharedMemoryIPC: pos(x=0.011m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.946] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:54.975] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.07
[2026-03-04 01:30:54.975] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:54.975] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:54.975] -> Applying via SharedMemoryIPC: pos(x=0.011m, y=0.012m, z=0.036m)
[2026-03-04 01:30:54.979] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.010] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.04
[2026-03-04 01:30:55.010] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.010] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.010] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.014] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.039] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-1.01
[2026-03-04 01:30:55.039] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.039] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.039] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.041] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.075] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.98
[2026-03-04 01:30:55.075] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.075] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.075] -> Applying via SharedMemoryIPC: pos(x=0.010m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.077] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.107] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.94
[2026-03-04 01:30:55.107] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.107] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.107] -> Applying via SharedMemoryIPC: pos(x=0.009m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.112] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.140] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.91
[2026-03-04 01:30:55.140] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.140] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.140] -> Applying via SharedMemoryIPC: pos(x=0.009m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.142] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.172] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.88
[2026-03-04 01:30:55.172] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.172] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.172] -> Applying via SharedMemoryIPC: pos(x=0.009m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.175] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.205] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.85
[2026-03-04 01:30:55.205] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.205] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.205] -> Applying via SharedMemoryIPC: pos(x=0.008m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.211] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.239] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.82
[2026-03-04 01:30:55.239] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.239] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.239] -> Applying via SharedMemoryIPC: pos(x=0.008m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.242] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.274] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.78
[2026-03-04 01:30:55.274] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.274] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.274] -> Applying via SharedMemoryIPC: pos(x=0.008m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.277] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.304] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.75
[2026-03-04 01:30:55.304] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.304] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.304] -> Applying via SharedMemoryIPC: pos(x=0.008m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.311] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.336] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.72
[2026-03-04 01:30:55.336] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.336] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.336] -> Applying via SharedMemoryIPC: pos(x=0.007m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.339] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.371] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.69
[2026-03-04 01:30:55.371] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.371] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.371] -> Applying via SharedMemoryIPC: pos(x=0.007m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.377] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.404] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.66
[2026-03-04 01:30:55.404] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.404] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.404] -> Applying via SharedMemoryIPC: pos(x=0.007m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.407] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.436] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.62
[2026-03-04 01:30:55.437] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.437] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.437] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.439] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:30:55.469] setTranslationOffsets: role=Left, x=-3.57, y=1.22, z=-0.59
[2026-03-04 01:30:55.469] -> OpenVR deviceId for Left = 6
[2026-03-04 01:30:55.469] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:30:55.469] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.012m, z=0.036m)
[2026-03-04 01:30:55.474] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.487] setTranslationOffsets: role=Left, x=-3.53, y=1.23, z=-0.59
[2026-03-04 01:31:00.487] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.487] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.487] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.012m, z=0.035m)
[2026-03-04 01:31:00.488] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.518] setTranslationOffsets: role=Left, x=-3.50, y=1.25, z=-0.59
[2026-03-04 01:31:00.518] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.518] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.518] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.013m, z=0.035m)
[2026-03-04 01:31:00.522] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.551] setTranslationOffsets: role=Left, x=-3.46, y=1.27, z=-0.59
[2026-03-04 01:31:00.551] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.551] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.551] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.013m, z=0.035m)
[2026-03-04 01:31:00.553] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.585] setTranslationOffsets: role=Left, x=-3.44, y=1.29, z=-0.59
[2026-03-04 01:31:00.585] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.585] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.585] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.013m, z=0.034m)
[2026-03-04 01:31:00.590] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.881] setTranslationOffsets: role=Left, x=-3.44, y=1.31, z=-0.59
[2026-03-04 01:31:00.881] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.881] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.881] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.013m, z=0.034m)
[2026-03-04 01:31:00.887] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.915] setTranslationOffsets: role=Left, x=-3.44, y=1.35, z=-0.59
[2026-03-04 01:31:00.915] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.915] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.915] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.014m, z=0.034m)
[2026-03-04 01:31:00.917] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.946] setTranslationOffsets: role=Left, x=-3.44, y=1.39, z=-0.59
[2026-03-04 01:31:00.946] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.946] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.946] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.014m, z=0.034m)
[2026-03-04 01:31:00.948] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:00.980] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.59
[2026-03-04 01:31:00.980] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:00.980] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:00.980] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.014m, z=0.034m)
[2026-03-04 01:31:00.985] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.456] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.58
[2026-03-04 01:31:03.456] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.456] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.456] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.460] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.489] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.55
[2026-03-04 01:31:03.489] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.489] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.489] -> Applying via SharedMemoryIPC: pos(x=0.006m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.491] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.521] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.52
[2026-03-04 01:31:03.521] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.521] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.521] -> Applying via SharedMemoryIPC: pos(x=0.005m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.523] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.554] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.49
[2026-03-04 01:31:03.554] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.555] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.555] -> Applying via SharedMemoryIPC: pos(x=0.005m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.559] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.591] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.46
[2026-03-04 01:31:03.591] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.591] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.591] -> Applying via SharedMemoryIPC: pos(x=0.005m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.597] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.628] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.42
[2026-03-04 01:31:03.628] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.628] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.628] -> Applying via SharedMemoryIPC: pos(x=0.004m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.636] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.657] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.39
[2026-03-04 01:31:03.657] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.657] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.657] -> Applying via SharedMemoryIPC: pos(x=0.004m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.659] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.689] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.36
[2026-03-04 01:31:03.689] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.689] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.689] -> Applying via SharedMemoryIPC: pos(x=0.004m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.693] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.723] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.32
[2026-03-04 01:31:03.723] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.723] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.723] -> Applying via SharedMemoryIPC: pos(x=0.003m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.725] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.753] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.29
[2026-03-04 01:31:03.753] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.753] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.753] -> Applying via SharedMemoryIPC: pos(x=0.003m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.755] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.786] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.26
[2026-03-04 01:31:03.786] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.786] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.786] -> Applying via SharedMemoryIPC: pos(x=0.003m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.788] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.818] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.22
[2026-03-04 01:31:03.818] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.818] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.818] -> Applying via SharedMemoryIPC: pos(x=0.002m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.820] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.851] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.19
[2026-03-04 01:31:03.851] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.851] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.851] -> Applying via SharedMemoryIPC: pos(x=0.002m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.856] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.884] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.16
[2026-03-04 01:31:03.884] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.884] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.884] -> Applying via SharedMemoryIPC: pos(x=0.002m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.889] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.918] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.12
[2026-03-04 01:31:03.918] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.918] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.918] -> Applying via SharedMemoryIPC: pos(x=0.001m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.922] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.950] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.10
[2026-03-04 01:31:03.950] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.950] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.950] -> Applying via SharedMemoryIPC: pos(x=0.001m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.952] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:03.983] setTranslationOffsets: role=Left, x=-3.44, y=1.41, z=-0.08
[2026-03-04 01:31:03.983] -> OpenVR deviceId for Left = 6
[2026-03-04 01:31:03.983] -> Preserving existing rotation: pitch=-0.000, yaw=-1.206, roll=-4.174
[2026-03-04 01:31:03.983] -> Applying via SharedMemoryIPC: pos(x=0.001m, y=0.014m, z=0.034m)
[2026-03-04 01:31:03.987] -> SUCCESS: Offset applied to device 6
[2026-03-04 01:31:06.011] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=26499 ms, source=system button activate seq=71
[2026-03-04 01:31:06.011] Dashboard opened - forcing device refresh
[2026-03-04 01:31:06.012] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:31:06.012] stopAdjustmentMode: active=1, handle=257698037798
[2026-03-04 01:31:06.012] Released input focus
[2026-03-04 01:31:06.016] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:06.016] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:31:06.016] Hiding and destroying overlay
[2026-03-04 01:31:06.018] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:06.021] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:06.799] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:31:07.097] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:31:07.678] saveCurrentOffsetsToProfile: Saved current hardware offsets to profile 'EZ : SA58'
[2026-03-04 01:31:08.152] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=2140 ms, source=system button deactivate seq=72
[2026-03-04 01:31:08.156] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:10.952] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=2800 ms, source=system button activate seq=73
[2026-03-04 01:31:10.952] Dashboard opened - forcing device refresh
[2026-03-04 01:31:10.957] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:11.732] startAdjustmentMode: role=Left, mode=translation, currentlyActive=0
[2026-03-04 01:31:11.734] FindOverlay result: error=10, handle=0
[2026-03-04 01:31:11.734] CreateOverlay result: error=0, handle=261993005094
[2026-03-04 01:31:11.734] createOverlayTexture: ENTRY - mode=translation, controller=Left, width=600, height=280
[2026-03-04 01:31:11.734] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:31:11.734] createOverlayTexture: QImage created and filled
[2026-03-04 01:31:11.734] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:31:11.734] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:31:11.735] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:31:11.735] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:31:11.735] ShowOverlay result: error=0
[2026-03-04 01:31:11.735] Adjustment mode started successfully
[2026-03-04 01:31:11.736] Input focus capture: SUCCESS
[2026-03-04 01:31:11.740] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:12.351] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=1398 ms, source=system button deactivate seq=74
[2026-03-04 01:31:12.357] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:31:13.292] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:31:13.292] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:31:13.292] createOverlayTexture: QImage created and filled
[2026-03-04 01:31:13.292] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:31:13.292] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:31:13.292] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:31:13.292] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:31:13.293] updateFloatingOverlay: Updated overlay with mode=translation, controller=Right
[2026-03-04 01:31:14.280] setTranslationOffsets: role=Right, x=-3.77, y=0.12, z=-0.13
[2026-03-04 01:31:14.280] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.280] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.280] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:31:14.284] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.313] setTranslationOffsets: role=Right, x=-3.76, y=0.09, z=-0.13
[2026-03-04 01:31:14.313] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.313] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.313] -> Applying via SharedMemoryIPC: pos(x=-0.038m, y=0.001m, z=-0.001m)
[2026-03-04 01:31:14.315] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.347] setTranslationOffsets: role=Right, x=-3.74, y=0.06, z=-0.13
[2026-03-04 01:31:14.347] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.347] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.347] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=0.001m, z=-0.001m)
[2026-03-04 01:31:14.352] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.380] setTranslationOffsets: role=Right, x=-3.73, y=0.03, z=-0.13
[2026-03-04 01:31:14.380] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.380] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.380] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=0.000m, z=-0.001m)
[2026-03-04 01:31:14.387] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.415] setTranslationOffsets: role=Right, x=-3.71, y=0.00, z=-0.13
[2026-03-04 01:31:14.415] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.415] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.415] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=0.000m, z=-0.001m)
[2026-03-04 01:31:14.419] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.710] setTranslationOffsets: role=Right, x=-3.70, y=0.00, z=-0.13
[2026-03-04 01:31:14.710] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.710] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.710] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=0.000m, z=-0.001m)
[2026-03-04 01:31:14.716] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.742] setTranslationOffsets: role=Right, x=-3.66, y=0.00, z=-0.13
[2026-03-04 01:31:14.742] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.742] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.742] -> Applying via SharedMemoryIPC: pos(x=-0.037m, y=0.000m, z=-0.001m)
[2026-03-04 01:31:14.749] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:14.775] setTranslationOffsets: role=Right, x=-3.63, y=0.00, z=-0.13
[2026-03-04 01:31:14.775] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:14.775] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:14.775] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=0.000m, z=-0.001m)
[2026-03-04 01:31:14.777] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:15.600] setTranslationOffsets: role=Right, x=-3.63, y=-0.01, z=-0.13
[2026-03-04 01:31:15.600] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:15.600] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:15.600] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.000m, z=-0.001m)
[2026-03-04 01:31:15.603] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:15.639] setTranslationOffsets: role=Right, x=-3.63, y=-0.02, z=-0.13
[2026-03-04 01:31:15.639] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:15.639] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:15.639] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.000m, z=-0.001m)
[2026-03-04 01:31:15.642] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:17.673] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=5321 ms, source=system button activate seq=75
[2026-03-04 01:31:17.673] Dashboard opened - forcing device refresh
[2026-03-04 01:31:17.674] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:31:17.674] stopAdjustmentMode: active=1, handle=261993005094
[2026-03-04 01:31:17.674] Released input focus
[2026-03-04 01:31:17.679] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:17.679] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:31:17.679] Hiding and destroying overlay
[2026-03-04 01:31:17.682] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:17.689] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:18.212] onDashboardVisibilityChanged: visible=0, adjustmentMode=0, elapsed=539 ms, source=system button deactivate seq=76
[2026-03-04 01:31:18.216] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=0 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:19.033] onDashboardVisibilityChanged: visible=1, adjustmentMode=0, elapsed=820 ms, source=system button activate seq=77
[2026-03-04 01:31:19.033] Dashboard opened - forcing device refresh
[2026-03-04 01:31:19.036] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:19.793] startAdjustmentMode: role=Right, mode=translation, currentlyActive=0
[2026-03-04 01:31:19.794] FindOverlay result: error=10, handle=0
[2026-03-04 01:31:19.794] CreateOverlay result: error=0, handle=266287972390
[2026-03-04 01:31:19.794] createOverlayTexture: ENTRY - mode=translation, controller=Right, width=600, height=280
[2026-03-04 01:31:19.794] createOverlayTexture: Creating QImage 600x280
[2026-03-04 01:31:19.794] createOverlayTexture: QImage created and filled
[2026-03-04 01:31:19.794] createOverlayTexture: QPainter activated successfully
[2026-03-04 01:31:19.796] createOverlayTexture: QPainter ended, converting image to buffer
[2026-03-04 01:31:19.796] createOverlayTexture: Copying image data (672000 bytes)
[2026-03-04 01:31:19.796] createOverlayTexture: SUCCESS - returning texture data
[2026-03-04 01:31:19.797] ShowOverlay result: error=0
[2026-03-04 01:31:19.797] Adjustment mode started successfully
[2026-03-04 01:31:19.797] Input focus capture: SUCCESS
[2026-03-04 01:31:19.800] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:20.431] onDashboardVisibilityChanged: visible=0, adjustmentMode=1, elapsed=1398 ms, source=system button deactivate seq=78
[2026-03-04 01:31:20.437] updateCalibrationAdjustmentActive: adjustmentMode=1, dashboard=0 => calibrationActive=1 (shouldBlock=1)
[2026-03-04 01:31:21.177] setTranslationOffsets: role=Right, x=-3.63, y=-0.04, z=-0.13
[2026-03-04 01:31:21.177] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.177] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.177] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.000m, z=-0.001m)
[2026-03-04 01:31:21.184] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:21.209] setTranslationOffsets: role=Right, x=-3.63, y=-0.06, z=-0.13
[2026-03-04 01:31:21.209] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.209] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.209] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.001m, z=-0.001m)
[2026-03-04 01:31:21.216] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:21.242] setTranslationOffsets: role=Right, x=-3.63, y=-0.09, z=-0.13
[2026-03-04 01:31:21.242] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.242] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.242] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.001m, z=-0.001m)
[2026-03-04 01:31:21.248] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:21.710] setTranslationOffsets: role=Right, x=-3.63, y=-0.10, z=-0.13
[2026-03-04 01:31:21.710] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.710] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.710] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.001m, z=-0.001m)
[2026-03-04 01:31:21.715] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:21.743] setTranslationOffsets: role=Right, x=-3.63, y=-0.12, z=-0.13
[2026-03-04 01:31:21.743] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.743] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.743] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.001m, z=-0.001m)
[2026-03-04 01:31:21.749] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:21.771] setTranslationOffsets: role=Right, x=-3.63, y=-0.15, z=-0.13
[2026-03-04 01:31:21.772] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:21.772] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:21.772] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.001m, z=-0.001m)
[2026-03-04 01:31:21.773] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:22.496] setTranslationOffsets: role=Right, x=-3.63, y=-0.16, z=-0.13
[2026-03-04 01:31:22.496] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:22.496] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:22.496] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:22.499] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:22.926] setTranslationOffsets: role=Right, x=-3.63, y=-0.17, z=-0.13
[2026-03-04 01:31:22.926] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:22.926] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:22.926] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:22.928] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:23.553] setTranslationOffsets: role=Right, x=-3.63, y=-0.19, z=-0.13
[2026-03-04 01:31:23.553] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:23.553] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:23.553] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:23.557] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:23.585] setTranslationOffsets: role=Right, x=-3.63, y=-0.21, z=-0.13
[2026-03-04 01:31:23.585] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:23.585] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:23.585] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:23.589] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:23.627] setTranslationOffsets: role=Right, x=-3.63, y=-0.23, z=-0.13
[2026-03-04 01:31:23.627] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:23.627] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:23.627] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:23.630] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:25.037] setTranslationOffsets: role=Right, x=-3.62, y=-0.23, z=-0.13
[2026-03-04 01:31:25.037] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:25.037] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:25.037] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:25.043] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:26.095] setTranslationOffsets: role=Right, x=-3.60, y=-0.24, z=-0.13
[2026-03-04 01:31:26.095] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:26.095] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:26.095] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.002m, z=-0.001m)
[2026-03-04 01:31:26.097] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:26.127] setTranslationOffsets: role=Right, x=-3.57, y=-0.25, z=-0.13
[2026-03-04 01:31:26.127] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:26.127] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:26.127] -> Applying via SharedMemoryIPC: pos(x=-0.036m, y=-0.003m, z=-0.001m)
[2026-03-04 01:31:26.129] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:26.160] setTranslationOffsets: role=Right, x=-3.53, y=-0.26, z=-0.13
[2026-03-04 01:31:26.160] -> OpenVR deviceId for Right = 5
[2026-03-04 01:31:26.160] -> Preserving existing rotation: pitch=2.046, yaw=-1.523, roll=18.152
[2026-03-04 01:31:26.160] -> Applying via SharedMemoryIPC: pos(x=-0.035m, y=-0.003m, z=-0.001m)
[2026-03-04 01:31:26.164] -> SUCCESS: Offset applied to device 5
[2026-03-04 01:31:27.352] onDashboardVisibilityChanged: visible=1, adjustmentMode=1, elapsed=6921 ms, source=system button activate seq=79
[2026-03-04 01:31:27.352] Dashboard opened - forcing device refresh
[2026-03-04 01:31:27.353] Dashboard re-opened - auto-stopping adjustment mode (user finished adjusting)
[2026-03-04 01:31:27.353] stopAdjustmentMode: active=1, handle=266287972390
[2026-03-04 01:31:27.353] Released input focus
[2026-03-04 01:31:27.359] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:27.359] blockJoystickInput: block=0 (using calibration adjustment state)
[2026-03-04 01:31:27.359] Hiding and destroying overlay
[2026-03-04 01:31:27.364] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1 => calibrationActive=0 (shouldBlock=0)
[2026-03-04 01:31:27.367] updateCalibrationAdjustmentActive: adjustmentMode=0, dashboard=1
</file>

<file name="139ae26d-4cf9-43b8-8b0b-747369495c7c.txt" mime="text/plain">
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0,0,0) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0314622) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0357436,-0.00257868,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0,0,0) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0314622) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0357436,-0.00257868,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0353626,-0.00268655,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0349877,-0.00281414,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0346133,-0.00294319,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0342404,-0.00307644,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0338672,-0.00320882,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0334997,-0.0033564,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0334997,-0.00352855,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0333603,-0.0038992,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332153,-0.00426767,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00465388,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00504492,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00543616,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00582697,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.0060801,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00628046,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.0066761,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.0070718,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00746764,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00786363,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00795439,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.7938) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.3986) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0331278,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0329749,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0325814,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.032188,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0317955,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0315007,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0311057,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0310191,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.030624,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0302323,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.030084,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0296881,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292922,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0289541,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0285585,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283422,-0.00795439,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283422,-0.00784858,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283422,-0.00745261,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283422,-0.00705728,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283422,-0.00674865,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0285938,-0.00650008,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0289116,-0.00626391,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00602526,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00625797,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00665321,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00704778,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00744237,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00783694,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.672233,17.0947) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00772718,0.0312322) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00749299,0.0309372) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00725142,0.0306438) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00700832,0.0303505) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00676627,0.0300587) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00652573,0.0297647) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00629368,0.0294667) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0060606,0.0291672) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00582517,0.0288652) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00558918,0.0285643) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00535469,0.0282633) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00510009,0.0279961) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00480541,0.027777) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00449973,0.0275755) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00418874,0.0273753) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00387297,0.0271819) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00354801,0.0270004) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00321674,0.0268335) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0028879,0.0266703) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00266948,0.0266703) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00228262,0.0266703) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0019004,0.0266703) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00151538,0.0266703) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0011356,0.0265878) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000772909,0.0264601) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000404754,0.02633) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,3.77947e-05,0.0262018) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000327279,0.0260959) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000625267,0.0259875) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000756562,0.0259875) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000756562,0.0255943) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000756562,0.0251983) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000756562,0.0248023) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000756562,0.0244064) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.00062517,0.0243239) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-0.000338023,0.0241637) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,-1.03774e-05,0.0239871) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000307563,0.023887) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000483514,0.023887) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000649445,0.0237794) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.000978903,0.0235597) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00130885,0.0233407) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00163862,0.0231215) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00196765,0.0229012) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00207533,0.0229012) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00233261,0.0229012) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.672233,16.9219) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.672233,16.6461) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.672233,16.2502) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.672233,16.1065) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.554981,16.1065) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.45286,16.1065) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.299824,16.1065) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,16.1065) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,16.0008) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,15.6734) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,15.2899) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,15.1137) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,0.14611,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,-0.0549292,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00792435,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00242493,0.0229012) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0027615,0.0231098) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00309946,0.0233162) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00343927,0.0235195) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00378183,0.0237181) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00412388,0.0239177) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00446639,0.0241164) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00480876,0.0243154) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0244872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0245669) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0246472) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0250394) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.025432) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.025645) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0260407) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00506083,0.0264364) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00495806,0.0264364) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00481636,0.0265276) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00466811,0.0266247) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00455797,0.0266247) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00445101,0.026905) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00435187,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0292276,-0.00763767,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0291288,-0.00725421,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0290272,-0.00687147,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0289295,-0.00648771,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0288328,-0.00610373,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0287378,-0.00571929,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0286419,-0.00533509,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0285467,-0.00495071,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0284494,-0.00456684,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0283544,-0.00418241,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0282598,-0.00379789,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0281658,-0.00341321,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00302562,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00288145,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00469567,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00509112,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00548665,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00588215,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00627774,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00667337,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00706895,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00746457,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00786022,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00825581,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00865138,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00904697,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00944259,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00983819,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0100469,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0104309,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0108132,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.0111237,0.0271125) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00308516,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00337551,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00372368,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00399294,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0280847,-0.00414312,-0.00125356) rot(0.67255,-0.450784,14.9236) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0,0,0) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0314622) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0357436,-0.00257868,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0357436,-0.00271383,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0357436,-0.00309442,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0356538,-0.00347685,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0355627,-0.00385794,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0354824,-0.00424097,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0354012,-0.00451389,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0354012,-0.00464476,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352892,-0.00478162,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0350345,-0.00505644,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0347839,-0.0053346,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0345459,-0.00562627,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0343078,-0.00591372,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0340631,-0.00620288,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0338175,-0.00648885,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0338175,-0.0067816,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0337248,-0.0071666,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0336242,-0.00754958,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0335355,-0.0079265,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332025,-0.00812922,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.032879,-0.00833844,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0327109,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0323184,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0319251,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.031532,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0319231,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0323144,-0.00851183,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0326036,-0.00830427,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0329269,-0.00807574,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332304,-0.00782131,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.033417,-0.00759945,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.033417,-0.00749867,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.033417,-0.00712817,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0333233,-0.00674342,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.0063588,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00596603,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00564133,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00573376,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00597373,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00626228,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0318582) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0322521) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0326429) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0327512) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0329306) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0333263) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0337187) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0341092) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0342437) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0344682) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0348592) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00791123,0.0352473) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.035635) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0360295) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0364252) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0368203) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0369563) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0373506) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0377397) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0381285) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0385235) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00799203,0.0389115) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0392974) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00648192,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0332291,-0.00687021,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0333109,-0.00725766,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0334761,-0.00755449,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.033859,-0.00745352,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0342337,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0389045) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0385112) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0381179) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0377247) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0373322) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0369399) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.0365475) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00974452,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0346266,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0350224,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0354175,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0358118,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362051,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0365965,-0.00732519,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0369826,-0.00723762,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0373646,-0.00713329,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377464,-0.00702817,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0380159,-0.006928,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00657895,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00618997,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00579711,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00540388,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00501072,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00461756,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00422438,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00383131,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.0034381,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00304394,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00264984,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00225562,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00186086,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00146571,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.00133888,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.000943124,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.000547185,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,-0.000151535,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.000243849,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.000639148,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00103457,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00143001,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00182531,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00222068,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.0026159,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00301057,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00325985,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00365397,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00404994,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00444577,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00484162,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00472569,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00435771,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00399493,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00363366,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.003257,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.0028771,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00263471,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.0029193,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00331517,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00371088,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00410586,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.0045006,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00489532,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00529007,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.0056847,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00607952,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00647422,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00686909,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00726389,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00765863,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00805336,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00844805,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00884278,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00923755,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(0.67255,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0100131,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0103934,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0107788,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0111636,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0115532,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0119433,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0123334,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0127234,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0131124,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.013502,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0138916,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.014282,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0146745,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0150668,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0154599,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0158527,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0162456,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0166388,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0170318,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0174247,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0178177,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0182107,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0186035,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0189965,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0193895,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0197824,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0201752,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0205487,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0209369,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0213296,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0217226,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0221156,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0225087,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0229017,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0232945,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0236875,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0240801,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0244729,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0248661,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0252592,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00808093,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(0.786164,0.672233,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(1.04286,0.370704,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(1.29923,0.0689091,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(1.5548,-0.233562,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(1.81087,-0.535623,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.06885,-0.836052,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.33396,-1.13021,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.61093,-1.41322,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.77456,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.65677,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.3785,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0379336,0.00938261,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.03783,0.00919574,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00885767,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00849727,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.008136,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.0077781,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.0074162,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00705452,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.0066949,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00632664,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.0059579,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00559772,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00524814,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00492208,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00480337,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00442903,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00405344,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00367891,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00330528,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00299541,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00270493,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00231722,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00192943,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00154258,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00135181,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00840568,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00879829,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00919008,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00958174,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.00987807,0.036155) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.0102507,0.0360209) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.0106261,0.0358949) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.0110035,0.0357752) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.0113902,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.011779,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0254591,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.02534,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.025015,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0246858,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0243569,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0240277,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0236967,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0233695,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0230393,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0227135,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0223842,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0220553,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0217268,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0213964,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0210671,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0207382,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0204096,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0200797,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0197486,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0194196,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0190834,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0187512,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0184262,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0181042,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.017783,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0174606,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0171357,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0168165,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0164958,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0161747,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0158541,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.015532,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0152104,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0148883,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.014568,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0142492,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0139281,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.013608,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0132878,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0129676,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0126483,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0123273,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.012008,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0116881,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0113661,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0110444,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0107234,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0104028,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0100798,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00975996,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00943937,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00911951,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00879945,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00847959,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00815891,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00783705,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00751658,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00719418,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00687518,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00655424,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.0062341,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0121703,0.0356896) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0123346,0.0353293) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0125126,0.0349756) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0126888,0.034621) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0128796,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0131402,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0135347,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0139243,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00591436,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00581978,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00553755,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00521376,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00488403,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00455031,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00421891,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00388589,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00355517,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00322305,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00289236,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00256212,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00223059,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00189931,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00156888,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.00123793,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000963904,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0140617,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0377274,0.00119074,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0375795,0.000879393,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0374165,0.000569658,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.037265,0.000257204,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0371487,6.20254e-07,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0370074,6.20254e-07,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0366143,6.20254e-07,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,6.20254e-07,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-8.29619e-05,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.000247975,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.000389929,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.000643588,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.000902577,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.000993338,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00123943,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00146871,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00157016,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00168994,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00186158,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00207356,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362607,-0.00225241,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0361755,-0.00225241,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0360492,-0.00235262,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0356861,-0.00251078,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0353042,-0.00261544,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0353042,-0.00243266,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-0.00204589,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-0.00165456,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-0.00126023,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-0.000864991,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-0.000469656,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,-7.43449e-05,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00032099,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.000716289,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00111162,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00150684,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00190227,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00229764,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.002693,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00308775,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.0034825,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00387727,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00427199,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00466669,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00506146,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.0054561,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00585069,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0352193,0.00624539,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0141843,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0145791,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0149747,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0153705,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0157662,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.016162,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0165577,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0169535,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0173493,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0177451,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.018141,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0185368,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0189327,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0193285,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0197243,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.02012,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0205158,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0209116,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0213075,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0217033,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0220991,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0224949,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0228907,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0232865,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0236823,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0240781,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0244739,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0248697,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0252654,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0256612,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.026057,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0264528,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0268486,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0272444,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0276402,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.028036,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0284318,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0288276,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0292233,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0296191,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0300149,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0304107,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0308066,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0312024,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0315982,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0319939,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0323897,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0327855,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0330057,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0330917,0.0343615) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0334724,0.0342523) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0338538,0.0341458) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.03424,0.0340582) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0346273,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0349993,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0351963,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0355914,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0359865,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0363812,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0367761,0.0339758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0370681,0.033874) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0374509,0.0337726) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0378376,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0382315,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.038451,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0388057,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0391995,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0395934,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0399871,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0403806,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0407743,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0336872) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0350979,0.00648129,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0349835,0.0068604,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0348986,0.00724719,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0348986,0.00763529,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0348182,0.00802302,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0347377,0.00841074,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0347377,0.00879877,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0340801) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0344729) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0348659) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.035259) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0356527) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0360486) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0364446) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0368405) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0409476,0.0370613) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410597,0.0374411) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0411724,0.0378207) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0412872,0.0381997) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0414083,0.0385767) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.041535,0.0389519) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0416704,0.039324) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0418156,0.0396924) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0400577) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0402209) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0398273) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0394337) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0390401) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0386465) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0382528) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0378591) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0374654) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0370707) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0366758) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0419686,0.0364963) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0351226,0.00889157,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0355053,0.00899362,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0358883,0.00909394,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0362714,0.00919454,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0366542,0.00929575,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0370374,0.00939538,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0374034,0.00939538,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0374034,0.00925404,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0375856,0.00900669,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.037838,0.00870157,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0380735,0.00838326,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0381954,0.00804157,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0418609,0.0361152) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0417514,0.0357346) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0416482,0.0353523) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0415448,0.0349701) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0414423,0.0345876) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.041339,0.0342053) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0412361,0.0338229) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0411324,0.0334407) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0331067) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0327138) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.03232) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0319264) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0315329) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0311397) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0307466) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0303534) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0299664) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0295722) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0291781) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.028784) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0283898) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0281067) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0279654) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.027572) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0271786) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.026785) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0385597,0.00788643,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0389233,0.00772966,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0392798,0.00755718,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0395192,0.00747055,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0399021,0.00736975,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040293,0.00736975,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.00736975,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0271792) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0275752) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0279709) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0283665) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0287365) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0289173) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0293121) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0297061) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0300981) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0304897) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0307054) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0311012) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0314955) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0318866) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0410171,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.041338,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.041734,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.04213,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.042526,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.042922,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.043318,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0437139,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0441099,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0445059,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0447235,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0449328,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0453264,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0457203,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0461149,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0464884,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0463734,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0460232,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0456422,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0452479,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0448535,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0444591,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0440647,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0436703,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0320738) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.00728155,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.00703519,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.00667601,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.0063164,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.040685,0.00595682,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00559996,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00524246,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00492261,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00470378,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00484372,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00505357,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0406055,0.00524563,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0316822) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0312904) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0308986) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0305055) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.030112) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(0.000798976,0.0434258,0.0298021) rot(-0,-1.20643,-4.17384) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0408486,0.00524563,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0412445,0.00524563,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0416404,0.00524563,-0.00125356) rot(2.04564,-1.52347,18.1524) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,0.141084) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,0.519693) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,0.913675) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,1.30826) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,1.70285) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,2.09763) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,2.4925) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,2.88732) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,3.28209) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,3.67693) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,4.07175) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,4.46648) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,4.86134) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,5.25619) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,5.65116) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,6.04595) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,6.44074) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,6.83569) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,7.23053) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,7.62531) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,8.02021) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,8.41497) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,8.80993) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.20475) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.59964) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.99441) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,10.3892) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,10.784) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,11.179) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,11.4865) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,11.8806) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,12.2748) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,12.6693) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,13.0638) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,13.4583) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,13.8528) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.2473) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.6368) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.4137) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.1329) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,13.9802) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.3304) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0.136262,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0.363793,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0.520612,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0.771878,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,1.16774,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,1.43037,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.118255,1.74546,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.25013,2.11885,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.25013,2.35318,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.25013,2.61941,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.333144,3.0066,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.414382,3.39418,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.798067,3.39418,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.19334,3.39418,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.58364,3.39418,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.80977,3.39418,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.11919,3.48658,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.25353,3.48658,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,14.7169) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,15.1058) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,15.496) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,15.8835) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,16.0814) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,16.3282) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.48658,16.5864) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.58295,16.5864) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,3.97855,16.5864) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,4.3745,16.5864) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,4.3745,16.7862) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,4.3745,16.9817) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,4.3745,17.0642) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.41623,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.57727,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.76298,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.94005,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.04351,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.18755,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.41159,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.70357,4.3745,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.000392942,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.000786006,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00118058,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00157538,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00197031,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00236521,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00276016,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00315506,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00354986,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00394469,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00433959,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00473426,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00512906,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00552371,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00591845,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00631311,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00670787,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00710267,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00749745,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00789243,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00828718,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00868199,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00907682,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00947157,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00976206,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0098427,0,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0102295,8.48269e-05,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0106163,0.000169726,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0109821,0.000169726,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0113776,0.000169726,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0117733,0.000169726,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0118953,0.000169726,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0122829,0.000250734,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0126694,0.00033683,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,0.00033683,0) rot(3.97577,4.47166,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,0.00033683,0) rot(3.97577,4.29957,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,0.00033683,0) rot(3.97577,4.05993,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,0.00033683,0) rot(3.97577,3.67135,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,0.00033683,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000235422,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000522449,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000819857,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00111511,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00142023,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00173059,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00204125,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00234945,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00266223,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00297521,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00328742,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00359797,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00391161,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00422449,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00453842,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00485262,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00516405,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00547792,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00579114,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0061033,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00641547,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00672727,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00704079,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00735565,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00766844,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00797894,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00829037,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00860211,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00891555,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00922773,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00954299,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00985646,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0101685,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0104831,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0107961,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0111072,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.011419,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0117336,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-3.65702e-05,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.000430177,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.000824219,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00121914,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00161321,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00200806,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00240166,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00279438,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00318748,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129069,-0.00358164,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128231,-0.00319537,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128231,-0.0028062,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128231,-0.00241527,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128231,-0.00202237,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128231,-0.00170752,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0124387,-0.00180282,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0120527,-0.00189126,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,0) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.000165581) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.000503801) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00084329) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00118145) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00152392) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00186381) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00220325) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00254526) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00288542) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00322775) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0035696) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00390933) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00425163) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00459259) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00493451) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00527939) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00562127) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00596354) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00630669) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00664812) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00698955) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00732973) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00767203) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00801216) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00835366) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00869381) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00903439) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00937541) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.00971644) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0100566) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0103988) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0107403) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0110835) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0116693,-0.00199027,-0.0114244) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0120219,-0.00217049,-0.0117676) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0121086) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0124505) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0127902) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0131299) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0134705) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.013811) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0141538) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0123755,-0.0023487,-0.0144944) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0125535,-0.00259794,-0.0148337) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0127434,-0.00294545,-0.0151742) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0128979,-0.00331006,-0.0155152) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0130493,-0.00367593,-0.0158537) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0130493,-0.00406511,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0130493,-0.00414464,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0130493,-0.00434992,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.013194,-0.00471854,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0133405,-0.00508646,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0135307,-0.00543377,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0137584,-0.00575774,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0139233,-0.0060005,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0141819,-0.0062632,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143748,-0.00660904,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0145127,-0.00698026,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.014649,-0.00723147,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.000395094,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.000789063,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00118267,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00157622,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0019698,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00236329,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00275664,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00315013,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00354358,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00393705,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00433044,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00472407,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00511741,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00551098,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00590442,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00629787,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00669128,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00708476,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00747841,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00787182,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00826511,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00865874,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00905212,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00915333,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00915333,-0.000394501) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00915333,-0.000788797) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00915333,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00926212,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00953936,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.00988091,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0102308,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0105613,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0108052,-0.00118313) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0111873,-0.00128607) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0115735,-0.00137357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.0119627,-0.00137357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00137357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00176725) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00216086) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00255333) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00294176) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(-0.118412,-0,-0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(-0.409946,-0,-0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(-0.771153,-0,-0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(-1.16658,-0,-0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(-1.56213,-0,-0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.014649,-0.00741662,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.014649,-0.007796,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.014649,-0.00817536,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.014649,-0.00851999,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0150442,-0.00851999,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0154395,-0.00851999,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0158354,-0.00851999,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0162313,-0.00851999,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0162313,-0.0081641,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0162313,-0.00776818,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0162313,-0.00759391,-0.0160033) rot(3.97577,3.46908,17.3319) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120457,0.012348,-0.00333172) rot(2.60586,-0.080005,-2.31654) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0,0.0222446,0.019842) rot(2.60586,-0.080005,-2.31654) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0162313,-0.00759391,-0.0160033) rot(2.78671,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(2.78671,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(3.04566,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(3.44129,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(3.8348,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(4.22468,2.20309,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(4.61032,2.29303,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(4.99585,2.3835,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(5.38181,2.47202,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(5.76772,2.56078,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(6.15391,2.64839,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(6.53999,2.73644,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(6.92584,2.82553,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(7.31202,2.91313,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(7.69811,3.00111,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(8.08494,3.08581,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(8.47109,3.17355,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(8.85733,3.2609,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(8.99679,2.89028,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(9.16603,2.53228,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(9.34799,2.18057,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(9.53109,1.82945,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(9.71512,1.47882,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(9.91761,1.13851,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(10.1284,0.803264,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(10.2552,0.653454,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(10.3943,0.516854,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(10.6823,0.245103,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(11.0033,0.0132095,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(11.3601,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(11.7492,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(12.1082,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(12.2798,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(12.6705,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(13.0659,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0279459,5.543e-05,-0.00358898) rot(13.4612,-0.158571,16.25) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=0 pos(0,0,0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,0.350547) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,0.746523) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,1.14244) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,1.53824) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,1.9341) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,2.32992) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,2.72576) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,3.12147) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,3.51114) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,3.90608) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,4.30122) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,4.69662) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,5.0921) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,5.48775) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,5.88342) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,6.2791) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,6.6749) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,7.07061) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,7.46638) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,7.86015) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,8.25342) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,8.64673) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.03954) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.43468) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,9.83024) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,10.2261) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,10.6219) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.275642,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(0.670977,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.06637,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.46188,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(1.85196,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.10409,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.49975,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(2.89542,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.291,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.68652,0,11.0177) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.68652,0,11.3844) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.68652,0,11.7666) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.68652,0,12.1482) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.68652,0,12.5308) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(3.80737,0,12.91) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(4.19987,0,13.1649) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(4.59255,0,13.1649) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(4.98491,0,13.1649) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.37687,0,13.1649) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.53635,0,13.1649) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.53635,0,13.5567) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.53635,0,13.9521) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.53635,0,14.3474) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.53635,0,14.7427) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(5.71264,0,15.138) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(6.10449,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(6.49647,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(6.88931,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(7.28444,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(7.50861,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(7.65213,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(8.04499,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(8.43825,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(8.83127,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.22422,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.56001,0,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.56001,0.237489,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.47416,0.624062,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.38921,1.01084,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.29187,1.39468,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(9.66101,1.5303,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(10.0327,1.66677,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(10.4073,1.79519,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(10.7982,1.79519,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(11.0972,2.05474,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(11.4029,2.30644,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(11.7089,2.55779,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(11.9679,2.77559,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.1031,2.5392,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.2974,2.19418,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,1.85402,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,1.59079,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,1.1948,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,0.798828,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,0.955901,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,1.35186,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.5002,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(12.7977,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(13.1915,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(13.5856,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,0,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.000134969,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.000503547,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.000875099,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00125026,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.0016289,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00200572,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00238296,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00275802,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00312197,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00333097,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00354184,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.0037969,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00409327,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00446522,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00483967,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00521355,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(0,-0.00549704,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.000379262,-0.00538313,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.000746716,-0.00523552,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00111085,-0.00507991,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00147562,-0.00492579,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00184927,-0.00479467,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00222663,-0.00467459,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00260565,-0.0045599,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00298483,-0.00444576,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0033639,-0.00433121,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00374425,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00396546,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00416582,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00440934,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00469331,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00508927,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00548519,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.73247,15.2203) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.73247,15.4315) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.73247,15.6284) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.73247,15.7213) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.73247,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.64159,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.39601,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00558948,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00598437,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00637906,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00677188,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00716084,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00755622,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00795216,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00834224,-0.00422101,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00872754,-0.00412963,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,0) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.000271497) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.000589486) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.000914038) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00123728) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00156249) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00188867) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00221433) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00254128) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00286757) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00319232) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00351764) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00384293) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00417287) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00450021) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.0048246) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00514858) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00547476) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00580177) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00613003) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00645686) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00678649) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00711475) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00744387) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0091138,-0.00404236,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0092087,-0.00427491,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00933948,-0.00464867,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00943872,-0.00503203,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00943872,-0.00539267,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00943872,-0.00554741,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00955693,-0.00577705,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.009689,-0.00604517,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00982279,-0.0063132,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00992399,-0.00652418,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00992399,-0.00667746,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.00992399,-0.00687563,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0100088,-0.00726245,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0100915,-0.0076497,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00802236,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00830485,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00844669,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00874266,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00913745,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0101712,-0.00949894,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0103697,-0.00915629,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0105672,-0.00881308,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00777162) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00808652) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00840674) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.008733) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00906389) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00939777) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.00973029) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.010062) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.0103911) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.0106879) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0107667,-0.00847101,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0110047,-0.0081707,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0112624,-0.00787,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0115204,-0.00756956,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0117861,-0.00727598,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000127899,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000414297,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000698834,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.000988133,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00128449,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00157842,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00187279,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00216823,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00246245,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00275402,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00306008,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0033611,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00366324,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00396894,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00427209,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00457568,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00488023,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00518486,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00548739,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00578962,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00609313,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0063463,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00658883,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00689142,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00719615,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00750194,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00780805,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00811449,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00842163,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00872896,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00903246,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00933697,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00964177,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.00994733,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0102529,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0105602,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0108661,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0111719,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0114775,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0117838,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0120731,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0123642,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0126672,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0129696,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0132725,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0135755,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0138808,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0141846,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0144946,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0148008,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0151106,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0154187,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0157285,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0160391,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0163467,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0166543,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0169646,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.017275,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0175833,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0178905,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0181975,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.018503,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0187671,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.019001,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0193031,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0196077,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0199122,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0202174,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0205217,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0208263,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0211306,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0214342,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0217391,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0220444,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0223479,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0226545,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.000169485,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.000565207,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00096088,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00135646,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00175167,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00214673,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00254173,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00293653,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00333126,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00372569,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00412,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00451423,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00490849,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00530285,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00569725,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00609172,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.0064857,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00688003,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00727438,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00766869,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00806303,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0229592,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0230736,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.023319,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0236224,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0239262,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0242307,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0245324,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.024839,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.024941,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0250593,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0252928,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.025589,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0258918,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0261993,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0265059,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0268096,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0271155,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0274244,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.00845737,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.00861654,-0) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.00900244,-8.88634e-05) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.00938941,-0.000172905) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.00977714,-0.000253357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0101652,-0.000253357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0105532,-0.000253357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0109413,-0.000253357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0113295,-0.000253357) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0117173,-0.000333108) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0121055,-0.000333108) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0124935,-0.000333108) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0128813,-0.000413439) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0132693,-0.000492803) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0136568,-0.000574005) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0140448,-0.000574005) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0144327,-0.000653961) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0148207,-0.000653961) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0152086,-0.000733858) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0275246,0.0155959,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0276611,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0279645,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0282673,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0285723,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0288767,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0291807,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0294851,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0297895,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0300927,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0303982,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0307042,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0310105,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0313145,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0316186,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0319224,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0322252,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0325294,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0328317,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0158818,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0161312,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0165262,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0169211,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.017316,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0177108,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0181057,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0185007,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0188955,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0192903,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0196852,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.02008,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0204748,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0208696,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0212645,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0216592,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.022054,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0224488,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0228435,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0232381,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0236328,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0240275,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0244221,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0248167,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0252113,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0256056,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0259998,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0263938,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0267879,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0271819,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0275761,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0279711,-0.000816424) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0281527,-0.000924443) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.028534,-0.00103139) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0289237,-0.00103139) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0293156,-0.00103139) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0297076,-0.00103139) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0300977,-0.00103139) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.030484,-0.00111851) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0308699,-0.00120713) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0312503,-0.00131742) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.031623,-0.00145112) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0319924,-0.00159372) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0323616,-0.0017369) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.032731,-0.00187962) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0331005,-0.00202194) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0334703,-0.00216377) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0338402,-0.00230491) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.03421,-0.00244657) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0345704,-0.00261069) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0349091,-0.0028158) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0352279,-0.00305081) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0355387,-0.0032961) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0358421,-0.0035506) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0361084,-0.0038437) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0362733,-0.00420371) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0362733,-0.00446117) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0363715,-0.00484478) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0364735,-0.00522741) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0365798,-0.00560887) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0365798,-0.00571845) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0366798,-0.00610161) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0367903,-0.00648187) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0368976,-0.00686302) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0370009,-0.0072453) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0371058,-0.00762716) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0372111,-0.0080089) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.008391) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.00877966) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.00917346) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.00956716) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.00996103) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0103558) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0107506) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0111456) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0115399) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0119334) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0123277) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.037315,-0.0127228) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.03754,-0.0128265) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0378841,-0.0129481) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0382156,-0.013066) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0382156,-0.0134592) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0382156,-0.0138525) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0382156,-0.0142455) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0382156,-0.0143799) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0385809,-0.0145327) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0389577,-0.0146547) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.039342,-0.01475) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0397281,-0.0148382) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.040114,-0.0149268) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0404997,-0.0150165) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.040885,-0.015108) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0412702,-0.0152) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.041655,-0.0152934) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0418945,-0.0152934) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0421658,-0.0152934) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0425486,-0.0153947) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0429356,-0.0154785) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0433234,-0.0155586) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.043711,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0440991,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0444874,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0447357,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.044538,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0442049,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0438581,-0.0156398) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0438581,-0.0160326) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0438581,-0.0164255) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=6 hand=LEFT enabled=1 pos(-0.0329195,0.0438581,-0.0168182) rot(0,0,0) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0121821,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0125781,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0129741,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0133701,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0137661,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0141621,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00727599,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00763645,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00799482,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00835409,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00871882,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0108355) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0110951) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0114229) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0117583) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0120914) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0124279) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0127651) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0131003) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0134405) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0137799) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0141261) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0144707) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0148096) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0151493) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0154917) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0158331) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0161766) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0164444) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.016772) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0171102) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0174491) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0177908) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0181318) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00906285,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00918112,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00950986,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.00989977,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.01029,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0106799,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0110705,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0114615,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0118528,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0121669,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0143365,-0.0123168,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0147275,-0.0123168,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0151235,-0.0123168,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0155191,-0.0123168,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0183274) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0184662) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0187861) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0191169) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0194455) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0197836) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.020122) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0204599) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0207962) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0211322) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0214692) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0218073) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0123168,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0159138,-0.0124428,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0160706,-0.0126626,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0163324,-0.0129597,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.016591,-0.0132596,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0168269,-0.0135777,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0170324,-0.0139162,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0172333,-0.0142328,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0220795) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0222165) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0224885) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0227622) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0230411) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0233184) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0235961) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0238723) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0241492) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0243592) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0241908) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0240216) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0238505) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev=5 hand=RIGHT enabled=1 pos(-0.0173887,-0.0144499,-0.0236838) rot(13.7259,1.31384,16.1038) target=DriverOffsets
SetDeviceOffset dev
</file>

<file name="96da1c84-c777-447f-a07d-f702980c1c5e.txt" mime="text/plain">
[2026-03-04 01:12:32.764] [MAIN] entry point, argc=1
[2026-03-04 01:12:32.764] [MAIN] version=v1.2.360
[MAIN] Starting argument parsing loop
[MAIN] Exited argument parsing loop, about to enter try block
[STARTUP] main() try block entered, desktopMode=0
[STARTUP] About to create QApplication
[STARTUP] QApplication created
[STARTUP] App directory: C:/Program Files/RGCS
[STARTUP] About to set organization name
[STARTUP] Set organization name (empty to avoid double nesting)
[STARTUP] Set application name
[STARTUP] Setting application display name
[STARTUP] Installing Qt message handler
[STARTUP] Qt message handler installed
[STARTUP] About to set application version
[STARTUP] Application version set
[STARTUP] Setting up Qt file logging
[STARTUP] AppLogger initialized to: C:\Users\saq\AppData\Local\RGCS\logs
[STARTUP] Moving to core init
[STARTUP] Creating QSettings...
[STARTUP] QSettings path: C:/Users/saq/AppData/Local/RGCS/RGCS.ini
[STARTUP] QSettings created
[STARTUP] QML engine created with import paths
[STARTUP] About to create OverlayController...
[STARTUP] ENTERED try block for Init
[SHUTDOWN] Normal application shutdown - letting SteamVR clean up OpenVR
</file>

<file name="c8bc256c-3977-4c07-8bd5-6c597d3be901.txt" mime="text/plain">
2026-03-04 01:12:33.294 [INFO] OVR Input Emulator Plus starting...
2026-03-04 01:12:33.294 [INFO] Version: v1.2.360
2026-03-04 01:12:33.294 [INFO] Log directory: C:\Users\saq\AppData\Local\RGCS\logs
2026-03-04 01:12:33.330 [INFO] [GameStateStore] Initialized — state management active
2026-03-04 01:12:35.134 [INFO] [GameProfileController] initStage1
2026-03-04 01:12:37.203 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:37.203 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:37.204 [INFO] [GameProfileController] startGameDetection() called — delegated to GameDetector/StateStore architecture
2026-03-04 01:12:37.217 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:37.303 [INFO] Attempting to load dashboard thumbnail icon: C:/Program Files/RGCS/res/thumbicon.png
2026-03-04 01:12:37.311 [INFO] Dashboard thumbnail icon loaded successfully
2026-03-04 01:12:37.850 [SETUP] Connecting render control signals...
2026-03-04 01:12:37.851 [SETUP] Render control signals connected, initial render scheduled
2026-03-04 01:12:37.857 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:37.858 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:38.199 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:38.401 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:38.606 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:38.630 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:38.866 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.027 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.207 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.356 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.356 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.356 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.372 [INFO] [SMOOTHING] Connected to lean driver via RGCSClient
2026-03-04 01:12:39.372 [Info] [SMOOTHING] Resolver: falling back to Global (baseline)
2026-03-04 01:12:39.377 [INFO] [GameProfileController] initStage2 (state-store architecture)
2026-03-04 01:12:39.380 [INFO] [GameProfileController] ProfileManager initialized at: C:/Users/saq/AppData/Local/RGCS
2026-03-04 01:12:39.387 [INFO] [GameProfileController] Loaded game 'contractors_showdown': abbreviation='EZ', displayName='Contractors Showdown: Exfil Zone'
2026-03-04 01:12:39.389 [INFO] [GameProfileController] State store wired — listening for activeGameChanged, equippedWeaponChanged, gameRunningChanged
2026-03-04 01:12:39.389 [INFO] Initial device enumeration (initStage2) completed — GameStateStore wired
2026-03-04 01:12:39.389 [INFO] Initializing game detection system...
2026-03-04 01:12:39.390 [INFO] GameDatabase initialized successfully
2026-03-04 01:12:39.390 [INFO] Found 1 enabled game(s) to register for detection
2026-03-04 01:12:39.392 [INFO] GameDetector: Loaded config for contractors_showdown, log path: C:/Program Files/RGCS/%STEAMAPPS%/common/Contractors Showdown/Contractors_Showdown/ExfilZone/ExfilZone.log
2026-03-04 01:12:39.392 [INFO] GameDetector: Registered game: contractors_showdown | Executable: Contractors_Showdown.exe | Steam ID: 2719160 | Log path: C:/Program Files/RGCS/%STEAMAPPS%/common/Contractors Showdown/Contractors_Showdown/ExfilZone/ExfilZone.log
2026-03-04 01:12:39.392 [INFO] Registered Contractors: Showdown (App ID: 2719160) for detection
2026-03-04 01:12:39.392 [DEBUG] GameDetector::startDetection() called
2026-03-04 01:12:39.393 [INFO] GameDetector: Starting detection with 1 games registered
2026-03-04 01:12:39.393 [INFO] → Registered: contractors_showdown | Executable: Contractors_Showdown.exe | Steam ID: 2719160
2026-03-04 01:12:39.393 [INFO] GameDetector: Found 1 Steam installations
2026-03-04 01:12:39.394 [DEBUG] GameDetector: Performing initial detection check
2026-03-04 01:12:39.394 [DEBUG] [GameDetector] performDetection() called at 01:12:39.394
2026-03-04 01:12:39.445 [INFO] GameDetector: Detection timer started (ID: 805306373), polling every 1000ms
2026-03-04 01:12:39.445 [INFO] Controller roles defined - enabling full startup detection sequence
2026-03-04 01:12:39.447 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.448 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.604 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:39.801 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.001 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.124 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.201 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.402 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.441 [DEBUG] [GameDetector] Timer poll #1
2026-03-04 01:12:40.441 [DEBUG] [GameDetector] performDetection() called at 01:12:40.441
2026-03-04 01:12:40.600 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.802 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:40.874 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.001 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.201 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.401 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.441 [DEBUG] [GameDetector] performDetection() called at 01:12:41.441
2026-03-04 01:12:41.601 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.626 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.802 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:41.940 [INFO] Secondary device refresh completed
2026-03-04 01:12:42.001 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:42.200 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:42.376 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:42.401 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:42.440 [DEBUG] [GameDetector] performDetection() called at 01:12:42.440
2026-03-04 01:12:42.601 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:42.801 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.000 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.125 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.200 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.401 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.440 [DEBUG] [GameDetector] performDetection() called at 01:12:43.440
2026-03-04 01:12:43.616 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.808 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.905 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.940 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:43.941 [INFO] Controllers with defined roles not detected - triggering auto-refresh
2026-03-04 01:12:43.941 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:43.942 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:43.942 [INFO] Starting continuous controller detection retry (2s interval, 60s timeout)
2026-03-04 01:12:44.005 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:44.214 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:44.456 [DEBUG] [GameDetector] performDetection() called at 01:12:44.456
2026-03-04 01:12:44.625 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:45.375 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:45.456 [DEBUG] [GameDetector] performDetection() called at 01:12:45.456
2026-03-04 01:12:45.940 [INFO] Controller detection retry 1/30: Roles defined, scanning for controllers...
2026-03-04 01:12:45.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:45.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:46.455 [DEBUG] [GameDetector] performDetection() called at 01:12:46.455
2026-03-04 01:12:47.455 [DEBUG] [GameDetector] performDetection() called at 01:12:47.455
2026-03-04 01:12:47.942 [INFO] Controller detection retry 2/30: Roles defined, scanning for controllers...
2026-03-04 01:12:47.942 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:47.942 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:48.455 [DEBUG] [GameDetector] performDetection() called at 01:12:48.455
2026-03-04 01:12:49.455 [DEBUG] [GameDetector] performDetection() called at 01:12:49.455
2026-03-04 01:12:49.940 [INFO] Controller detection retry 3/30: Roles defined, scanning for controllers...
2026-03-04 01:12:49.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:49.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:50.456 [DEBUG] [GameDetector] Timer poll #11
2026-03-04 01:12:50.456 [DEBUG] [GameDetector] performDetection() called at 01:12:50.456
2026-03-04 01:12:51.456 [DEBUG] [GameDetector] performDetection() called at 01:12:51.456
2026-03-04 01:12:51.940 [INFO] Controller detection retry 4/30: Roles defined, scanning for controllers...
2026-03-04 01:12:51.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:51.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:52.456 [DEBUG] [GameDetector] performDetection() called at 01:12:52.456
2026-03-04 01:12:53.456 [DEBUG] [GameDetector] performDetection() called at 01:12:53.456
2026-03-04 01:12:53.940 [INFO] Controller detection retry 5/30: Roles defined, scanning for controllers...
2026-03-04 01:12:53.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:53.940 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:54.456 [DEBUG] [GameDetector] performDetection() called at 01:12:54.456
2026-03-04 01:12:55.455 [DEBUG] [GameDetector] performDetection() called at 01:12:55.455
2026-03-04 01:12:55.940 [INFO] Controller detection retry 6/30: Roles defined, scanning for controllers...
2026-03-04 01:12:55.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:55.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:56.455 [DEBUG] [GameDetector] performDetection() called at 01:12:56.455
2026-03-04 01:12:57.455 [DEBUG] [GameDetector] performDetection() called at 01:12:57.455
2026-03-04 01:12:57.940 [INFO] Controller detection retry 7/30: Roles defined, scanning for controllers...
2026-03-04 01:12:57.941 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:57.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:12:58.455 [DEBUG] [GameDetector] performDetection() called at 01:12:58.455
2026-03-04 01:12:59.455 [DEBUG] [GameDetector] performDetection() called at 01:12:59.455
2026-03-04 01:12:59.940 [INFO] Controller detection retry 8/30: Roles defined, scanning for controllers...
2026-03-04 01:12:59.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:12:59.940 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:00.455 [DEBUG] [GameDetector] Timer poll #21
2026-03-04 01:13:00.455 [DEBUG] [GameDetector] performDetection() called at 01:13:00.455
2026-03-04 01:13:01.458 [DEBUG] [GameDetector] performDetection() called at 01:13:01.458
2026-03-04 01:13:01.940 [INFO] Controller detection retry 9/30: Roles defined, scanning for controllers...
2026-03-04 01:13:01.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:01.940 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:02.455 [DEBUG] [GameDetector] performDetection() called at 01:13:02.455
2026-03-04 01:13:03.455 [DEBUG] [GameDetector] performDetection() called at 01:13:03.455
2026-03-04 01:13:03.941 [INFO] Controller detection retry 10/30: Roles defined, scanning for controllers...
2026-03-04 01:13:03.941 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:03.942 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:04.456 [DEBUG] [GameDetector] performDetection() called at 01:13:04.456
2026-03-04 01:13:05.455 [DEBUG] [GameDetector] performDetection() called at 01:13:05.455
2026-03-04 01:13:05.941 [INFO] Controller detection retry 11/30: Roles defined, scanning for controllers...
2026-03-04 01:13:05.941 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:05.943 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:06.456 [DEBUG] [GameDetector] performDetection() called at 01:13:06.456
2026-03-04 01:13:07.455 [DEBUG] [GameDetector] performDetection() called at 01:13:07.455
2026-03-04 01:13:07.940 [INFO] Controller detection retry 12/30: Roles defined, scanning for controllers...
2026-03-04 01:13:07.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:07.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:08.457 [DEBUG] [GameDetector] performDetection() called at 01:13:08.457
2026-03-04 01:13:09.455 [DEBUG] [GameDetector] performDetection() called at 01:13:09.455
2026-03-04 01:13:09.941 [INFO] Controller detection retry 13/30: Roles defined, scanning for controllers...
2026-03-04 01:13:09.941 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:09.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:10.455 [DEBUG] [GameDetector] Timer poll #31
2026-03-04 01:13:10.455 [DEBUG] [GameDetector] performDetection() called at 01:13:10.455
2026-03-04 01:13:11.455 [DEBUG] [GameDetector] performDetection() called at 01:13:11.455
2026-03-04 01:13:11.940 [INFO] Controller detection retry 14/30: Roles defined, scanning for controllers...
2026-03-04 01:13:11.940 [DEBUG] Device scan: 1 HMD, 0 controllers [], 0 trackers
2026-03-04 01:13:11.941 [DEBUG] Role check: Missing controllers - Need Left=YES (have=no), Need Right=YES (have=no), detected=[]
2026-03-04 01:13:12.455 [DEBUG] [GameDetector] performDetection() called at 01:13:12.455
2026-03-04 01:13:12.911 [INFO] Dashboard deactivated (system button) seq=0
2026-03-04 01:13:12.911 [INFO] Stopping controller detection retry - dashboard closed
2026-03-04 01:13:12.921 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:13:13.455 [DEBUG] [GameDetector] performDetection() called at 01:13:13.455
2026-03-04 01:13:13.593 [INFO] Dashboard activated (system button) seq=1
2026-03-04 01:13:13.593 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:13:13.799 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:13:13.799 [INFO] Device refresh after dashboard activation
2026-03-04 01:13:14.455 [DEBUG] [GameDetector] performDetection() called at 01:13:14.455
2026-03-04 01:13:15.456 [DEBUG] [GameDetector] performDetection() called at 01:13:15.456
2026-03-04 01:13:16.071 [DEBUG] [EVENTS] MouseButtonDown at (286,446) button=Left timestamp=1059
2026-03-04 01:13:16.071 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:16.191 [DEBUG] [EVENTS] MouseButtonUp at (287,441) button=Left timestamp=1065
2026-03-04 01:13:16.191 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:16.457 [DEBUG] [GameDetector] performDetection() called at 01:13:16.457
2026-03-04 01:13:16.511 [DEBUG] [EVENTS] MouseButtonDown at (293,434) button=Left timestamp=1078
2026-03-04 01:13:16.512 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:16.632 [DEBUG] [EVENTS] MouseButtonUp at (291,435) button=Left timestamp=1087
2026-03-04 01:13:16.633 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:17.455 [DEBUG] [GameDetector] performDetection() called at 01:13:17.455
2026-03-04 01:13:17.931 [DEBUG] [EVENTS] MouseButtonDown at (174,302) button=Left timestamp=1146
2026-03-04 01:13:17.931 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:18.011 [DEBUG] [EVENTS] MouseButtonUp at (173,298) button=Left timestamp=1153
2026-03-04 01:13:18.011 [Info] [SMOOTHING] Smoothing ENABLED by user
2026-03-04 01:13:18.016 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:18.016 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=true hmdStr=0.0100 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:18.016 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:13:18.021 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.010
2026-03-04 01:13:18.021 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:18.024 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:13:18.024 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:18.029 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:13:18.029 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:13:18.029 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:13:18.029 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:18.456 [DEBUG] [GameDetector] performDetection() called at 01:13:18.456
2026-03-04 01:13:19.456 [DEBUG] [GameDetector] performDetection() called at 01:13:19.456
2026-03-04 01:13:20.053 [DEBUG] [EVENTS] MouseButtonDown at (168,315) button=Left timestamp=1239
2026-03-04 01:13:20.053 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:20.171 [DEBUG] [EVENTS] MouseButtonUp at (171,315) button=Left timestamp=1243
2026-03-04 01:13:20.171 [Info] [SMOOTHING] Smoothing DISABLED by user
2026-03-04 01:13:20.176 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:20.176 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=false hmdStr=0.0100 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:20.185 [Info] [SMOOTHING] Disabled smoothing on 3 devices
2026-03-04 01:13:20.185 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:20.456 [DEBUG] [GameDetector] Timer poll #41
2026-03-04 01:13:20.456 [DEBUG] [GameDetector] performDetection() called at 01:13:20.456
2026-03-04 01:13:20.811 [DEBUG] [EVENTS] MouseButtonDown at (225,491) button=Left timestamp=1284
2026-03-04 01:13:20.812 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:20.911 [DEBUG] [EVENTS] MouseButtonUp at (224,483) button=Left timestamp=1292
2026-03-04 01:13:20.911 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:20.951 [DEBUG] [EVENTS] MouseButtonDown at (224,486) button=Left timestamp=1296
2026-03-04 01:13:20.952 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:21.151 [DEBUG] [EVENTS] MouseButtonUp at (221,500) button=Left timestamp=1310
2026-03-04 01:13:21.151 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:21.211 [DEBUG] [EVENTS] MouseButtonDown at (228,502) button=Left timestamp=1314
2026-03-04 01:13:21.211 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:21.311 [DEBUG] [EVENTS] MouseButtonUp at (230,510) button=Left timestamp=1321
2026-03-04 01:13:21.311 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.01 -> 0.0098 deviceIds=0(OpenVR) 
2026-03-04 01:13:21.316 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:21.371 [DEBUG] [EVENTS] MouseButtonDown at (241,505) button=Left timestamp=1327
2026-03-04 01:13:21.372 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:21.455 [DEBUG] [GameDetector] performDetection() called at 01:13:21.455
2026-03-04 01:13:21.551 [DEBUG] [EVENTS] MouseButtonUp at (244,494) button=Left timestamp=1340
2026-03-04 01:13:21.552 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0098 -> 0.0096 deviceIds=0(OpenVR) 
2026-03-04 01:13:21.560 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:21.571 [DEBUG] [EVENTS] MouseButtonDown at (245,495) button=Left timestamp=1343
2026-03-04 01:13:21.572 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:21.693 [DEBUG] [EVENTS] MouseButtonUp at (246,497) button=Left timestamp=1353
2026-03-04 01:13:21.694 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0096 -> 0.0094 deviceIds=0(OpenVR) 
2026-03-04 01:13:21.698 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:21.731 [DEBUG] [EVENTS] MouseButtonDown at (249,500) button=Left timestamp=1357
2026-03-04 01:13:21.731 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:21.871 [DEBUG] [EVENTS] MouseButtonUp at (244,504) button=Left timestamp=1366
2026-03-04 01:13:21.871 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:21.872 [DEBUG] [EVENTS] MouseButtonDown at (245,504) button=Left timestamp=1368
2026-03-04 01:13:21.872 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.032 [DEBUG] [EVENTS] MouseButtonUp at (241,509) button=Left timestamp=1380
2026-03-04 01:13:22.032 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0094 -> 0.0092 deviceIds=0(OpenVR) 
2026-03-04 01:13:22.039 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.071 [DEBUG] [EVENTS] MouseButtonDown at (242,511) button=Left timestamp=1385
2026-03-04 01:13:22.071 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.211 [DEBUG] [EVENTS] MouseButtonUp at (239,511) button=Left timestamp=1393
2026-03-04 01:13:22.212 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0092 -> 0.009 deviceIds=0(OpenVR) 
2026-03-04 01:13:22.216 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.272 [DEBUG] [EVENTS] MouseButtonDown at (233,513) button=Left timestamp=1397
2026-03-04 01:13:22.272 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.392 [DEBUG] [EVENTS] MouseButtonUp at (233,503) button=Left timestamp=1407
2026-03-04 01:13:22.392 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.009 -> 0.0088 deviceIds=0(OpenVR) 
2026-03-04 01:13:22.397 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.458 [DEBUG] [GameDetector] performDetection() called at 01:13:22.458
2026-03-04 01:13:22.504 [DEBUG] [EVENTS] MouseButtonDown at (232,503) button=Left timestamp=1413
2026-03-04 01:13:22.505 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.592 [DEBUG] [EVENTS] MouseButtonUp at (224,502) button=Left timestamp=1423
2026-03-04 01:13:22.592 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.651 [DEBUG] [EVENTS] MouseButtonDown at (228,498) button=Left timestamp=1428
2026-03-04 01:13:22.651 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.771 [DEBUG] [EVENTS] MouseButtonUp at (228,493) button=Left timestamp=1435
2026-03-04 01:13:22.771 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0088 -> 0.0086 deviceIds=0(OpenVR) 
2026-03-04 01:13:22.778 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.831 [DEBUG] [EVENTS] MouseButtonDown at (232,494) button=Left timestamp=1441
2026-03-04 01:13:22.831 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:22.951 [DEBUG] [EVENTS] MouseButtonUp at (230,488) button=Left timestamp=1448
2026-03-04 01:13:22.952 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0086 -> 0.0084 deviceIds=0(OpenVR) 
2026-03-04 01:13:22.956 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:22.991 [DEBUG] [EVENTS] MouseButtonDown at (230,488) button=Left timestamp=1451
2026-03-04 01:13:22.992 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:23.151 [DEBUG] [EVENTS] MouseButtonUp at (229,487) button=Left timestamp=1460
2026-03-04 01:13:23.151 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0084 -> 0.0082 deviceIds=0(OpenVR) 
2026-03-04 01:13:23.156 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:23.171 [DEBUG] [EVENTS] MouseButtonDown at (234,487) button=Left timestamp=1463
2026-03-04 01:13:23.171 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:23.311 [DEBUG] [EVENTS] MouseButtonUp at (235,492) button=Left timestamp=1472
2026-03-04 01:13:23.312 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0082 -> 0.008 deviceIds=0(OpenVR) 
2026-03-04 01:13:23.316 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:23.371 [DEBUG] [EVENTS] MouseButtonDown at (236,495) button=Left timestamp=1476
2026-03-04 01:13:23.371 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:23.455 [DEBUG] [GameDetector] performDetection() called at 01:13:23.455
2026-03-04 01:13:23.502 [DEBUG] [EVENTS] MouseButtonUp at (230,501) button=Left timestamp=1486
2026-03-04 01:13:23.502 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.008 -> 0.0078 deviceIds=0(OpenVR) 
2026-03-04 01:13:23.506 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:23.552 [DEBUG] [EVENTS] MouseButtonDown at (230,502) button=Left timestamp=1489
2026-03-04 01:13:23.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:23.691 [DEBUG] [EVENTS] MouseButtonUp at (235,507) button=Left timestamp=1498
2026-03-04 01:13:23.693 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0078 -> 0.0076 deviceIds=0(OpenVR) 
2026-03-04 01:13:23.697 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:23.731 [DEBUG] [EVENTS] MouseButtonDown at (236,507) button=Left timestamp=1501
2026-03-04 01:13:23.731 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:23.871 [DEBUG] [EVENTS] MouseButtonUp at (228,516) button=Left timestamp=1512
2026-03-04 01:13:23.872 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0076 -> 0.0074 deviceIds=0(OpenVR) 
2026-03-04 01:13:23.876 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:23.913 [DEBUG] [EVENTS] MouseButtonDown at (232,519) button=Left timestamp=1517
2026-03-04 01:13:23.913 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:24.071 [DEBUG] [EVENTS] MouseButtonUp at (230,521) button=Left timestamp=1526
2026-03-04 01:13:24.071 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:24.111 [DEBUG] [EVENTS] MouseButtonDown at (231,522) button=Left timestamp=1530
2026-03-04 01:13:24.111 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:24.251 [DEBUG] [EVENTS] MouseButtonUp at (233,520) button=Left timestamp=1537
2026-03-04 01:13:24.251 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:24.311 [DEBUG] [EVENTS] MouseButtonDown at (237,519) button=Left timestamp=1540
2026-03-04 01:13:24.311 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:24.431 [DEBUG] [EVENTS] MouseButtonUp at (232,511) button=Left timestamp=1551
2026-03-04 01:13:24.431 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:24.455 [DEBUG] [GameDetector] performDetection() called at 01:13:24.455
2026-03-04 01:13:24.503 [DEBUG] [EVENTS] MouseButtonDown at (233,511) button=Left timestamp=1553
2026-03-04 01:13:24.503 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:24.616 [DEBUG] [EVENTS] MouseButtonUp at (234,509) button=Left timestamp=1558
2026-03-04 01:13:24.617 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0074 -> 0.0072 deviceIds=0(OpenVR) 
2026-03-04 01:13:24.623 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:24.671 [DEBUG] [EVENTS] MouseButtonDown at (237,505) button=Left timestamp=1563
2026-03-04 01:13:24.672 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:24.832 [DEBUG] [EVENTS] MouseButtonUp at (227,504) button=Left timestamp=1576
2026-03-04 01:13:24.833 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0072 -> 0.007 deviceIds=0(OpenVR) 
2026-03-04 01:13:24.837 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:24.912 [DEBUG] [EVENTS] MouseButtonDown at (222,512) button=Left timestamp=1582
2026-03-04 01:13:24.913 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:25.032 [DEBUG] [EVENTS] MouseButtonUp at (228,511) button=Left timestamp=1591
2026-03-04 01:13:25.033 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.007 -> 0.0068 deviceIds=0(OpenVR) 
2026-03-04 01:13:25.036 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:25.071 [DEBUG] [EVENTS] MouseButtonDown at (225,512) button=Left timestamp=1594
2026-03-04 01:13:25.071 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:25.212 [DEBUG] [EVENTS] MouseButtonUp at (216,516) button=Left timestamp=1603
2026-03-04 01:13:25.212 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:25.271 [DEBUG] [EVENTS] MouseButtonDown at (220,515) button=Left timestamp=1608
2026-03-04 01:13:25.272 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:25.431 [DEBUG] [EVENTS] MouseButtonUp at (227,510) button=Left timestamp=1617
2026-03-04 01:13:25.432 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0068 -> 0.0066 deviceIds=0(OpenVR) 
2026-03-04 01:13:25.437 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:25.456 [DEBUG] [GameDetector] performDetection() called at 01:13:25.456
2026-03-04 01:13:25.506 [DEBUG] [EVENTS] MouseButtonDown at (227,510) button=Left timestamp=1620
2026-03-04 01:13:25.506 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:25.636 [DEBUG] [EVENTS] MouseButtonUp at (224,512) button=Left timestamp=1628
2026-03-04 01:13:25.636 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0066 -> 0.0064 deviceIds=0(OpenVR) 
2026-03-04 01:13:25.641 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:25.691 [DEBUG] [EVENTS] MouseButtonDown at (226,512) button=Left timestamp=1630
2026-03-04 01:13:25.692 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:25.832 [DEBUG] [EVENTS] MouseButtonUp at (226,511) button=Left timestamp=1640
2026-03-04 01:13:25.832 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0064 -> 0.0062 deviceIds=0(OpenVR) 
2026-03-04 01:13:25.837 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:25.911 [DEBUG] [EVENTS] MouseButtonDown at (230,512) button=Left timestamp=1645
2026-03-04 01:13:25.911 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:26.051 [DEBUG] [EVENTS] MouseButtonUp at (233,510) button=Left timestamp=1652
2026-03-04 01:13:26.051 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0062 -> 0.006 deviceIds=0(OpenVR) 
2026-03-04 01:13:26.056 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:26.091 [DEBUG] [EVENTS] MouseButtonDown at (233,509) button=Left timestamp=1654
2026-03-04 01:13:26.092 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:26.271 [DEBUG] [EVENTS] MouseButtonUp at (233,509) button=Left timestamp=1666
2026-03-04 01:13:26.271 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.006 -> 0.0058 deviceIds=0(OpenVR) 
2026-03-04 01:13:26.276 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:26.291 [DEBUG] [EVENTS] MouseButtonDown at (233,509) button=Left timestamp=1667
2026-03-04 01:13:26.291 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:26.456 [DEBUG] [GameDetector] performDetection() called at 01:13:26.456
2026-03-04 01:13:27.411 [DEBUG] [EVENTS] MouseButtonDown at (191,503) button=Left timestamp=1714
2026-03-04 01:13:27.411 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=true
2026-03-04 01:13:27.456 [DEBUG] [GameDetector] performDetection() called at 01:13:27.455
2026-03-04 01:13:27.553 [DEBUG] [EVENTS] MouseButtonUp at (201,499) button=Left timestamp=1724
2026-03-04 01:13:27.553 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=false
2026-03-04 01:13:27.593 [DEBUG] [EVENTS] MouseButtonDown at (207,499) button=Left timestamp=1728
2026-03-04 01:13:27.593 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:27.732 [DEBUG] [EVENTS] MouseButtonUp at (214,494) button=Left timestamp=1737
2026-03-04 01:13:27.732 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0058 -> 0.0056 deviceIds=0(OpenVR) 
2026-03-04 01:13:27.737 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:27.792 [DEBUG] [EVENTS] MouseButtonDown at (218,496) button=Left timestamp=1741
2026-03-04 01:13:27.792 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:27.932 [DEBUG] [EVENTS] MouseButtonUp at (222,494) button=Left timestamp=1748
2026-03-04 01:13:27.933 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0056 -> 0.0054 deviceIds=0(OpenVR) 
2026-03-04 01:13:27.936 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:27.972 [DEBUG] [EVENTS] MouseButtonDown at (226,494) button=Left timestamp=1751
2026-03-04 01:13:27.972 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:28.111 [DEBUG] [EVENTS] MouseButtonUp at (227,496) button=Left timestamp=1758
2026-03-04 01:13:28.111 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0054 -> 0.0052 deviceIds=0(OpenVR) 
2026-03-04 01:13:28.116 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:28.151 [DEBUG] [EVENTS] MouseButtonDown at (231,497) button=Left timestamp=1762
2026-03-04 01:13:28.152 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:28.456 [DEBUG] [GameDetector] performDetection() called at 01:13:28.456
2026-03-04 01:13:28.521 [DEBUG] [EVENTS] MouseButtonUp at (234,497) button=Left timestamp=1785
2026-03-04 01:13:28.522 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0052 -> 0.005 deviceIds=0(OpenVR) 
2026-03-04 01:13:28.526 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:28.526 [DEBUG] [EVENTS] MouseButtonDown at (237,497) button=Left timestamp=1788
2026-03-04 01:13:28.526 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:28.872 [DEBUG] [EVENTS] MouseButtonUp at (232,504) button=Left timestamp=1806
2026-03-04 01:13:28.873 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.005 -> 0.0048 deviceIds=0(OpenVR) 
2026-03-04 01:13:28.877 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:28.911 [DEBUG] [EVENTS] MouseButtonDown at (236,504) button=Left timestamp=1809
2026-03-04 01:13:28.911 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:29.071 [DEBUG] [EVENTS] MouseButtonUp at (237,505) button=Left timestamp=1816
2026-03-04 01:13:29.072 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0048 -> 0.0046 deviceIds=0(OpenVR) 
2026-03-04 01:13:29.076 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:29.111 [DEBUG] [EVENTS] MouseButtonDown at (240,506) button=Left timestamp=1820
2026-03-04 01:13:29.111 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:29.452 [DEBUG] [EVENTS] MouseButtonUp at (240,509) button=Left timestamp=1843
2026-03-04 01:13:29.452 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0046 -> 0.0044 deviceIds=0(OpenVR) 
2026-03-04 01:13:29.456 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:29.456 [DEBUG] [EVENTS] MouseButtonDown at (241,509) button=Left timestamp=1845
2026-03-04 01:13:29.457 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:29.457 [DEBUG] [GameDetector] performDetection() called at 01:13:29.457
2026-03-04 01:13:29.612 [DEBUG] [EVENTS] MouseButtonUp at (241,503) button=Left timestamp=1854
2026-03-04 01:13:29.613 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0044 -> 0.0042 deviceIds=0(OpenVR) 
2026-03-04 01:13:29.618 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:29.652 [DEBUG] [EVENTS] MouseButtonDown at (243,503) button=Left timestamp=1857
2026-03-04 01:13:29.652 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:30.457 [DEBUG] [GameDetector] Timer poll #51
2026-03-04 01:13:30.457 [DEBUG] [GameDetector] performDetection() called at 01:13:30.457
2026-03-04 01:13:30.991 [DEBUG] [EVENTS] MouseButtonDown at (235,483) button=Left timestamp=1918
2026-03-04 01:13:30.991 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=true
2026-03-04 01:13:31.111 [DEBUG] [EVENTS] MouseButtonUp at (236,478) button=Left timestamp=1927
2026-03-04 01:13:31.111 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=false
2026-03-04 01:13:31.172 [DEBUG] [EVENTS] MouseButtonDown at (233,476) button=Left timestamp=1932
2026-03-04 01:13:31.172 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:31.311 [DEBUG] [EVENTS] MouseButtonUp at (229,485) button=Left timestamp=1941
2026-03-04 01:13:31.311 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:31.332 [DEBUG] [EVENTS] MouseButtonDown at (228,490) button=Left timestamp=1945
2026-03-04 01:13:31.332 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:31.456 [DEBUG] [GameDetector] performDetection() called at 01:13:31.456
2026-03-04 01:13:31.507 [DEBUG] [EVENTS] MouseButtonUp at (229,502) button=Left timestamp=1954
2026-03-04 01:13:31.508 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:31.531 [DEBUG] [EVENTS] MouseButtonDown at (227,500) button=Left timestamp=1958
2026-03-04 01:13:31.531 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:31.632 [DEBUG] [EVENTS] MouseButtonUp at (225,497) button=Left timestamp=1964
2026-03-04 01:13:31.633 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0042 -> 0.004 deviceIds=0(OpenVR) 
2026-03-04 01:13:31.641 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:31.732 [DEBUG] [EVENTS] MouseButtonDown at (227,493) button=Left timestamp=1969
2026-03-04 01:13:31.732 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:31.831 [DEBUG] [EVENTS] MouseButtonUp at (227,497) button=Left timestamp=1978
2026-03-04 01:13:31.831 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.004 -> 0.0038 deviceIds=0(OpenVR) 
2026-03-04 01:13:31.836 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:31.912 [DEBUG] [EVENTS] MouseButtonDown at (226,497) button=Left timestamp=1982
2026-03-04 01:13:31.912 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.031 [DEBUG] [EVENTS] MouseButtonUp at (222,499) button=Left timestamp=1992
2026-03-04 01:13:32.031 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0038 -> 0.0036 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.036 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.071 [DEBUG] [EVENTS] MouseButtonDown at (227,500) button=Left timestamp=1996
2026-03-04 01:13:32.071 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.192 [DEBUG] [EVENTS] MouseButtonUp at (229,503) button=Left timestamp=2004
2026-03-04 01:13:32.192 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0036 -> 0.0034 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.197 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.271 [DEBUG] [EVENTS] MouseButtonDown at (227,504) button=Left timestamp=2010
2026-03-04 01:13:32.271 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.372 [DEBUG] [EVENTS] MouseButtonUp at (230,503) button=Left timestamp=2016
2026-03-04 01:13:32.372 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0034 -> 0.0032 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.378 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.432 [DEBUG] [EVENTS] MouseButtonDown at (231,503) button=Left timestamp=2020
2026-03-04 01:13:32.432 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.456 [DEBUG] [GameDetector] performDetection() called at 01:13:32.456
2026-03-04 01:13:32.552 [DEBUG] [EVENTS] MouseButtonUp at (230,502) button=Left timestamp=2027
2026-03-04 01:13:32.552 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0032 -> 0.003 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.557 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.592 [DEBUG] [EVENTS] MouseButtonDown at (233,501) button=Left timestamp=2031
2026-03-04 01:13:32.592 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.711 [DEBUG] [EVENTS] MouseButtonUp at (232,500) button=Left timestamp=2038
2026-03-04 01:13:32.711 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.003 -> 0.0028 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.716 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.751 [DEBUG] [EVENTS] MouseButtonDown at (238,498) button=Left timestamp=2041
2026-03-04 01:13:32.751 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:32.871 [DEBUG] [EVENTS] MouseButtonUp at (236,498) button=Left timestamp=2048
2026-03-04 01:13:32.871 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0028 -> 0.0026 deviceIds=0(OpenVR) 
2026-03-04 01:13:32.876 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:32.911 [DEBUG] [EVENTS] MouseButtonDown at (240,498) button=Left timestamp=2051
2026-03-04 01:13:32.911 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:33.051 [DEBUG] [EVENTS] MouseButtonUp at (243,499) button=Left timestamp=2058
2026-03-04 01:13:33.051 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0026 -> 0.0024 deviceIds=0(OpenVR) 
2026-03-04 01:13:33.056 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:33.191 [DEBUG] [EVENTS] MouseButtonDown at (241,497) button=Left timestamp=2065
2026-03-04 01:13:33.192 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:33.312 [DEBUG] [EVENTS] MouseButtonUp at (241,502) button=Left timestamp=2072
2026-03-04 01:13:33.312 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0024 -> 0.0022 deviceIds=0(OpenVR) 
2026-03-04 01:13:33.317 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:33.351 [DEBUG] [EVENTS] MouseButtonDown at (240,504) button=Left timestamp=2076
2026-03-04 01:13:33.351 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:33.456 [DEBUG] [GameDetector] performDetection() called at 01:13:33.456
2026-03-04 01:13:33.871 [DEBUG] [EVENTS] MouseButtonDown at (243,498) button=Left timestamp=2091
2026-03-04 01:13:33.872 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:33.992 [DEBUG] [EVENTS] MouseButtonUp at (237,501) button=Left timestamp=2097
2026-03-04 01:13:33.992 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0022 -> 0.002 deviceIds=0(OpenVR) 
2026-03-04 01:13:33.997 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:34.456 [DEBUG] [GameDetector] performDetection() called at 01:13:34.456
2026-03-04 01:13:34.791 [DEBUG] [EVENTS] MouseButtonDown at (160,292) button=Left timestamp=2140
2026-03-04 01:13:34.792 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:34.951 [DEBUG] [EVENTS] MouseButtonUp at (165,299) button=Left timestamp=2149
2026-03-04 01:13:34.951 [Info] [SMOOTHING] Smoothing ENABLED by user
2026-03-04 01:13:34.956 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:34.956 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=true hmdStr=0.0020 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:34.956 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:13:34.958 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:13:34.958 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:34.964 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:13:34.964 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:34.970 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:13:34.970 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:13:34.970 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:13:34.970 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:35.456 [DEBUG] [GameDetector] performDetection() called at 01:13:35.456
2026-03-04 01:13:35.832 [DEBUG] [EVENTS] MouseButtonDown at (174,307) button=Left timestamp=2170
2026-03-04 01:13:35.832 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:35.951 [DEBUG] [EVENTS] MouseButtonUp at (175,304) button=Left timestamp=2175
2026-03-04 01:13:35.951 [Info] [SMOOTHING] Smoothing DISABLED by user
2026-03-04 01:13:35.956 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:35.956 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=false hmdStr=0.0020 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:35.968 [Info] [SMOOTHING] Disabled smoothing on 3 devices
2026-03-04 01:13:35.968 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:36.391 [DEBUG] [EVENTS] MouseButtonDown at (216,463) button=Left timestamp=2204
2026-03-04 01:13:36.391 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:36.457 [DEBUG] [GameDetector] performDetection() called at 01:13:36.457
2026-03-04 01:13:36.503 [DEBUG] [EVENTS] MouseButtonUp at (211,472) button=Left timestamp=2213
2026-03-04 01:13:36.503 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:36.551 [DEBUG] [EVENTS] MouseButtonDown at (207,474) button=Left timestamp=2218
2026-03-04 01:13:36.551 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:36.692 [DEBUG] [EVENTS] MouseButtonUp at (202,488) button=Left timestamp=2229
2026-03-04 01:13:36.692 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:36.752 [DEBUG] [EVENTS] MouseButtonDown at (208,489) button=Left timestamp=2234
2026-03-04 01:13:36.752 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:36.912 [DEBUG] [EVENTS] MouseButtonUp at (219,493) button=Left timestamp=2245
2026-03-04 01:13:36.912 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.002 -> 0.0018 deviceIds=0(OpenVR) 
2026-03-04 01:13:36.917 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:36.951 [DEBUG] [EVENTS] MouseButtonDown at (219,498) button=Left timestamp=2250
2026-03-04 01:13:36.951 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:37.192 [DEBUG] [EVENTS] MouseButtonDown at (217,489) button=Left timestamp=2257
2026-03-04 01:13:37.192 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=true
2026-03-04 01:13:37.272 [DEBUG] [EVENTS] MouseButtonUp at (226,495) button=Left timestamp=2264
2026-03-04 01:13:37.272 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=false
2026-03-04 01:13:37.351 [DEBUG] [EVENTS] MouseButtonDown at (234,498) button=Left timestamp=2271
2026-03-04 01:13:37.351 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:37.456 [DEBUG] [GameDetector] performDetection() called at 01:13:37.456
2026-03-04 01:13:37.532 [DEBUG] [EVENTS] MouseButtonUp at (237,504) button=Left timestamp=2281
2026-03-04 01:13:37.532 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0018 -> 0.0016 deviceIds=0(OpenVR) 
2026-03-04 01:13:37.537 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:37.591 [DEBUG] [EVENTS] MouseButtonDown at (236,501) button=Left timestamp=2285
2026-03-04 01:13:37.592 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:37.732 [DEBUG] [EVENTS] MouseButtonUp at (234,496) button=Left timestamp=2291
2026-03-04 01:13:37.732 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0016 -> 0.0014 deviceIds=0(OpenVR) 
2026-03-04 01:13:37.736 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:37.811 [DEBUG] [EVENTS] MouseButtonDown at (235,496) button=Left timestamp=2296
2026-03-04 01:13:37.811 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:37.951 [DEBUG] [EVENTS] MouseButtonUp at (231,495) button=Left timestamp=2306
2026-03-04 01:13:37.952 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0014 -> 0.0012 deviceIds=0(OpenVR) 
2026-03-04 01:13:37.957 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:38.011 [DEBUG] [EVENTS] MouseButtonDown at (230,498) button=Left timestamp=2311
2026-03-04 01:13:38.012 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:38.151 [DEBUG] [EVENTS] MouseButtonUp at (233,496) button=Left timestamp=2319
2026-03-04 01:13:38.151 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0012 -> 0.001 deviceIds=0(OpenVR) 
2026-03-04 01:13:38.156 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:38.212 [DEBUG] [EVENTS] MouseButtonDown at (237,496) button=Left timestamp=2323
2026-03-04 01:13:38.213 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:38.352 [DEBUG] [EVENTS] MouseButtonUp at (236,497) button=Left timestamp=2331
2026-03-04 01:13:38.352 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.001 -> 0.000800002 deviceIds=0(OpenVR) 
2026-03-04 01:13:38.357 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:38.412 [DEBUG] [EVENTS] MouseButtonDown at (238,497) button=Left timestamp=2336
2026-03-04 01:13:38.412 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:38.456 [DEBUG] [GameDetector] performDetection() called at 01:13:38.456
2026-03-04 01:13:38.551 [DEBUG] [EVENTS] MouseButtonUp at (238,494) button=Left timestamp=2345
2026-03-04 01:13:38.553 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000800002 -> 0.000600002 deviceIds=0(OpenVR) 
2026-03-04 01:13:38.558 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:38.592 [DEBUG] [EVENTS] MouseButtonDown at (240,495) button=Left timestamp=2348
2026-03-04 01:13:38.593 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:38.732 [DEBUG] [EVENTS] MouseButtonUp at (238,499) button=Left timestamp=2357
2026-03-04 01:13:38.732 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000600002 -> 0.000400002 deviceIds=0(OpenVR) 
2026-03-04 01:13:38.736 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:38.771 [DEBUG] [EVENTS] MouseButtonDown at (239,499) button=Left timestamp=2359
2026-03-04 01:13:38.772 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:38.912 [DEBUG] [EVENTS] MouseButtonUp at (234,499) button=Left timestamp=2369
2026-03-04 01:13:38.912 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000400002 -> 0.000200002 deviceIds=0(OpenVR) 
2026-03-04 01:13:38.917 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:39.231 [DEBUG] [EVENTS] MouseButtonDown at (226,503) button=Left timestamp=2383
2026-03-04 01:13:39.231 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:39.311 [DEBUG] [EVENTS] MouseButtonUp at (226,503) button=Left timestamp=2384
2026-03-04 01:13:39.311 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000200002 -> 1.65387e-09 deviceIds=0(OpenVR) 
2026-03-04 01:13:39.316 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:39.455 [DEBUG] [GameDetector] performDetection() called at 01:13:39.455
2026-03-04 01:13:39.832 [DEBUG] [EVENTS] MouseButtonDown at (136,311) button=Left timestamp=2418
2026-03-04 01:13:39.832 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:39.972 [DEBUG] [EVENTS] MouseButtonUp at (137,311) button=Left timestamp=2427
2026-03-04 01:13:39.972 [Info] [SMOOTHING] Smoothing ENABLED by user
2026-03-04 01:13:39.977 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:39.977 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=true hmdStr=0.0000 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:39.977 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:13:39.979 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.000
2026-03-04 01:13:39.979 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:39.987 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:13:39.987 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:39.988 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:13:39.988 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:13:39.988 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:13:39.988 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:40.456 [DEBUG] [GameDetector] Timer poll #61
2026-03-04 01:13:40.456 [DEBUG] [GameDetector] performDetection() called at 01:13:40.456
2026-03-04 01:13:41.456 [DEBUG] [GameDetector] performDetection() called at 01:13:41.456
2026-03-04 01:13:41.751 [DEBUG] [EVENTS] MouseButtonDown at (152,301) button=Left timestamp=2512
2026-03-04 01:13:41.751 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:41.871 [DEBUG] [EVENTS] MouseButtonUp at (151,299) button=Left timestamp=2516
2026-03-04 01:13:41.871 [Info] [SMOOTHING] Smoothing DISABLED by user
2026-03-04 01:13:41.879 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:41.879 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=false hmdStr=0.0000 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:41.894 [Info] [SMOOTHING] Disabled smoothing on 3 devices
2026-03-04 01:13:41.894 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:42.457 [DEBUG] [GameDetector] performDetection() called at 01:13:42.457
2026-03-04 01:13:43.031 [DEBUG] [EVENTS] MouseButtonDown at (218,568) button=Left timestamp=2590
2026-03-04 01:13:43.031 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.112 [DEBUG] [EVENTS] MouseButtonUp at (223,572) button=Left timestamp=2596
2026-03-04 01:13:43.113 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.08 -> 0.0784 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.117 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:43.172 [DEBUG] [EVENTS] MouseButtonDown at (225,570) button=Left timestamp=2601
2026-03-04 01:13:43.172 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.291 [DEBUG] [EVENTS] MouseButtonUp at (229,566) button=Left timestamp=2610
2026-03-04 01:13:43.291 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0784 -> 0.0768 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.296 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:43.351 [DEBUG] [EVENTS] MouseButtonDown at (230,565) button=Left timestamp=2614
2026-03-04 01:13:43.351 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.431 [DEBUG] [EVENTS] MouseButtonUp at (229,567) button=Left timestamp=2620
2026-03-04 01:13:43.431 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0768 -> 0.0752 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.437 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:43.456 [DEBUG] [GameDetector] performDetection() called at 01:13:43.456
2026-03-04 01:13:43.500 [DEBUG] [EVENTS] MouseButtonDown at (232,568) button=Left timestamp=2624
2026-03-04 01:13:43.500 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.611 [DEBUG] [EVENTS] MouseButtonUp at (231,569) button=Left timestamp=2627
2026-03-04 01:13:43.612 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0752 -> 0.0736 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.616 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:43.692 [DEBUG] [EVENTS] MouseButtonDown at (228,571) button=Left timestamp=2632
2026-03-04 01:13:43.692 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.791 [DEBUG] [EVENTS] MouseButtonUp at (228,573) button=Left timestamp=2637
2026-03-04 01:13:43.791 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0736 -> 0.072 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.796 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:43.871 [DEBUG] [EVENTS] MouseButtonDown at (230,572) button=Left timestamp=2642
2026-03-04 01:13:43.871 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:43.951 [DEBUG] [EVENTS] MouseButtonUp at (222,573) button=Left timestamp=2649
2026-03-04 01:13:43.951 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.072 -> 0.0704 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:43.956 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.051 [DEBUG] [EVENTS] MouseButtonDown at (226,571) button=Left timestamp=2654
2026-03-04 01:13:44.051 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:44.112 [DEBUG] [EVENTS] MouseButtonUp at (229,570) button=Left timestamp=2659
2026-03-04 01:13:44.112 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0704 -> 0.0688 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:44.116 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.232 [DEBUG] [EVENTS] MouseButtonDown at (227,569) button=Left timestamp=2664
2026-03-04 01:13:44.232 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:44.292 [DEBUG] [EVENTS] MouseButtonUp at (227,569) button=Left timestamp=2667
2026-03-04 01:13:44.292 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0688 -> 0.0672 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:44.297 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.371 [DEBUG] [EVENTS] MouseButtonDown at (227,569) button=Left timestamp=2672
2026-03-04 01:13:44.372 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:44.431 [DEBUG] [EVENTS] MouseButtonUp at (228,569) button=Left timestamp=2674
2026-03-04 01:13:44.431 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0672 -> 0.0656 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:44.436 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.457 [DEBUG] [GameDetector] performDetection() called at 01:13:44.456
2026-03-04 01:13:44.512 [DEBUG] [EVENTS] MouseButtonDown at (227,570) button=Left timestamp=2678
2026-03-04 01:13:44.512 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:44.592 [DEBUG] [EVENTS] MouseButtonUp at (228,572) button=Left timestamp=2682
2026-03-04 01:13:44.593 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0656 -> 0.064 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:44.597 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.672 [DEBUG] [EVENTS] MouseButtonDown at (229,573) button=Left timestamp=2685
2026-03-04 01:13:44.673 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:44.731 [DEBUG] [EVENTS] MouseButtonUp at (227,574) button=Left timestamp=2689
2026-03-04 01:13:44.732 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.064 -> 0.0624 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:44.736 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:44.832 [DEBUG] [EVENTS] MouseButtonDown at (225,574) button=Left timestamp=2696
2026-03-04 01:13:44.832 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:45.152 [DEBUG] [EVENTS] MouseButtonDown at (229,569) button=Left timestamp=2704
2026-03-04 01:13:45.152 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:45.232 [DEBUG] [EVENTS] MouseButtonUp at (228,570) button=Left timestamp=2707
2026-03-04 01:13:45.232 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0624 -> 0.0608 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:45.236 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:45.455 [DEBUG] [GameDetector] performDetection() called at 01:13:45.455
2026-03-04 01:13:45.496 [DEBUG] [EVENTS] MouseButtonDown at (231,563) button=Left timestamp=2721
2026-03-04 01:13:45.496 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:45.532 [DEBUG] [EVENTS] MouseButtonUp at (227,565) button=Left timestamp=2726
2026-03-04 01:13:45.532 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0608 -> 0.0592 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:45.536 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:45.619 [DEBUG] [EVENTS] MouseButtonDown at (225,563) button=Left timestamp=2732
2026-03-04 01:13:45.619 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:45.691 [DEBUG] [EVENTS] MouseButtonUp at (227,564) button=Left timestamp=2736
2026-03-04 01:13:45.692 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0592 -> 0.0576 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:45.696 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:45.792 [DEBUG] [EVENTS] MouseButtonDown at (232,565) button=Left timestamp=2742
2026-03-04 01:13:45.792 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:45.871 [DEBUG] [EVENTS] MouseButtonUp at (229,565) button=Left timestamp=2747
2026-03-04 01:13:45.871 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0576 -> 0.056 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:45.876 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:45.952 [DEBUG] [EVENTS] MouseButtonDown at (228,564) button=Left timestamp=2751
2026-03-04 01:13:45.952 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:46.052 [DEBUG] [EVENTS] MouseButtonUp at (223,567) button=Left timestamp=2759
2026-03-04 01:13:46.052 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.056 -> 0.0544 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:46.056 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:46.131 [DEBUG] [EVENTS] MouseButtonDown at (228,567) button=Left timestamp=2765
2026-03-04 01:13:46.132 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:46.211 [DEBUG] [EVENTS] MouseButtonUp at (227,570) button=Left timestamp=2771
2026-03-04 01:13:46.211 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0544 -> 0.0528 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:46.216 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:46.272 [DEBUG] [EVENTS] MouseButtonDown at (228,571) button=Left timestamp=2775
2026-03-04 01:13:46.272 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:46.352 [DEBUG] [EVENTS] MouseButtonUp at (227,575) button=Left timestamp=2781
2026-03-04 01:13:46.352 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0528 -> 0.0512 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:46.357 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:46.455 [DEBUG] [GameDetector] performDetection() called at 01:13:46.455
2026-03-04 01:13:46.751 [DEBUG] [EVENTS] MouseButtonDown at (226,571) button=Left timestamp=2796
2026-03-04 01:13:46.751 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:46.831 [DEBUG] [EVENTS] MouseButtonUp at (227,573) button=Left timestamp=2800
2026-03-04 01:13:46.831 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0512 -> 0.0496 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:46.837 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:46.912 [DEBUG] [EVENTS] MouseButtonDown at (216,573) button=Left timestamp=2804
2026-03-04 01:13:46.912 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:46.992 [DEBUG] [EVENTS] MouseButtonUp at (214,574) button=Left timestamp=2810
2026-03-04 01:13:46.992 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0496 -> 0.048 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:13:46.996 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:47.456 [DEBUG] [GameDetector] performDetection() called at 01:13:47.456
2026-03-04 01:13:47.833 [DEBUG] [EVENTS] MouseButtonDown at (127,292) button=Left timestamp=2856
2026-03-04 01:13:47.833 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:47.951 [DEBUG] [EVENTS] MouseButtonUp at (125,308) button=Left timestamp=2865
2026-03-04 01:13:47.951 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:48.456 [DEBUG] [GameDetector] performDetection() called at 01:13:48.456
2026-03-04 01:13:49.331 [DEBUG] [EVENTS] MouseButtonDown at (168,296) button=Left timestamp=2952
2026-03-04 01:13:49.332 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:49.456 [DEBUG] [GameDetector] performDetection() called at 01:13:49.456
2026-03-04 01:13:49.499 [DEBUG] [EVENTS] MouseButtonUp at (171,302) button=Left timestamp=2962
2026-03-04 01:13:49.499 [Info] [SMOOTHING] Smoothing ENABLED by user
2026-03-04 01:13:49.503 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:49.503 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=true hmdStr=0.0000 ctrlStr=0.0480 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:49.503 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:13:49.506 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.000
2026-03-04 01:13:49.506 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:49.509 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:13:49.509 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:49.516 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:13:49.516 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:13:49.516 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:13:49.516 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:50.251 [DEBUG] [EVENTS] MouseButtonDown at (159,303) button=Left timestamp=2996
2026-03-04 01:13:50.251 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:50.391 [DEBUG] [EVENTS] MouseButtonUp at (159,296) button=Left timestamp=3005
2026-03-04 01:13:50.391 [Info] [SMOOTHING] Smoothing DISABLED by user
2026-03-04 01:13:50.396 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:50.396 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=false hmdStr=0.0000 ctrlStr=0.0480 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:50.406 [Info] [SMOOTHING] Disabled smoothing on 3 devices
2026-03-04 01:13:50.406 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:50.457 [DEBUG] [GameDetector] Timer poll #71
2026-03-04 01:13:50.457 [DEBUG] [GameDetector] performDetection() called at 01:13:50.457
2026-03-04 01:13:51.051 [DEBUG] [EVENTS] MouseButtonDown at (220,478) button=Left timestamp=3047
2026-03-04 01:13:51.052 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:51.191 [DEBUG] [EVENTS] MouseButtonUp at (221,480) button=Left timestamp=3058
2026-03-04 01:13:51.192 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 1.65387e-09 -> 0 deviceIds=0(OpenVR) 
2026-03-04 01:13:51.196 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:51.456 [DEBUG] [GameDetector] performDetection() called at 01:13:51.456
2026-03-04 01:13:51.791 [DEBUG] [EVENTS] MouseButtonDown at (141,276) button=Left timestamp=3093
2026-03-04 01:13:51.791 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:51.911 [DEBUG] [EVENTS] MouseButtonUp at (144,291) button=Left timestamp=3103
2026-03-04 01:13:51.911 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:52.455 [DEBUG] [GameDetector] performDetection() called at 01:13:52.455
2026-03-04 01:13:52.552 [DEBUG] [EVENTS] MouseButtonDown at (160,302) button=Left timestamp=3132
2026-03-04 01:13:52.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:13:52.692 [DEBUG] [EVENTS] MouseButtonUp at (165,306) button=Left timestamp=3140
2026-03-04 01:13:52.693 [Info] [SMOOTHING] Smoothing ENABLED by user
2026-03-04 01:13:52.699 [Info] [SMOOTHING] Applying smoothing state change to all devices...
2026-03-04 01:13:52.699 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='setSmoothingEnabled' enabled=true hmdStr=0.0000 ctrlStr=0.0480 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:13:52.699 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:13:52.707 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:13:52.707 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:52.710 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:13:52.710 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:13:52.712 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:13:52.712 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:13:52.712 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:13:52.712 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:13:53.455 [DEBUG] [GameDetector] performDetection() called at 01:13:53.455
2026-03-04 01:13:54.456 [DEBUG] [GameDetector] performDetection() called at 01:13:54.456
2026-03-04 01:13:55.456 [DEBUG] [GameDetector] performDetection() called at 01:13:55.456
2026-03-04 01:13:56.456 [DEBUG] [GameDetector] performDetection() called at 01:13:56.456
2026-03-04 01:13:57.457 [DEBUG] [GameDetector] performDetection() called at 01:13:57.457
2026-03-04 01:13:58.457 [DEBUG] [GameDetector] performDetection() called at 01:13:58.456
2026-03-04 01:13:59.455 [DEBUG] [GameDetector] performDetection() called at 01:13:59.455
2026-03-04 01:13:59.656 [INFO] Dashboard deactivated (system button) seq=2
2026-03-04 01:13:59.660 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:14:00.455 [DEBUG] [GameDetector] Timer poll #81
2026-03-04 01:14:00.455 [DEBUG] [GameDetector] performDetection() called at 01:14:00.455
2026-03-04 01:14:00.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:00.458 [INFO] GameDetector: ✅ NEW GAME DETECTED: contractors_showdown
2026-03-04 01:14:00.458 [INFO] GameDetector: Game config loaded successfully for contractors_showdown
2026-03-04 01:14:00.458 [INFO] GameDetector: Game detected → feeding state store: contractors_showdown
2026-03-04 01:14:00.458 [INFO] [GameStateStore] STATE CHANGE: activeGame '(none)' → 'contractors_showdown' (change #1)
2026-03-04 01:14:00.458 [INFO] [GameProfileController] onActiveGameChanged: '' → 'contractors_showdown'
2026-03-04 01:14:00.459 [INFO] [GameProfileController] Current game auto-calibration support: YES
2026-03-04 01:14:00.459 [INFO] [GameProfileController] Cleared equipped weapon in state store for new game session
2026-03-04 01:14:00.552 [INFO] [GameProfileController] Starting log monitoring for detected game
2026-03-04 01:14:00.552 [INFO] [GameProfileController] Log monitoring: path = %STEAMAPPS%\common\Contractors Showdown\Contractors_Showdown\ExfilZone\ExfilZone.log, parser rules = 1
2026-03-04 01:14:00.552 [INFO] [LogFileWatcher] startWatching called with path: %STEAMAPPS%\common\Contractors Showdown\Contractors_Showdown\ExfilZone\ExfilZone.log
2026-03-04 01:14:00.552 [INFO] [LogFileWatcher] Path resolved to: c:\program files (x86)\steam\steamapps\common\Contractors Showdown\Contractors_Showdown\ExfilZone\ExfilZone.log
2026-03-04 01:14:00.552 [INFO] [LogFileWatcher] File doesn't exist yet, will watch directory and wait for creation: c:\program files (x86)\steam\steamapps\common\Contractors Showdown\Contractors_Showdown\ExfilZone\ExfilZone.log
2026-03-04 01:14:00.554 [INFO] [LogFileWatcher] Watching directory for file creation: C:/program files (x86)/steam/steamapps/common/Contractors Showdown/Contractors_Showdown/ExfilZone
2026-03-04 01:14:00.554 [INFO] [GameStateStore] STATE CHANGE: logMonitoring STARTED (game: contractors_showdown)
2026-03-04 01:14:00.554 [WARNING] [GameProfileController] Log file doesn't exist yet
2026-03-04 01:14:00.554 [INFO] ╔══════════════════════════════════════════════════╗
2026-03-04 01:14:00.554 [INFO] ║ GAME STATE STORE — SNAPSHOT ║
2026-03-04 01:14:00.554 [INFO] ╠══════════════════════════════════════════════════╣
2026-03-04 01:14:00.554 [INFO] ║ activeGame: contractors_showdown
2026-03-04 01:14:00.554 [INFO] ║ equippedWeapon: (none)
2026-03-04 01:14:00.554 [INFO] ║ activeProfile: (none)
2026-03-04 01:14:00.554 [INFO] ║ gameRunning: false
2026-03-04 01:14:00.554 [INFO] ║ logMonitoring: ACTIVE
2026-03-04 01:14:00.554 [INFO] ║ stateChanges: 1
2026-03-04 01:14:00.554 [INFO] ║ lastGameChange: 01:14:00.458
2026-03-04 01:14:00.554 [INFO] ╚══════════════════════════════════════════════════╝
2026-03-04 01:14:00.554 [INFO] [GameStateStore] STATE CHANGE: gameRunning false → true (game: contractors_showdown)
2026-03-04 01:14:00.554 [INFO] [GameProfileController] onGameRunningChanged: RUNNING
2026-03-04 01:14:00.554 [Info] [SMOOTHING] Game detected: 'contractors_showdown'
2026-03-04 01:14:00.554 [Info] [SMOOTHING] Resolver: falling back to Global (baseline)
2026-03-04 01:14:00.559 [INFO] [SMOOTHING] [SMOOTHING_APPLY] caller='applyStartupProfile(Global)' enabled=true hmdStr=0.0100 ctrlStr=0.0800 minCutoff=5.000 beta=2.500 dCutoff=2.000
2026-03-04 01:14:00.559 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:14:00.565 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.010
2026-03-04 01:14:00.565 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:00.570 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:14:00.570 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:00.575 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:14:00.575 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:14:00.575 [Info] [SMOOTHING] Applied smoothing to all tracked devices
2026-03-04 01:14:00.575 [INFO] GameDetector: ✅ Emitted gameDetected signal for: contractors_showdown
2026-03-04 01:14:01.052 [INFO] Dashboard activated (system button) seq=3
2026-03-04 01:14:01.052 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:14:01.256 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:14:01.257 [INFO] Device refresh after dashboard activation
2026-03-04 01:14:01.456 [DEBUG] [GameDetector] performDetection() called at 01:14:01.456
2026-03-04 01:14:01.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:02.456 [DEBUG] [GameDetector] performDetection() called at 01:14:02.456
2026-03-04 01:14:02.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:03.455 [DEBUG] [GameDetector] performDetection() called at 01:14:03.455
2026-03-04 01:14:03.457 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:04.455 [DEBUG] [GameDetector] performDetection() called at 01:14:04.455
2026-03-04 01:14:04.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:05.457 [DEBUG] [GameDetector] performDetection() called at 01:14:05.457
2026-03-04 01:14:05.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:06.455 [DEBUG] [GameDetector] performDetection() called at 01:14:06.455
2026-03-04 01:14:06.457 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:07.455 [DEBUG] [GameDetector] performDetection() called at 01:14:07.455
2026-03-04 01:14:07.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:08.351 [DEBUG] [EVENTS] MouseButtonDown at (229,501) button=Left timestamp=3470
2026-03-04 01:14:08.351 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:08.432 [DEBUG] [EVENTS] MouseButtonUp at (228,504) button=Left timestamp=3475
2026-03-04 01:14:08.432 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.01 -> 0.0098 deviceIds=0(OpenVR) 
2026-03-04 01:14:08.436 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:08.439 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.010
2026-03-04 01:14:08.439 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:08.456 [DEBUG] [GameDetector] performDetection() called at 01:14:08.456
2026-03-04 01:14:08.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:08.512 [DEBUG] [EVENTS] MouseButtonDown at (229,505) button=Left timestamp=3478
2026-03-04 01:14:08.512 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:08.612 [DEBUG] [EVENTS] MouseButtonUp at (229,505) button=Left timestamp=3479
2026-03-04 01:14:08.613 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0098 -> 0.0096 deviceIds=0(OpenVR) 
2026-03-04 01:14:08.618 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:08.623 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.010
2026-03-04 01:14:08.623 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:08.695 [DEBUG] [EVENTS] MouseButtonDown at (232,506) button=Left timestamp=3483
2026-03-04 01:14:08.695 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:08.791 [DEBUG] [EVENTS] MouseButtonUp at (235,505) button=Left timestamp=3488
2026-03-04 01:14:08.791 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0096 -> 0.0094 deviceIds=0(OpenVR) 
2026-03-04 01:14:08.796 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:08.802 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.009
2026-03-04 01:14:08.802 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:08.871 [DEBUG] [EVENTS] MouseButtonDown at (235,505) button=Left timestamp=3489
2026-03-04 01:14:08.871 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:08.951 [DEBUG] [EVENTS] MouseButtonUp at (235,505) button=Left timestamp=3490
2026-03-04 01:14:08.951 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0094 -> 0.0092 deviceIds=0(OpenVR) 
2026-03-04 01:14:08.957 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:08.963 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.009
2026-03-04 01:14:08.963 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.052 [DEBUG] [EVENTS] MouseButtonDown at (234,504) button=Left timestamp=3493
2026-03-04 01:14:09.052 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:09.131 [DEBUG] [EVENTS] MouseButtonUp at (233,503) button=Left timestamp=3496
2026-03-04 01:14:09.132 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0092 -> 0.009 deviceIds=0(OpenVR) 
2026-03-04 01:14:09.136 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:09.139 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.009
2026-03-04 01:14:09.139 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.231 [DEBUG] [EVENTS] MouseButtonDown at (231,503) button=Left timestamp=3499
2026-03-04 01:14:09.231 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:09.331 [DEBUG] [EVENTS] MouseButtonUp at (228,501) button=Left timestamp=3504
2026-03-04 01:14:09.332 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.009 -> 0.0088 deviceIds=0(OpenVR) 
2026-03-04 01:14:09.336 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:09.344 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.009
2026-03-04 01:14:09.344 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.392 [DEBUG] [EVENTS] MouseButtonDown at (228,501) button=Left timestamp=3505
2026-03-04 01:14:09.392 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:09.455 [DEBUG] [GameDetector] performDetection() called at 01:14:09.455
2026-03-04 01:14:09.457 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:09.511 [DEBUG] [EVENTS] MouseButtonUp at (228,500) button=Left timestamp=3507
2026-03-04 01:14:09.511 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0088 -> 0.0086 deviceIds=0(OpenVR) 
2026-03-04 01:14:09.517 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:09.519 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.009
2026-03-04 01:14:09.519 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.591 [DEBUG] [EVENTS] MouseButtonDown at (228,500) button=Left timestamp=3508
2026-03-04 01:14:09.593 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:09.692 [DEBUG] [EVENTS] MouseButtonUp at (228,500) button=Left timestamp=3509
2026-03-04 01:14:09.692 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0086 -> 0.0084 deviceIds=0(OpenVR) 
2026-03-04 01:14:09.697 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:09.702 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.008
2026-03-04 01:14:09.702 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.771 [DEBUG] [EVENTS] MouseButtonDown at (228,501) button=Left timestamp=3511
2026-03-04 01:14:09.772 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:09.871 [DEBUG] [EVENTS] MouseButtonUp at (228,501) button=Left timestamp=3512
2026-03-04 01:14:09.872 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0084 -> 0.0082 deviceIds=0(OpenVR) 
2026-03-04 01:14:09.876 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:09.879 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.008
2026-03-04 01:14:09.879 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:09.952 [DEBUG] [EVENTS] MouseButtonDown at (229,501) button=Left timestamp=3514
2026-03-04 01:14:09.952 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.051 [DEBUG] [EVENTS] MouseButtonUp at (230,503) button=Left timestamp=3518
2026-03-04 01:14:10.051 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0082 -> 0.008 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.058 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.062 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.008
2026-03-04 01:14:10.062 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:10.111 [DEBUG] [EVENTS] MouseButtonDown at (230,504) button=Left timestamp=3520
2026-03-04 01:14:10.111 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.232 [DEBUG] [EVENTS] MouseButtonUp at (229,505) button=Left timestamp=3523
2026-03-04 01:14:10.233 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.008 -> 0.0078 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.237 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.239 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.008
2026-03-04 01:14:10.239 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:10.311 [DEBUG] [EVENTS] MouseButtonDown at (228,506) button=Left timestamp=3526
2026-03-04 01:14:10.311 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.411 [DEBUG] [EVENTS] MouseButtonUp at (229,507) button=Left timestamp=3529
2026-03-04 01:14:10.411 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0078 -> 0.0076 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.415 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.418 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.008
2026-03-04 01:14:10.418 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:10.456 [DEBUG] [GameDetector] Timer poll #91
2026-03-04 01:14:10.456 [DEBUG] [GameDetector] performDetection() called at 01:14:10.456
2026-03-04 01:14:10.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:10.492 [DEBUG] [EVENTS] MouseButtonDown at (229,508) button=Left timestamp=3531
2026-03-04 01:14:10.492 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.593 [DEBUG] [EVENTS] MouseButtonUp at (230,510) button=Left timestamp=3534
2026-03-04 01:14:10.593 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0076 -> 0.0074 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.598 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.602 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.007
2026-03-04 01:14:10.602 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:10.672 [DEBUG] [EVENTS] MouseButtonDown at (231,510) button=Left timestamp=3536
2026-03-04 01:14:10.672 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.771 [DEBUG] [EVENTS] MouseButtonUp at (231,510) button=Left timestamp=3537
2026-03-04 01:14:10.772 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0074 -> 0.0072 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.776 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.780 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.007
2026-03-04 01:14:10.780 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:10.851 [DEBUG] [EVENTS] MouseButtonDown at (231,511) button=Left timestamp=3539
2026-03-04 01:14:10.851 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:10.951 [DEBUG] [EVENTS] MouseButtonUp at (231,510) button=Left timestamp=3541
2026-03-04 01:14:10.951 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0072 -> 0.007 deviceIds=0(OpenVR) 
2026-03-04 01:14:10.956 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:10.964 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.007
2026-03-04 01:14:10.964 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.032 [DEBUG] [EVENTS] MouseButtonDown at (231,510) button=Left timestamp=3542
2026-03-04 01:14:11.032 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:11.131 [DEBUG] [EVENTS] MouseButtonUp at (229,510) button=Left timestamp=3545
2026-03-04 01:14:11.131 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.007 -> 0.0068 deviceIds=0(OpenVR) 
2026-03-04 01:14:11.135 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:11.138 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.007
2026-03-04 01:14:11.138 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.211 [DEBUG] [EVENTS] MouseButtonDown at (227,510) button=Left timestamp=3548
2026-03-04 01:14:11.211 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:11.311 [DEBUG] [EVENTS] MouseButtonUp at (226,510) button=Left timestamp=3550
2026-03-04 01:14:11.311 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0068 -> 0.0066 deviceIds=0(OpenVR) 
2026-03-04 01:14:11.315 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:11.317 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.007
2026-03-04 01:14:11.317 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.391 [DEBUG] [EVENTS] MouseButtonDown at (225,510) button=Left timestamp=3552
2026-03-04 01:14:11.391 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:11.456 [DEBUG] [GameDetector] performDetection() called at 01:14:11.456
2026-03-04 01:14:11.458 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:11.471 [DEBUG] [EVENTS] MouseButtonUp at (225,510) button=Left timestamp=3553
2026-03-04 01:14:11.471 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0066 -> 0.0064 deviceIds=0(OpenVR) 
2026-03-04 01:14:11.477 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:11.479 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.006
2026-03-04 01:14:11.479 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.571 [DEBUG] [EVENTS] MouseButtonDown at (226,510) button=Left timestamp=3555
2026-03-04 01:14:11.571 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:11.672 [DEBUG] [EVENTS] MouseButtonUp at (227,509) button=Left timestamp=3558
2026-03-04 01:14:11.674 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0064 -> 0.0062 deviceIds=0(OpenVR) 
2026-03-04 01:14:11.679 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:11.682 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.006
2026-03-04 01:14:11.682 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.752 [DEBUG] [EVENTS] MouseButtonDown at (228,509) button=Left timestamp=3560
2026-03-04 01:14:11.752 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:11.831 [DEBUG] [EVENTS] MouseButtonUp at (228,508) button=Left timestamp=3562
2026-03-04 01:14:11.831 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0062 -> 0.006 deviceIds=0(OpenVR) 
2026-03-04 01:14:11.836 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:11.844 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.006
2026-03-04 01:14:11.844 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:11.931 [DEBUG] [EVENTS] MouseButtonDown at (226,508) button=Left timestamp=3565
2026-03-04 01:14:11.931 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.032 [DEBUG] [EVENTS] MouseButtonUp at (226,507) button=Left timestamp=3567
2026-03-04 01:14:12.032 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.006 -> 0.0058 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.039 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:12.044 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.006
2026-03-04 01:14:12.044 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:12.112 [DEBUG] [EVENTS] MouseButtonDown at (228,507) button=Left timestamp=3570
2026-03-04 01:14:12.112 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.212 [DEBUG] [EVENTS] MouseButtonUp at (231,506) button=Left timestamp=3574
2026-03-04 01:14:12.212 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0058 -> 0.0056 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.217 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:12.220 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.006
2026-03-04 01:14:12.220 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:12.311 [DEBUG] [EVENTS] MouseButtonDown at (232,505) button=Left timestamp=3577
2026-03-04 01:14:12.311 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.411 [DEBUG] [EVENTS] MouseButtonUp at (232,505) button=Left timestamp=3578
2026-03-04 01:14:12.412 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0056 -> 0.0054 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.415 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:12.419 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.005
2026-03-04 01:14:12.419 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:12.458 [DEBUG] [GameDetector] performDetection() called at 01:14:12.458
2026-03-04 01:14:12.460 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:12.511 [DEBUG] [EVENTS] MouseButtonDown at (232,504) button=Left timestamp=3580
2026-03-04 01:14:12.511 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.591 [DEBUG] [EVENTS] MouseButtonUp at (231,504) button=Left timestamp=3582
2026-03-04 01:14:12.592 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0054 -> 0.0052 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.595 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:12.602 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.005
2026-03-04 01:14:12.602 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:12.674 [DEBUG] [EVENTS] MouseButtonDown at (228,505) button=Left timestamp=3587
2026-03-04 01:14:12.674 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.812 [DEBUG] [EVENTS] MouseButtonUp at (227,506) button=Left timestamp=3590
2026-03-04 01:14:12.812 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0052 -> 0.005 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.818 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:12.823 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.005
2026-03-04 01:14:12.823 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:12.871 [DEBUG] [EVENTS] MouseButtonDown at (226,507) button=Left timestamp=3593
2026-03-04 01:14:12.871 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:12.992 [DEBUG] [EVENTS] MouseButtonUp at (224,505) button=Left timestamp=3597
2026-03-04 01:14:12.992 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.005 -> 0.0048 deviceIds=0(OpenVR) 
2026-03-04 01:14:12.997 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.001 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.005
2026-03-04 01:14:13.001 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:13.091 [DEBUG] [EVENTS] MouseButtonDown at (225,504) button=Left timestamp=3602
2026-03-04 01:14:13.092 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:13.192 [DEBUG] [EVENTS] MouseButtonUp at (227,504) button=Left timestamp=3605
2026-03-04 01:14:13.192 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0048 -> 0.0046 deviceIds=0(OpenVR) 
2026-03-04 01:14:13.196 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.200 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.005
2026-03-04 01:14:13.200 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:13.272 [DEBUG] [EVENTS] MouseButtonDown at (228,503) button=Left timestamp=3608
2026-03-04 01:14:13.272 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:13.371 [DEBUG] [EVENTS] MouseButtonUp at (228,502) button=Left timestamp=3610
2026-03-04 01:14:13.371 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0046 -> 0.0044 deviceIds=0(OpenVR) 
2026-03-04 01:14:13.375 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.378 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.004
2026-03-04 01:14:13.378 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:13.455 [DEBUG] [GameDetector] performDetection() called at 01:14:13.455
2026-03-04 01:14:13.457 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:13.471 [DEBUG] [EVENTS] MouseButtonDown at (228,501) button=Left timestamp=3612
2026-03-04 01:14:13.472 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:13.564 [DEBUG] [EVENTS] MouseButtonUp at (227,500) button=Left timestamp=3615
2026-03-04 01:14:13.565 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0044 -> 0.0042 deviceIds=0(OpenVR) 
2026-03-04 01:14:13.570 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.575 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.004
2026-03-04 01:14:13.575 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:13.655 [DEBUG] [EVENTS] MouseButtonDown at (226,499) button=Left timestamp=3618
2026-03-04 01:14:13.656 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:13.753 [DEBUG] [EVENTS] MouseButtonUp at (227,498) button=Left timestamp=3621
2026-03-04 01:14:13.753 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0042 -> 0.004 deviceIds=0(OpenVR) 
2026-03-04 01:14:13.757 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.763 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.004
2026-03-04 01:14:13.763 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:13.851 [DEBUG] [EVENTS] MouseButtonDown at (227,496) button=Left timestamp=3624
2026-03-04 01:14:13.852 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:13.952 [DEBUG] [EVENTS] MouseButtonUp at (227,495) button=Left timestamp=3626
2026-03-04 01:14:13.952 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.004 -> 0.0038 deviceIds=0(OpenVR) 
2026-03-04 01:14:13.956 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:13.961 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.004
2026-03-04 01:14:13.961 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:14.031 [DEBUG] [EVENTS] MouseButtonDown at (226,494) button=Left timestamp=3629
2026-03-04 01:14:14.031 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:14.131 [DEBUG] [EVENTS] MouseButtonUp at (225,493) button=Left timestamp=3632
2026-03-04 01:14:14.132 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0038 -> 0.0036 deviceIds=0(OpenVR) 
2026-03-04 01:14:14.136 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:14.139 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.004
2026-03-04 01:14:14.139 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:14.231 [DEBUG] [EVENTS] MouseButtonDown at (225,493) button=Left timestamp=3633
2026-03-04 01:14:14.232 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:14.331 [DEBUG] [EVENTS] MouseButtonUp at (226,492) button=Left timestamp=3635
2026-03-04 01:14:14.331 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0036 -> 0.0034 deviceIds=0(OpenVR) 
2026-03-04 01:14:14.336 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:14.339 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.003
2026-03-04 01:14:14.339 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:14.432 [DEBUG] [EVENTS] MouseButtonDown at (226,492) button=Left timestamp=3636
2026-03-04 01:14:14.432 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:14.458 [DEBUG] [GameDetector] performDetection() called at 01:14:14.458
2026-03-04 01:14:14.461 [INFO] GameDetector: Game detected via Steam logs: contractors_showdown
2026-03-04 01:14:14.511 [DEBUG] [EVENTS] MouseButtonUp at (226,492) button=Left timestamp=3637
2026-03-04 01:14:14.511 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0034 -> 0.0032 deviceIds=0(OpenVR) 
2026-03-04 01:14:14.516 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:14.520 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.003
2026-03-04 01:14:14.520 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:14.652 [DEBUG] [EVENTS] MouseButtonDown at (226,492) button=Left timestamp=3638
2026-03-04 01:14:14.653 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:14.714 [DEBUG] [EVENTS] MouseButtonUp at (225,491) button=Left timestamp=3641
2026-03-04 01:14:14.715 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0032 -> 0.003 deviceIds=0(OpenVR) 
2026-03-04 01:14:14.720 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:14.724 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.003
2026-03-04 01:14:14.724 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:14.851 [DEBUG] [EVENTS] MouseButtonDown at (224,491) button=Left timestamp=3643
2026-03-04 01:14:14.851 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:14.912 [DEBUG] [EVENTS] MouseButtonUp at (224,491) button=Left timestamp=3644
2026-03-04 01:14:14.912 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.003 -> 0.0028 deviceIds=0(OpenVR) 
2026-03-04 01:14:14.917 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:14.921 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.003
2026-03-04 01:14:14.921 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.012 [DEBUG] [EVENTS] MouseButtonDown at (224,492) button=Left timestamp=3646
2026-03-04 01:14:15.013 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:15.071 [DEBUG] [EVENTS] MouseButtonUp at (224,494) button=Left timestamp=3649
2026-03-04 01:14:15.071 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0028 -> 0.0026 deviceIds=0(OpenVR) 
2026-03-04 01:14:15.077 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:15.081 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.003
2026-03-04 01:14:15.081 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.172 [DEBUG] [EVENTS] MouseButtonDown at (224,495) button=Left timestamp=3651
2026-03-04 01:14:15.173 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:15.272 [DEBUG] [EVENTS] MouseButtonUp at (221,496) button=Left timestamp=3655
2026-03-04 01:14:15.272 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0026 -> 0.0024 deviceIds=0(OpenVR) 
2026-03-04 01:14:15.276 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:15.279 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:14:15.279 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.372 [DEBUG] [EVENTS] MouseButtonDown at (215,497) button=Left timestamp=3661
2026-03-04 01:14:15.372 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:15.456 [DEBUG] [GameDetector] performDetection() called at 01:14:15.456
2026-03-04 01:14:15.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:15.471 [DEBUG] [EVENTS] MouseButtonUp at (214,499) button=Left timestamp=3664
2026-03-04 01:14:15.471 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0024 -> 0.0022 deviceIds=0(OpenVR) 
2026-03-04 01:14:15.477 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:15.482 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:14:15.482 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.553 [DEBUG] [EVENTS] MouseButtonDown at (214,502) button=Left timestamp=3668
2026-03-04 01:14:15.554 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:15.652 [DEBUG] [EVENTS] MouseButtonUp at (217,504) button=Left timestamp=3673
2026-03-04 01:14:15.652 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0022 -> 0.002 deviceIds=0(OpenVR) 
2026-03-04 01:14:15.657 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:15.663 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:14:15.663 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.731 [DEBUG] [EVENTS] MouseButtonDown at (219,505) button=Left timestamp=3676
2026-03-04 01:14:15.731 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:15.831 [DEBUG] [EVENTS] MouseButtonUp at (221,507) button=Left timestamp=3680
2026-03-04 01:14:15.831 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.002 -> 0.0018 deviceIds=0(OpenVR) 
2026-03-04 01:14:15.836 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:15.838 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:14:15.838 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:15.911 [DEBUG] [EVENTS] MouseButtonDown at (223,509) button=Left timestamp=3684
2026-03-04 01:14:15.912 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.012 [DEBUG] [EVENTS] MouseButtonUp at (225,510) button=Left timestamp=3688
2026-03-04 01:14:16.012 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0018 -> 0.0016 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.016 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.018 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.002
2026-03-04 01:14:16.018 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.112 [DEBUG] [EVENTS] MouseButtonDown at (228,513) button=Left timestamp=3694
2026-03-04 01:14:16.112 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.192 [DEBUG] [EVENTS] MouseButtonUp at (230,515) button=Left timestamp=3697
2026-03-04 01:14:16.193 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0016 -> 0.0014 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.196 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.202 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.001
2026-03-04 01:14:16.202 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.271 [DEBUG] [EVENTS] MouseButtonDown at (231,516) button=Left timestamp=3700
2026-03-04 01:14:16.271 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.371 [DEBUG] [EVENTS] MouseButtonUp at (231,516) button=Left timestamp=3701
2026-03-04 01:14:16.371 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0014 -> 0.0012 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.376 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.378 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.001
2026-03-04 01:14:16.378 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.451 [DEBUG] [EVENTS] MouseButtonDown at (232,516) button=Left timestamp=3703
2026-03-04 01:14:16.452 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.456 [DEBUG] [GameDetector] performDetection() called at 01:14:16.456
2026-03-04 01:14:16.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:16.551 [DEBUG] [EVENTS] MouseButtonUp at (232,516) button=Left timestamp=3706
2026-03-04 01:14:16.551 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.0012 -> 0.001 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.556 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.560 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.001
2026-03-04 01:14:16.560 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.657 [DEBUG] [EVENTS] MouseButtonDown at (233,513) button=Left timestamp=3711
2026-03-04 01:14:16.658 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.733 [DEBUG] [EVENTS] MouseButtonUp at (232,510) button=Left timestamp=3715
2026-03-04 01:14:16.733 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.001 -> 0.000800002 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.739 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.742 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.001
2026-03-04 01:14:16.742 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.891 [DEBUG] [EVENTS] MouseButtonDown at (230,506) button=Left timestamp=3721
2026-03-04 01:14:16.891 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:16.952 [DEBUG] [EVENTS] MouseButtonUp at (230,505) button=Left timestamp=3723
2026-03-04 01:14:16.952 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000800002 -> 0.000600002 deviceIds=0(OpenVR) 
2026-03-04 01:14:16.957 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:16.963 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.001
2026-03-04 01:14:16.963 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:16.992 [DEBUG] [EVENTS] MouseButtonDown at (229,505) button=Left timestamp=3725
2026-03-04 01:14:16.992 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:17.071 [DEBUG] [EVENTS] MouseButtonUp at (229,504) button=Left timestamp=3727
2026-03-04 01:14:17.071 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000600002 -> 0.000400002 deviceIds=0(OpenVR) 
2026-03-04 01:14:17.076 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:17.078 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.000
2026-03-04 01:14:17.078 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:17.192 [DEBUG] [EVENTS] MouseButtonDown at (228,503) button=Left timestamp=3730
2026-03-04 01:14:17.192 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:17.292 [DEBUG] [EVENTS] MouseButtonUp at (227,503) button=Left timestamp=3732
2026-03-04 01:14:17.292 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000400002 -> 0.000200002 deviceIds=0(OpenVR) 
2026-03-04 01:14:17.296 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:17.301 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.000
2026-03-04 01:14:17.301 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:17.456 [DEBUG] [GameDetector] performDetection() called at 01:14:17.456
2026-03-04 01:14:17.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:17.532 [DEBUG] [EVENTS] MouseButtonDown at (227,504) button=Left timestamp=3736
2026-03-04 01:14:17.532 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:17.651 [DEBUG] [EVENTS] MouseButtonUp at (227,504) button=Left timestamp=3737
2026-03-04 01:14:17.652 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 0.000200002 -> 1.65387e-09 deviceIds=0(OpenVR) 
2026-03-04 01:14:17.656 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:17.662 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=true strength=0.000
2026-03-04 01:14:17.662 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:18.455 [DEBUG] [GameDetector] performDetection() called at 01:14:18.455
2026-03-04 01:14:18.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:18.531 [DEBUG] [EVENTS] MouseButtonDown at (226,509) button=Left timestamp=3768
2026-03-04 01:14:18.531 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:18.653 [DEBUG] [EVENTS] MouseButtonUp at (226,508) button=Left timestamp=3772
2026-03-04 01:14:18.653 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: HMD 1.65387e-09 -> 0 deviceIds=0(OpenVR) 
2026-03-04 01:14:18.660 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:14:18.664 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:14:18.664 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:19.170 [INFO] [LogFileWatcher] Target file created, switching to file watch: c:\program files (x86)\steam\steamapps\common\Contractors Showdown\Contractors_Showdown\ExfilZone\ExfilZone.log
2026-03-04 01:14:19.173 [INFO] [LogFileWatcher] Now watching file (size=44 bytes)
2026-03-04 01:14:19.173 [INFO] [LogFileWatcher] Emitting initial file content (43 bytes)
2026-03-04 01:14:19.173 [INFO] [LogParser] parseLogContent called with 43 bytes, 1 rules
2026-03-04 01:14:19.456 [DEBUG] [GameDetector] performDetection() called at 01:14:19.456
2026-03-04 01:14:19.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:20.151 [DEBUG] [EVENTS] MouseButtonDown at (496,145) button=Left timestamp=3846
2026-03-04 01:14:20.151 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:20.291 [DEBUG] [EVENTS] MouseButtonUp at (481,140) button=Left timestamp=3858
2026-03-04 01:14:20.291 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:20.455 [DEBUG] [GameDetector] Timer poll #101
2026-03-04 01:14:20.455 [DEBUG] [GameDetector] performDetection() called at 01:14:20.455
2026-03-04 01:14:20.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:21.459 [DEBUG] [GameDetector] performDetection() called at 01:14:21.459
2026-03-04 01:14:21.459 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:22.456 [DEBUG] [GameDetector] performDetection() called at 01:14:22.456
2026-03-04 01:14:22.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:22.571 [INFO] Dashboard deactivated (system button) seq=4
2026-03-04 01:14:22.575 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:14:23.456 [DEBUG] [GameDetector] performDetection() called at 01:14:23.456
2026-03-04 01:14:23.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:24.333 [INFO] Dashboard activated (system button) seq=5
2026-03-04 01:14:24.333 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:14:24.456 [DEBUG] [GameDetector] performDetection() called at 01:14:24.456
2026-03-04 01:14:24.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:24.536 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:14:24.536 [INFO] Device refresh after dashboard activation
2026-03-04 01:14:25.455 [DEBUG] [GameDetector] performDetection() called at 01:14:25.455
2026-03-04 01:14:25.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:26.455 [DEBUG] [GameDetector] performDetection() called at 01:14:26.455
2026-03-04 01:14:26.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:26.552 [DEBUG] [EVENTS] MouseButtonDown at (1153,697) button=Left timestamp=4029
2026-03-04 01:14:26.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:26.694 [DEBUG] [EVENTS] MouseButtonUp at (1160,694) button=Left timestamp=4038
2026-03-04 01:14:26.694 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:27.455 [DEBUG] [GameDetector] performDetection() called at 01:14:27.455
2026-03-04 01:14:27.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:28.455 [DEBUG] [GameDetector] performDetection() called at 01:14:28.455
2026-03-04 01:14:28.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:29.352 [DEBUG] [EVENTS] MouseButtonDown at (247,753) button=Left timestamp=4151
2026-03-04 01:14:29.352 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:29.457 [DEBUG] [GameDetector] performDetection() called at 01:14:29.457
2026-03-04 01:14:29.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:29.471 [DEBUG] [EVENTS] MouseButtonUp at (247,754) button=Left timestamp=4153
2026-03-04 01:14:29.472 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:30.031 [DEBUG] [EVENTS] MouseButtonDown at (376,753) button=Left timestamp=4189
2026-03-04 01:14:30.031 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:30.151 [DEBUG] [EVENTS] MouseButtonUp at (379,752) button=Left timestamp=4194
2026-03-04 01:14:30.156 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:14:30.163 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:14:30.163 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:30.164 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:14:30.164 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:30.168 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:14:30.168 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:14:30.168 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:30.271 [DEBUG] [EVENTS] MouseButtonDown at (378,753) button=Left timestamp=4197
2026-03-04 01:14:30.272 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:14:30.391 [DEBUG] [EVENTS] MouseButtonUp at (375,754) button=Left timestamp=4202
2026-03-04 01:14:30.399 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:14:30.404 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:14:30.404 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:30.406 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:14:30.406 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.08, filterType=0 (Adaptive One Euro)
2026-03-04 01:14:30.413 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:14:30.413 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:14:30.413 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:14:30.455 [DEBUG] [GameDetector] Timer poll #111
2026-03-04 01:14:30.455 [DEBUG] [GameDetector] performDetection() called at 01:14:30.455
2026-03-04 01:14:30.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:31.456 [DEBUG] [GameDetector] performDetection() called at 01:14:31.456
2026-03-04 01:14:31.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:32.455 [DEBUG] [GameDetector] performDetection() called at 01:14:32.455
2026-03-04 01:14:32.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:33.456 [DEBUG] [GameDetector] performDetection() called at 01:14:33.456
2026-03-04 01:14:33.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:33.674 [INFO] Dashboard deactivated (system button) seq=6
2026-03-04 01:14:33.677 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:14:34.456 [DEBUG] [GameDetector] performDetection() called at 01:14:34.456
2026-03-04 01:14:34.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:35.455 [DEBUG] [GameDetector] performDetection() called at 01:14:35.455
2026-03-04 01:14:35.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:36.457 [DEBUG] [GameDetector] performDetection() called at 01:14:36.457
2026-03-04 01:14:36.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:37.455 [DEBUG] [GameDetector] performDetection() called at 01:14:37.455
2026-03-04 01:14:37.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:38.456 [DEBUG] [GameDetector] performDetection() called at 01:14:38.456
2026-03-04 01:14:38.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:39.457 [DEBUG] [GameDetector] performDetection() called at 01:14:39.457
2026-03-04 01:14:39.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:40.455 [DEBUG] [GameDetector] Timer poll #121
2026-03-04 01:14:40.455 [DEBUG] [GameDetector] performDetection() called at 01:14:40.455
2026-03-04 01:14:40.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:41.456 [DEBUG] [GameDetector] performDetection() called at 01:14:41.456
2026-03-04 01:14:41.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:42.455 [DEBUG] [GameDetector] performDetection() called at 01:14:42.455
2026-03-04 01:14:42.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:43.457 [DEBUG] [GameDetector] performDetection() called at 01:14:43.457
2026-03-04 01:14:43.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:44.455 [DEBUG] [GameDetector] performDetection() called at 01:14:44.455
2026-03-04 01:14:44.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:45.455 [DEBUG] [GameDetector] performDetection() called at 01:14:45.455
2026-03-04 01:14:45.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:46.455 [DEBUG] [GameDetector] performDetection() called at 01:14:46.455
2026-03-04 01:14:46.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:47.455 [DEBUG] [GameDetector] performDetection() called at 01:14:47.455
2026-03-04 01:14:47.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:48.455 [DEBUG] [GameDetector] performDetection() called at 01:14:48.455
2026-03-04 01:14:48.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:49.355 [INFO] [LogParser] parseLogContent called with 180 bytes, 1 rules
2026-03-04 01:14:49.355 [INFO] [LogParser] ? WEAPON DETECTED: SA58
2026-03-04 01:14:49.355 [INFO] [GameStateStore] STATE CHANGE: equippedWeapon '(none)' → 'SA58' (game: contractors_showdown, change #3)
2026-03-04 01:14:49.356 [INFO] [GameProfileController] onEquippedWeaponChanged: '' → 'SA58'
2026-03-04 01:14:49.356 [INFO] [GameProfileController] Profile bridge: weaponId='SA58' display='SA58' → GCC profile='EZ : SA58'
2026-03-04 01:14:49.380 [INFO] [GameProfileController] AUTO-CALIBRATION: Applied profile 'EZ : SA58' for SA58
2026-03-04 01:14:49.380 [INFO] [GameStateStore] STATE CHANGE: activeProfile '(none)' → 'EZ : SA58' (weapon: SA58)
2026-03-04 01:14:49.380 [INFO] ╔══════════════════════════════════════════════════╗
2026-03-04 01:14:49.380 [INFO] ║ GAME STATE STORE — SNAPSHOT ║
2026-03-04 01:14:49.380 [INFO] ╠══════════════════════════════════════════════════╣
2026-03-04 01:14:49.380 [INFO] ║ activeGame: contractors_showdown
2026-03-04 01:14:49.380 [INFO] ║ equippedWeapon: SA58
2026-03-04 01:14:49.380 [INFO] ║ activeProfile: EZ : SA58
2026-03-04 01:14:49.380 [INFO] ║ gameRunning: true
2026-03-04 01:14:49.380 [INFO] ║ logMonitoring: ACTIVE
2026-03-04 01:14:49.380 [INFO] ║ stateChanges: 3
2026-03-04 01:14:49.380 [INFO] ║ lastGameChange: 01:14:00.458
2026-03-04 01:14:49.380 [INFO] ║ lastWeaponChange:01:14:49.355
2026-03-04 01:14:49.380 [INFO] ╚══════════════════════════════════════════════════╝
2026-03-04 01:14:49.455 [DEBUG] [GameDetector] performDetection() called at 01:14:49.455
2026-03-04 01:14:49.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:50.402 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:14:50.457 [DEBUG] [GameDetector] Timer poll #131
2026-03-04 01:14:50.457 [DEBUG] [GameDetector] performDetection() called at 01:14:50.457
2026-03-04 01:14:50.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:51.183 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:14:51.455 [DEBUG] [GameDetector] performDetection() called at 01:14:51.455
2026-03-04 01:14:51.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:52.455 [DEBUG] [GameDetector] performDetection() called at 01:14:52.455
2026-03-04 01:14:52.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:53.457 [DEBUG] [GameDetector] performDetection() called at 01:14:53.457
2026-03-04 01:14:53.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:54.319 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:14:54.456 [DEBUG] [GameDetector] performDetection() called at 01:14:54.456
2026-03-04 01:14:54.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:55.455 [DEBUG] [GameDetector] performDetection() called at 01:14:55.455
2026-03-04 01:14:55.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:56.456 [DEBUG] [GameDetector] performDetection() called at 01:14:56.456
2026-03-04 01:14:56.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:57.457 [DEBUG] [GameDetector] performDetection() called at 01:14:57.457
2026-03-04 01:14:57.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:58.456 [DEBUG] [GameDetector] performDetection() called at 01:14:58.456
2026-03-04 01:14:58.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:14:59.456 [DEBUG] [GameDetector] performDetection() called at 01:14:59.456
2026-03-04 01:14:59.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:00.455 [DEBUG] [GameDetector] Timer poll #141
2026-03-04 01:15:00.455 [DEBUG] [GameDetector] performDetection() called at 01:15:00.455
2026-03-04 01:15:00.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:01.456 [DEBUG] [GameDetector] performDetection() called at 01:15:01.456
2026-03-04 01:15:01.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:02.455 [DEBUG] [GameDetector] performDetection() called at 01:15:02.455
2026-03-04 01:15:02.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:03.457 [DEBUG] [GameDetector] performDetection() called at 01:15:03.457
2026-03-04 01:15:03.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:04.457 [DEBUG] [GameDetector] performDetection() called at 01:15:04.457
2026-03-04 01:15:04.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:05.455 [DEBUG] [GameDetector] performDetection() called at 01:15:05.455
2026-03-04 01:15:05.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:05.632 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:15:06.456 [DEBUG] [GameDetector] performDetection() called at 01:15:06.456
2026-03-04 01:15:06.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:07.455 [DEBUG] [GameDetector] performDetection() called at 01:15:07.455
2026-03-04 01:15:07.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:08.455 [DEBUG] [GameDetector] performDetection() called at 01:15:08.455
2026-03-04 01:15:08.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:09.456 [DEBUG] [GameDetector] performDetection() called at 01:15:09.456
2026-03-04 01:15:09.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:10.456 [DEBUG] [GameDetector] Timer poll #151
2026-03-04 01:15:10.456 [DEBUG] [GameDetector] performDetection() called at 01:15:10.456
2026-03-04 01:15:10.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:11.457 [DEBUG] [GameDetector] performDetection() called at 01:15:11.457
2026-03-04 01:15:11.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:12.455 [DEBUG] [GameDetector] performDetection() called at 01:15:12.455
2026-03-04 01:15:12.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:13.455 [DEBUG] [GameDetector] performDetection() called at 01:15:13.455
2026-03-04 01:15:13.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:14.455 [DEBUG] [GameDetector] performDetection() called at 01:15:14.455
2026-03-04 01:15:14.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:15.455 [DEBUG] [GameDetector] performDetection() called at 01:15:15.455
2026-03-04 01:15:15.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:15.834 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:15:16.092 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:15:16.456 [DEBUG] [GameDetector] performDetection() called at 01:15:16.456
2026-03-04 01:15:16.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:17.456 [DEBUG] [GameDetector] performDetection() called at 01:15:17.456
2026-03-04 01:15:17.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:18.457 [DEBUG] [GameDetector] performDetection() called at 01:15:18.457
2026-03-04 01:15:18.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:19.457 [DEBUG] [GameDetector] performDetection() called at 01:15:19.456
2026-03-04 01:15:19.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:19.493 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:15:20.455 [DEBUG] [GameDetector] Timer poll #161
2026-03-04 01:15:20.455 [DEBUG] [GameDetector] performDetection() called at 01:15:20.455
2026-03-04 01:15:20.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:21.455 [DEBUG] [GameDetector] performDetection() called at 01:15:21.455
2026-03-04 01:15:21.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:22.457 [DEBUG] [GameDetector] performDetection() called at 01:15:22.457
2026-03-04 01:15:22.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:23.455 [DEBUG] [GameDetector] performDetection() called at 01:15:23.455
2026-03-04 01:15:23.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:24.456 [DEBUG] [GameDetector] performDetection() called at 01:15:24.456
2026-03-04 01:15:24.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:24.997 [INFO] [LogParser] parseLogContent called with 38 bytes, 1 rules
2026-03-04 01:15:25.257 [INFO] [LogParser] parseLogContent called with 49 bytes, 1 rules
2026-03-04 01:15:25.457 [DEBUG] [GameDetector] performDetection() called at 01:15:25.457
2026-03-04 01:15:25.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:26.029 [INFO] [LogParser] parseLogContent called with 48 bytes, 1 rules
2026-03-04 01:15:26.455 [DEBUG] [GameDetector] performDetection() called at 01:15:26.455
2026-03-04 01:15:26.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:27.456 [DEBUG] [GameDetector] performDetection() called at 01:15:27.456
2026-03-04 01:15:27.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:28.455 [DEBUG] [GameDetector] performDetection() called at 01:15:28.455
2026-03-04 01:15:28.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:29.455 [DEBUG] [GameDetector] performDetection() called at 01:15:29.455
2026-03-04 01:15:29.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:30.456 [DEBUG] [GameDetector] Timer poll #171
2026-03-04 01:15:30.456 [DEBUG] [GameDetector] performDetection() called at 01:15:30.456
2026-03-04 01:15:30.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:31.457 [DEBUG] [GameDetector] performDetection() called at 01:15:31.457
2026-03-04 01:15:31.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:32.457 [DEBUG] [GameDetector] performDetection() called at 01:15:32.457
2026-03-04 01:15:32.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:33.455 [DEBUG] [GameDetector] performDetection() called at 01:15:33.455
2026-03-04 01:15:33.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:34.455 [DEBUG] [GameDetector] performDetection() called at 01:15:34.455
2026-03-04 01:15:34.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:35.455 [DEBUG] [GameDetector] performDetection() called at 01:15:35.455
2026-03-04 01:15:35.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:36.455 [DEBUG] [GameDetector] performDetection() called at 01:15:36.455
2026-03-04 01:15:36.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:37.298 [INFO] [LogParser] parseLogContent called with 76 bytes, 1 rules
2026-03-04 01:15:37.298 [INFO] [LogParser] ? WEAPON DETECTED: SA58
2026-03-04 01:15:37.455 [DEBUG] [GameDetector] performDetection() called at 01:15:37.455
2026-03-04 01:15:37.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:37.693 [INFO] Dashboard activated (system button) seq=7
2026-03-04 01:15:37.693 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:15:37.901 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:15:37.901 [INFO] Device refresh after dashboard activation
2026-03-04 01:15:38.455 [DEBUG] [GameDetector] performDetection() called at 01:15:38.455
2026-03-04 01:15:38.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:39.112 [DEBUG] [EVENTS] MouseButtonDown at (225,386) button=Left timestamp=4461
2026-03-04 01:15:39.113 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:39.231 [DEBUG] [EVENTS] MouseButtonUp at (221,378) button=Left timestamp=4470
2026-03-04 01:15:39.231 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.08 -> 0.0784 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:39.236 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:39.236 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0784, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.241 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:39.241 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0784, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.244 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:39.244 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:39.273 [DEBUG] [EVENTS] MouseButtonDown at (221,376) button=Left timestamp=4473
2026-03-04 01:15:39.274 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:39.391 [DEBUG] [EVENTS] MouseButtonUp at (224,372) button=Left timestamp=4479
2026-03-04 01:15:39.391 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0784 -> 0.0768 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:39.397 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:39.397 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0768, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.401 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:39.401 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0768, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.404 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:39.404 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:39.451 [DEBUG] [EVENTS] MouseButtonDown at (226,369) button=Left timestamp=4485
2026-03-04 01:15:39.451 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:39.457 [DEBUG] [GameDetector] performDetection() called at 01:15:39.457
2026-03-04 01:15:39.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:39.552 [DEBUG] [EVENTS] MouseButtonUp at (230,367) button=Left timestamp=4491
2026-03-04 01:15:39.552 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0768 -> 0.0752 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:39.556 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:39.556 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0752, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.562 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:39.562 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0752, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.564 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:39.564 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:39.595 [DEBUG] [EVENTS] MouseButtonDown at (231,366) button=Left timestamp=4494
2026-03-04 01:15:39.595 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:39.711 [DEBUG] [EVENTS] MouseButtonUp at (231,365) button=Left timestamp=4496
2026-03-04 01:15:39.711 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0752 -> 0.0736 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:39.716 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:39.716 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0736, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.721 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:39.721 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0736, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.727 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:39.727 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:39.771 [DEBUG] [EVENTS] MouseButtonDown at (231,365) button=Left timestamp=4497
2026-03-04 01:15:39.771 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:39.872 [DEBUG] [EVENTS] MouseButtonUp at (229,365) button=Left timestamp=4500
2026-03-04 01:15:39.872 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0736 -> 0.072 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:39.877 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:39.877 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.072, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.882 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:39.882 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.072, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:39.886 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:39.886 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:39.912 [DEBUG] [EVENTS] MouseButtonDown at (229,365) button=Left timestamp=4501
2026-03-04 01:15:39.912 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.031 [DEBUG] [EVENTS] MouseButtonUp at (228,366) button=Left timestamp=4504
2026-03-04 01:15:40.031 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.072 -> 0.0704 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.036 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.036 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0704, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.038 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.038 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0704, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.042 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.042 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.072 [DEBUG] [EVENTS] MouseButtonDown at (228,367) button=Left timestamp=4506
2026-03-04 01:15:40.072 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.171 [DEBUG] [EVENTS] MouseButtonUp at (228,369) button=Left timestamp=4509
2026-03-04 01:15:40.172 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0704 -> 0.0688 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.176 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.176 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0688, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.180 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.180 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0688, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.184 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.184 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.231 [DEBUG] [EVENTS] MouseButtonDown at (228,370) button=Left timestamp=4511
2026-03-04 01:15:40.232 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.333 [DEBUG] [EVENTS] MouseButtonUp at (229,371) button=Left timestamp=4514
2026-03-04 01:15:40.335 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0688 -> 0.0672 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.340 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.340 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0672, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.343 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.343 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0672, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.346 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.346 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.391 [DEBUG] [EVENTS] MouseButtonDown at (229,371) button=Left timestamp=4515
2026-03-04 01:15:40.391 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.456 [DEBUG] [GameDetector] Timer poll #181
2026-03-04 01:15:40.456 [DEBUG] [GameDetector] performDetection() called at 01:15:40.456
2026-03-04 01:15:40.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:40.492 [DEBUG] [EVENTS] MouseButtonUp at (228,371) button=Left timestamp=4517
2026-03-04 01:15:40.492 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0672 -> 0.0656 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.497 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.497 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0656, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.500 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.500 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0656, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.503 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.503 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.551 [DEBUG] [EVENTS] MouseButtonDown at (227,371) button=Left timestamp=4519
2026-03-04 01:15:40.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.673 [DEBUG] [EVENTS] MouseButtonUp at (226,370) button=Left timestamp=4522
2026-03-04 01:15:40.674 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0656 -> 0.064 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.678 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.678 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.064, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.683 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.683 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.064, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.685 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.685 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.733 [DEBUG] [EVENTS] MouseButtonDown at (226,370) button=Left timestamp=4523
2026-03-04 01:15:40.733 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:40.831 [DEBUG] [EVENTS] MouseButtonUp at (226,367) button=Left timestamp=4527
2026-03-04 01:15:40.831 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.064 -> 0.0624 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:40.836 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:40.836 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0624, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.843 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:40.843 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0624, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:40.846 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:40.846 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:40.871 [DEBUG] [EVENTS] MouseButtonDown at (226,367) button=Left timestamp=4528
2026-03-04 01:15:40.871 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.013 [DEBUG] [EVENTS] MouseButtonUp at (226,365) button=Left timestamp=4531
2026-03-04 01:15:41.014 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0624 -> 0.0608 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.018 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.018 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0608, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.023 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.023 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0608, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.027 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.027 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.051 [DEBUG] [EVENTS] MouseButtonDown at (226,365) button=Left timestamp=4532
2026-03-04 01:15:41.051 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.151 [DEBUG] [EVENTS] MouseButtonUp at (226,365) button=Left timestamp=4533
2026-03-04 01:15:41.151 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0608 -> 0.0592 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.155 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.155 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0592, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.159 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.159 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0592, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.163 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.163 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.231 [DEBUG] [EVENTS] MouseButtonDown at (225,365) button=Left timestamp=4535
2026-03-04 01:15:41.231 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.331 [DEBUG] [EVENTS] MouseButtonUp at (225,365) button=Left timestamp=4536
2026-03-04 01:15:41.332 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0592 -> 0.0576 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.336 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.336 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0576, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.342 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.342 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0576, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.346 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.346 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.391 [DEBUG] [EVENTS] MouseButtonDown at (225,365) button=Left timestamp=4537
2026-03-04 01:15:41.391 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.455 [DEBUG] [GameDetector] performDetection() called at 01:15:41.455
2026-03-04 01:15:41.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:41.512 [DEBUG] [EVENTS] MouseButtonUp at (225,365) button=Left timestamp=4538
2026-03-04 01:15:41.513 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0576 -> 0.056 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.516 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.516 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.056, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.522 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.522 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.056, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.525 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.525 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.552 [DEBUG] [EVENTS] MouseButtonDown at (225,365) button=Left timestamp=4539
2026-03-04 01:15:41.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.673 [DEBUG] [EVENTS] MouseButtonUp at (225,365) button=Left timestamp=4540
2026-03-04 01:15:41.675 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.056 -> 0.0544 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.679 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.679 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0544, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.683 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.683 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0544, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.685 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.685 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.732 [DEBUG] [EVENTS] MouseButtonDown at (225,365) button=Left timestamp=4541
2026-03-04 01:15:41.732 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:41.852 [DEBUG] [EVENTS] MouseButtonUp at (224,365) button=Left timestamp=4543
2026-03-04 01:15:41.852 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0544 -> 0.0528 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:41.856 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:41.856 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0528, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.858 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:41.858 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0528, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:41.864 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:41.864 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:41.912 [DEBUG] [EVENTS] MouseButtonDown at (223,365) button=Left timestamp=4545
2026-03-04 01:15:41.912 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.011 [DEBUG] [EVENTS] MouseButtonUp at (223,364) button=Left timestamp=4547
2026-03-04 01:15:42.012 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0528 -> 0.0512 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.015 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.015 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0512, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.020 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.020 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0512, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.022 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.022 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.091 [DEBUG] [EVENTS] MouseButtonDown at (223,363) button=Left timestamp=4549
2026-03-04 01:15:42.091 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.172 [DEBUG] [EVENTS] MouseButtonUp at (223,362) button=Left timestamp=4551
2026-03-04 01:15:42.172 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0512 -> 0.0496 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.176 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.176 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0496, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.180 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.180 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0496, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.185 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.185 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.232 [DEBUG] [EVENTS] MouseButtonDown at (223,362) button=Left timestamp=4552
2026-03-04 01:15:42.232 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.351 [DEBUG] [EVENTS] MouseButtonUp at (223,362) button=Left timestamp=4553
2026-03-04 01:15:42.351 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0496 -> 0.048 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.356 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.356 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.362 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.362 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.048, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.366 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.366 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.393 [DEBUG] [EVENTS] MouseButtonDown at (223,363) button=Left timestamp=4555
2026-03-04 01:15:42.393 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.455 [DEBUG] [GameDetector] performDetection() called at 01:15:42.455
2026-03-04 01:15:42.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:42.513 [DEBUG] [EVENTS] MouseButtonUp at (223,363) button=Left timestamp=4558
2026-03-04 01:15:42.513 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.048 -> 0.0464 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.518 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.518 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0464, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.526 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.526 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0464, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.528 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.528 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.552 [DEBUG] [EVENTS] MouseButtonDown at (224,363) button=Left timestamp=4560
2026-03-04 01:15:42.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.672 [DEBUG] [EVENTS] MouseButtonUp at (225,363) button=Left timestamp=4562
2026-03-04 01:15:42.674 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0464 -> 0.0448 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.678 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.678 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0448, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.685 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.685 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0448, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.690 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.690 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.713 [DEBUG] [EVENTS] MouseButtonDown at (225,363) button=Left timestamp=4563
2026-03-04 01:15:42.714 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:42.811 [DEBUG] [EVENTS] MouseButtonUp at (226,364) button=Left timestamp=4566
2026-03-04 01:15:42.811 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0448 -> 0.0432 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:42.816 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:42.816 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0432, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.819 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:42.819 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0432, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:42.824 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:42.824 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:42.892 [DEBUG] [EVENTS] MouseButtonDown at (226,366) button=Left timestamp=4569
2026-03-04 01:15:42.892 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:43.031 [DEBUG] [EVENTS] MouseButtonUp at (225,367) button=Left timestamp=4572
2026-03-04 01:15:43.031 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0432 -> 0.0416 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:43.037 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:43.037 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0416, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:43.040 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:43.040 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0416, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:43.043 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:43.043 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:43.151 [DEBUG] [EVENTS] MouseButtonDown at (225,368) button=Left timestamp=4574
2026-03-04 01:15:43.151 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:43.272 [DEBUG] [EVENTS] MouseButtonUp at (224,368) button=Left timestamp=4576
2026-03-04 01:15:43.272 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0416 -> 0.04 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:43.276 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:43.276 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.04, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:43.282 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:43.282 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.04, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:43.283 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:43.283 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:43.456 [DEBUG] [GameDetector] performDetection() called at 01:15:43.456
2026-03-04 01:15:43.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:44.053 [INFO] Dashboard deactivated (system button) seq=8
2026-03-04 01:15:44.058 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:15:44.455 [DEBUG] [GameDetector] performDetection() called at 01:15:44.455
2026-03-04 01:15:44.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:44.638 [INFO] [LogParser] parseLogContent called with 49 bytes, 1 rules
2026-03-04 01:15:45.158 [INFO] [LogParser] parseLogContent called with 48 bytes, 1 rules
2026-03-04 01:15:45.457 [DEBUG] [GameDetector] performDetection() called at 01:15:45.457
2026-03-04 01:15:45.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:46.457 [DEBUG] [GameDetector] performDetection() called at 01:15:46.457
2026-03-04 01:15:46.458 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:47.455 [DEBUG] [GameDetector] performDetection() called at 01:15:47.455
2026-03-04 01:15:47.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:48.456 [DEBUG] [GameDetector] performDetection() called at 01:15:48.456
2026-03-04 01:15:48.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:49.456 [DEBUG] [GameDetector] performDetection() called at 01:15:49.456
2026-03-04 01:15:49.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:50.455 [DEBUG] [GameDetector] Timer poll #191
2026-03-04 01:15:50.455 [DEBUG] [GameDetector] performDetection() called at 01:15:50.455
2026-03-04 01:15:50.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:51.455 [DEBUG] [GameDetector] performDetection() called at 01:15:51.455
2026-03-04 01:15:51.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:51.743 [INFO] [LogParser] parseLogContent called with 76 bytes, 1 rules
2026-03-04 01:15:51.744 [INFO] [LogParser] ? WEAPON DETECTED: SA58
2026-03-04 01:15:52.052 [INFO] Dashboard activated (system button) seq=9
2026-03-04 01:15:52.052 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:15:52.257 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:15:52.257 [INFO] Device refresh after dashboard activation
2026-03-04 01:15:52.455 [DEBUG] [GameDetector] performDetection() called at 01:15:52.455
2026-03-04 01:15:52.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:53.456 [DEBUG] [GameDetector] performDetection() called at 01:15:53.456
2026-03-04 01:15:53.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:54.455 [DEBUG] [GameDetector] performDetection() called at 01:15:54.455
2026-03-04 01:15:54.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:55.456 [DEBUG] [GameDetector] performDetection() called at 01:15:55.456
2026-03-04 01:15:55.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:56.455 [DEBUG] [GameDetector] performDetection() called at 01:15:56.455
2026-03-04 01:15:56.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:57.312 [DEBUG] [EVENTS] MouseButtonDown at (232,362) button=Left timestamp=4668
2026-03-04 01:15:57.312 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:57.412 [DEBUG] [EVENTS] MouseButtonUp at (230,368) button=Left timestamp=4676
2026-03-04 01:15:57.412 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.04 -> 0.0384 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:57.417 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:57.417 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0384, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.420 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:57.420 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0384, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.424 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:57.424 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:57.456 [DEBUG] [GameDetector] performDetection() called at 01:15:57.456
2026-03-04 01:15:57.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:57.472 [DEBUG] [EVENTS] MouseButtonDown at (228,370) button=Left timestamp=4680
2026-03-04 01:15:57.472 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:57.552 [DEBUG] [EVENTS] MouseButtonUp at (227,371) button=Left timestamp=4683
2026-03-04 01:15:57.552 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0384 -> 0.0368 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:57.557 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:57.557 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0368, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.563 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:57.563 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0368, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.569 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:57.569 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:57.615 [DEBUG] [EVENTS] MouseButtonDown at (227,372) button=Left timestamp=4685
2026-03-04 01:15:57.616 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:57.712 [DEBUG] [EVENTS] MouseButtonUp at (227,372) button=Left timestamp=4686
2026-03-04 01:15:57.712 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0368 -> 0.0352 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:57.717 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:57.717 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0352, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.722 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:57.722 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0352, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.723 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:57.723 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:57.791 [DEBUG] [EVENTS] MouseButtonDown at (227,373) button=Left timestamp=4688
2026-03-04 01:15:57.792 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:57.872 [DEBUG] [EVENTS] MouseButtonUp at (228,373) button=Left timestamp=4690
2026-03-04 01:15:57.872 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0352 -> 0.0336 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:57.876 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:57.876 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0336, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.879 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:57.879 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0336, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:57.881 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:57.881 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:57.932 [DEBUG] [EVENTS] MouseButtonDown at (228,373) button=Left timestamp=4691
2026-03-04 01:15:57.932 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:58.032 [DEBUG] [EVENTS] MouseButtonUp at (229,372) button=Left timestamp=4694
2026-03-04 01:15:58.032 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0336 -> 0.032 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:58.037 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:58.037 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.032, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.040 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:58.040 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.032, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.044 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:58.044 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:58.072 [DEBUG] [EVENTS] MouseButtonDown at (229,371) button=Left timestamp=4696
2026-03-04 01:15:58.072 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:58.192 [DEBUG] [EVENTS] MouseButtonUp at (232,370) button=Left timestamp=4701
2026-03-04 01:15:58.192 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.032 -> 0.0304 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:58.197 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:58.197 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0304, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.199 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:58.199 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0304, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.203 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:58.203 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:58.232 [DEBUG] [EVENTS] MouseButtonDown at (233,369) button=Left timestamp=4704
2026-03-04 01:15:58.232 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:58.352 [DEBUG] [EVENTS] MouseButtonUp at (233,368) button=Left timestamp=4708
2026-03-04 01:15:58.352 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0304 -> 0.0288 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:58.357 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:58.357 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0288, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.361 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:58.361 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0288, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.366 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:58.366 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:58.392 [DEBUG] [EVENTS] MouseButtonDown at (233,368) button=Left timestamp=4709
2026-03-04 01:15:58.392 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:58.455 [DEBUG] [GameDetector] performDetection() called at 01:15:58.455
2026-03-04 01:15:58.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:15:58.512 [DEBUG] [EVENTS] MouseButtonUp at (231,367) button=Left timestamp=4713
2026-03-04 01:15:58.512 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0288 -> 0.0272 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:58.516 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:58.516 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0272, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.522 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:58.522 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0272, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.525 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:58.525 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:58.552 [DEBUG] [EVENTS] MouseButtonDown at (230,367) button=Left timestamp=4715
2026-03-04 01:15:58.552 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:58.831 [DEBUG] [EVENTS] MouseButtonUp at (229,365) button=Left timestamp=4719
2026-03-04 01:15:58.832 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0272 -> 0.0256 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:58.839 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:58.839 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.0256, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.843 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:58.843 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.0256, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:58.848 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:58.848 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:59.132 [DEBUG] [EVENTS] MouseButtonDown at (229,364) button=Left timestamp=4723
2026-03-04 01:15:59.132 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:15:59.254 [DEBUG] [EVENTS] MouseButtonUp at (229,363) button=Left timestamp=4725
2026-03-04 01:15:59.255 [Info] [SMOOTHING] >>> SET_DEVICE_TYPE_STRENGTH: Controller 0.0256 -> 0.024 deviceIds=5(OpenVR) 6(OpenVR) 
2026-03-04 01:15:59.259 [Info] [SMOOTHING] Applying to OpenVR devices...
2026-03-04 01:15:59.259 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:59.262 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:15:59.262 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:15:59.268 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:15:59.268 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:15:59.458 [DEBUG] [GameDetector] performDetection() called at 01:15:59.458
2026-03-04 01:15:59.459 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:00.458 [DEBUG] [GameDetector] Timer poll #201
2026-03-04 01:16:00.458 [DEBUG] [GameDetector] performDetection() called at 01:16:00.458
2026-03-04 01:16:00.458 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:01.455 [DEBUG] [GameDetector] performDetection() called at 01:16:01.455
2026-03-04 01:16:01.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:02.451 [DEBUG] [EVENTS] MouseButtonDown at (378,755) button=Left timestamp=4901
2026-03-04 01:16:02.452 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:02.455 [DEBUG] [GameDetector] performDetection() called at 01:16:02.455
2026-03-04 01:16:02.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:02.551 [DEBUG] [EVENTS] MouseButtonUp at (373,756) button=Left timestamp=4907
2026-03-04 01:16:02.555 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:02.560 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:02.560 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.568 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:02.568 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.571 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:02.571 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:02.571 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:02.634 [DEBUG] [EVENTS] MouseButtonDown at (372,756) button=Left timestamp=4909
2026-03-04 01:16:02.635 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:02.756 [DEBUG] [EVENTS] MouseButtonUp at (372,758) button=Left timestamp=4912
2026-03-04 01:16:02.762 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:02.764 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:02.764 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.770 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:02.770 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.776 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:02.776 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:02.776 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:02.831 [DEBUG] [EVENTS] MouseButtonDown at (372,758) button=Left timestamp=4913
2026-03-04 01:16:02.832 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:02.952 [DEBUG] [EVENTS] MouseButtonUp at (373,757) button=Left timestamp=4916
2026-03-04 01:16:02.956 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:02.958 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:02.958 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.963 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:02.963 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:02.970 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:02.970 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:02.970 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:03.456 [DEBUG] [GameDetector] performDetection() called at 01:16:03.456
2026-03-04 01:16:03.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:04.273 [INFO] Dashboard deactivated (system button) seq=10
2026-03-04 01:16:04.277 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:16:04.455 [DEBUG] [GameDetector] performDetection() called at 01:16:04.455
2026-03-04 01:16:04.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:04.816 [INFO] [LogParser] parseLogContent called with 49 bytes, 1 rules
2026-03-04 01:16:05.341 [INFO] [LogParser] parseLogContent called with 48 bytes, 1 rules
2026-03-04 01:16:05.456 [DEBUG] [GameDetector] performDetection() called at 01:16:05.456
2026-03-04 01:16:05.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:06.455 [DEBUG] [GameDetector] performDetection() called at 01:16:06.455
2026-03-04 01:16:06.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:07.458 [DEBUG] [GameDetector] performDetection() called at 01:16:07.458
2026-03-04 01:16:07.458 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:08.456 [DEBUG] [GameDetector] performDetection() called at 01:16:08.456
2026-03-04 01:16:08.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:08.491 [INFO] Dashboard activated (system button) seq=11
2026-03-04 01:16:08.491 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:16:08.705 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:16:08.706 [INFO] Device refresh after dashboard activation
2026-03-04 01:16:09.456 [DEBUG] [GameDetector] performDetection() called at 01:16:09.456
2026-03-04 01:16:09.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:10.211 [DEBUG] [EVENTS] MouseButtonDown at (239,756) button=Left timestamp=5060
2026-03-04 01:16:10.212 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:10.351 [DEBUG] [EVENTS] MouseButtonUp at (239,757) button=Left timestamp=5062
2026-03-04 01:16:10.355 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:10.358 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:10.358 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.364 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:10.364 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.370 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:10.370 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:10.370 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:10.456 [DEBUG] [GameDetector] Timer poll #211
2026-03-04 01:16:10.456 [DEBUG] [GameDetector] performDetection() called at 01:16:10.456
2026-03-04 01:16:10.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:10.531 [DEBUG] [EVENTS] MouseButtonDown at (240,758) button=Left timestamp=5065
2026-03-04 01:16:10.531 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:10.633 [DEBUG] [EVENTS] MouseButtonUp at (241,759) button=Left timestamp=5068
2026-03-04 01:16:10.638 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:10.643 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:10.643 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.647 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:10.647 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.653 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:10.653 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:10.653 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:10.736 [DEBUG] [EVENTS] MouseButtonDown at (241,760) button=Left timestamp=5070
2026-03-04 01:16:10.736 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=true
2026-03-04 01:16:10.833 [DEBUG] [EVENTS] MouseButtonUp at (241,762) button=Left timestamp=5073
2026-03-04 01:16:10.837 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:10.841 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:10.841 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.845 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:10.845 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:10.851 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:10.851 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:10.851 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:10.931 [DEBUG] [EVENTS] MouseButtonDown at (241,762) button=Left timestamp=5074
2026-03-04 01:16:10.931 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:11.051 [DEBUG] [EVENTS] MouseButtonUp at (241,762) button=Left timestamp=5075
2026-03-04 01:16:11.052 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:11.455 [DEBUG] [GameDetector] performDetection() called at 01:16:11.455
2026-03-04 01:16:11.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:11.655 [DEBUG] [EVENTS] MouseButtonDown at (238,757) button=Left timestamp=5084
2026-03-04 01:16:11.656 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:11.772 [DEBUG] [EVENTS] MouseButtonUp at (238,757) button=Left timestamp=5085
2026-03-04 01:16:11.776 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:11.779 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:11.779 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:11.788 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:11.788 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:11.791 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
2026-03-04 01:16:11.791 [Info] [SMOOTHING] Configuration applied to 3 active devices
2026-03-04 01:16:11.791 [DEBUG] [EVENTS] MouseButtonRelease accepted=true isAccepted=true
2026-03-04 01:16:12.455 [DEBUG] [GameDetector] performDetection() called at 01:16:12.455
2026-03-04 01:16:12.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:12.512 [INFO] Dashboard deactivated (system button) seq=12
2026-03-04 01:16:12.516 [INFO] Dashboard deactivated - controllers notified
2026-03-04 01:16:13.456 [DEBUG] [GameDetector] performDetection() called at 01:16:13.456
2026-03-04 01:16:13.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:14.457 [DEBUG] [GameDetector] performDetection() called at 01:16:14.457
2026-03-04 01:16:14.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:15.456 [DEBUG] [GameDetector] performDetection() called at 01:16:15.456
2026-03-04 01:16:15.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:16.456 [DEBUG] [GameDetector] performDetection() called at 01:16:16.456
2026-03-04 01:16:16.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:17.455 [DEBUG] [GameDetector] performDetection() called at 01:16:17.455
2026-03-04 01:16:17.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:18.455 [DEBUG] [GameDetector] performDetection() called at 01:16:18.455
2026-03-04 01:16:18.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:19.455 [DEBUG] [GameDetector] performDetection() called at 01:16:19.455
2026-03-04 01:16:19.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:20.455 [DEBUG] [GameDetector] Timer poll #221
2026-03-04 01:16:20.455 [DEBUG] [GameDetector] performDetection() called at 01:16:20.455
2026-03-04 01:16:20.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:21.456 [DEBUG] [GameDetector] performDetection() called at 01:16:21.456
2026-03-04 01:16:21.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:22.455 [DEBUG] [GameDetector] performDetection() called at 01:16:22.455
2026-03-04 01:16:22.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:23.251 [INFO] Dashboard activated (system button) seq=13
2026-03-04 01:16:23.251 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:16:23.456 [DEBUG] Device scan: 1 HMD, 2 controllers [LHR-9A0540FA, LHR-0311FA4A], 0 trackers
2026-03-04 01:16:23.457 [INFO] Device refresh after dashboard activation
2026-03-04 01:16:23.457 [DEBUG] [GameDetector] performDetection() called at 01:16:23.457
2026-03-04 01:16:23.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:24.455 [DEBUG] [GameDetector] performDetection() called at 01:16:24.455
2026-03-04 01:16:24.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:25.455 [DEBUG] [GameDetector] performDetection() called at 01:16:25.455
2026-03-04 01:16:25.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:26.455 [DEBUG] [GameDetector] performDetection() called at 01:16:26.455
2026-03-04 01:16:26.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:27.455 [DEBUG] [GameDetector] performDetection() called at 01:16:27.455
2026-03-04 01:16:27.455 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:28.457 [DEBUG] [GameDetector] performDetection() called at 01:16:28.457
2026-03-04 01:16:28.458 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:29.456 [DEBUG] [GameDetector] performDetection() called at 01:16:29.456
2026-03-04 01:16:29.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:30.455 [DEBUG] [GameDetector] Timer poll #231
2026-03-04 01:16:30.455 [DEBUG] [GameDetector] performDetection() called at 01:16:30.455
2026-03-04 01:16:30.456 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:31.456 [DEBUG] [GameDetector] performDetection() called at 01:16:31.456
2026-03-04 01:16:31.457 [INFO] GameDetector: Game detected via VR API: contractors_showdown
2026-03-04 01:16:32.092 [DEBUG] [EVENTS] MouseButtonDown at (381,593) button=Left timestamp=5702
2026-03-04 01:16:32.092 [DEBUG] [EVENTS] MouseButtonPress accepted=true isAccepted=false
2026-03-04 01:16:32.212 [DEBUG] [EVENTS] MouseButtonUp at (381,594) button=Left timestamp=5704
2026-03-04 01:16:32.216 [Info] [SMOOTHING] Applying smoothing configuration to all tracked devices...
2026-03-04 01:16:32.219 [INFO] [SMOOTHING] HMD smoothing applied for device 0: enabled=false strength=0.000
2026-03-04 01:16:32.219 [INFO] [SMOOTHING] >>> Applying to device 5 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:32.221 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 5
2026-03-04 01:16:32.221 [INFO] [SMOOTHING] >>> Applying to device 6 (Controller): enabled=TRUE, strength=0.024, filterType=0 (Adaptive One Euro)
2026-03-04 01:16:32.223 [INFO] [SMOOTHING] ✓ SUCCESS - Config written to shared memory for device 6
</file>
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

**Usage:**
```bash
node scripts/validate-rag.js              # Concise output
node scripts/validate-rag.js --verbose    # Detailed per-query
node scripts/validate-rag.js --output json # Machine-readable
```

### Facts

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

### Contexts

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[Queued messages while agent was busy]

---
Queued #1
[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478687345480826972",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:35 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

did you get the log files?
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

**Usage:**
```bash
node scripts/validate-rag.js              # Concise output
node scripts/validate-rag.js --verbose    # Detailed per-query
node scripts/validate-rag.js --output json # Machine-readable
```

### Facts

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

### Contexts

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[Queued messages while agent was busy]

---
Queued #1
[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478687345480826972",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:35 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

did you get the log files?
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

**Usage:**
```bash
node scripts/validate-rag.js              # Concise output
node scripts/validate-rag.js --verbose    # Detailed per-query
node scripts/validate-rag.js --output json # Machine-readable
```

### Facts

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

### Contexts

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[Queued messages while agent was busy]

---
Queued #1
[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478687345480826972",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:35 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

did you get the log files?
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

**Usage:**
```bash
node scripts/validate-rag.js              # Concise output
node scripts/validate-rag.js --verbose    # Detailed per-query
node scripts/validate-rag.js --output json # Machine-readable
```

### Facts

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

### Contexts

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[Queued messages while agent was busy]

---
Queued #1
[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478687345480826972",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:35 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

did you get the log files?
assistant: Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model.
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: rgcs
type: decision
area: operations
entities: [RGCS, version, v1.2.336, build-history]
pattern-key: rgcs.version_build_history
keywords: [version, build, commits, history, smoothing]
---

### Codes

## RGCS v1.2.335 — smoothing.ini Created as Folder (Bug + Fix)

**Root cause:** `QDir().mkpath(QDir(path).absolutePath())` where `path` is a file path
— `QDir` treats the file path as a directory path, so `mkpath` creates it as a folder.
**Fix (commit 1024d36):** `QDir().mkpath(QFileInfo(path).absolutePath())` — gets parent dir correctly.
**User action required:** Delete `C:\Users\saq\AppData\Local\RGCS\smoothing.ini` folder before installing fixed build.

---
date: 2026-03-03
project: rgcs
type: error
area: game-mechanics
entities: [OneEuro, strength, normalization, cutoff, DiagMax]
pattern-key: rgcs.oneeuro_strength_normalization
keywords: [smoothing, oneeuro, cutoff, normalization, physical-range, no-effect]
---

**Key insight:** There were TWO separate places strength is used in the pipeline:
1. **Overlay** — `strength → cutoff` curve (fixed in `1024d36`)
2. **Driver** — `strength → adaptive beta/boost` (fixed in `20baac2`)
Both needed normalization to 0–1. The overlay now normalizes once and sends 0–1 everywhere.

**Root cause:** `effectiveMinCutoff = configuredMinCutoff * 0.01^strength` curve was designed
for strength in 0–1. After rescaling physical max to 0.16 (ctrl) / 0.02 (HMD), DiagMax only
put 0.16 into the exponent → `1.5 * 0.01^0.16 = 0.747Hz` (barely any smoothing).
At 50% (0.08 ctrl) it computed `~0.87Hz` — effectively nothing.

With raw physical `strength=0.16` (DiagMax controllers):
- `lowStrengthBoost = 1 + (0.84 × 6) = 6.04×` ← multiplied effective cutoff by 6x
- `effectiveDCutoff = 2.0 + (0.84×1.5) = 3.26` ← allowed fast motion through
- Result: filter neutralized on any non-stationary motion despite correct `minCutoff=0.05Hz`

| Commit | Version | Description |
|--------|---------|-------------|
| `15c1669` | v1.2.325 | Percentage UI + new physical ranges (HMD 0–0.02, Ctrl 0–0.16) |
| `4221d62` | v1.2.325 | Preset fix (Recommended/High/DiagMax correct physical values) |
| `7888c9e` | ~v1.2.333 | INI load clamping + zero-value guard |
| `a8c410d` | v1.2.332 | Docs: clean build record |
| `70dbce5` | v1.2.333 | Merge commit (version bump) |
| `1024d36` | v1.2.335 | Normalize physical→cutoff in overlay + smoothing.ini folder fix |
| `20baac2` | v1.2.336 | Send normalized strength (0–1) to driver (fixes adaptive beta/boost) |

### Contexts

## wbtrv32: Two v6 Import Bugs Fixed (2026-03-03)

## RGCS Build + Commit History (as of 2026-03-03)

---
date: 2026-03-03
project: rgcs
type: error
area: infrastructure
entities: [smoothing.ini, QDir, QFileInfo, mkpath]
pattern-key: rgcs.smoothing_ini_folder_bug
keywords: [smoothing, ini, folder, qdir, qfileinfo, mkpath]
---

This is why DiagMax felt like nothing — the adaptive boost assumed strength was nearly zero.



Pre-compaction memory flush. Store durable memories now (use memory/2026-03-04.md; create memory/ if needed). IMPORTANT: If the file already exists, APPEND new content only and do not overwrite existing entries. If nothing to store, reply with NO_REPLY.
Current time: Wednesday, March 4th, 2026 — 9:38 AM (UTC)
user: ## Loaded Context (Clawtext)

### Decisions

---
date: 2026-03-03
project: clawtext
type: decision
area: operations
entities: [ClawText, validation, Phase2, standardization]
keywords: [rag-quality, validation-tool, metrics, tuning, phase2]
pattern-key: clawtext.phase2_completion
---

### Codes

### Phase 2b: Enhanced Deduplication Controls ✅
**File:** `~/.openclaw/workspace/skills/clawtext-ingest/src/index.js`
**Status:** Live on GitHub (v1.2.0)

**New Feature:**
- Added `checkDedupe` option to `fromFiles()` and `fromJSON()`
- Allows agents to disable dedup checks for performance if needed
- Default: `checkDedupe: true` (preserves safety)

**Usage:**
```javascript
// Skip dedup checks (faster, risky if duplicates exist)
await ingest.fromFiles(patterns, metadata, { checkDedupe: false });

// Keep dedup checks (default, safe)
await ingest.fromFiles(patterns, metadata, { checkDedupe: true });
```

| Goal | Status | Location |
|------|--------|----------|
| Deduplication as standard | ✅ | HOW_THINGS_WORK.md §3, ClawTextIngest source |
| Cluster rebuild automation | ✅ | HOW_THINGS_WORK.md §3, Agent onboarding guide |
| RAG validation tool | ✅ | `scripts/validate-rag.js` |
| Enhanced dedupe controls | ✅ | ClawTextIngest v1.2.0 |
| Agent onboarding guide | ✅ | `AGENT_ONBOARDING.md` in ClawText repo |
| Operational documentation | ✅ | HOW_THINGS_WORK.md (12.9KB, complete) |

### Phase 2 Documentation Updates ✅
**File:** `HOW_THINGS_WORK.md`
**Sections Updated:**
- Section 3: Added validation tool step after cluster rebuild
- Section 4: New "Validate RAG Quality" diagnostic section
- Data Ingestion section: Explained dedup importance and workflows

### Facts

**When to Use:**
- After cluster rebuilds (verify quality)
- Troubleshooting missing context (diagnose injection)
- Before/after RAG tuning (baseline comparison)
- During agent onboarding (system verification)

**Status:** All identified improvements from summary are now implemented and production-ready. Two deferred optional enhancements (cluster monitoring, auto-tuning) available for future Phase 3.

**Exit codes:**
- 0: Quality ≥70% (healthy RAG system)
- 1: Quality <70% (tuning recommended)

### Contexts

## Phase 2 Complete: RAG Validation Tool + Enhanced Deduplication (2026-03-03 10:05 UTC)

### Commits & Tags
- ClawText: b1555ee (validation tool)
- ClawText-Ingest: v1.2.0 tag created
- Workspace: 8d0772b (HOW_THINGS_WORK.md update)

---

### What's Production-Ready ✅
- RAG validation tool can diagnose quality issues independently
- Agents can use validation during onboarding setup
- Operators can use validation to tune RAG parameters empirically
- Dedup controls give agents flexibility for edge cases
- Documentation covers all use cases



[Thread starter - for context]
## RGCS Smoothing Development — v1.2.324 Fresh Thread

**Status:** Active Development — Input Page Master Toggle Sync Issue
**Model:** gpt-5-mini (fast iterations)
**Last Updated:** 2026-03-03 03:59 UTC

---

### What is RGCS?
Room-scale Gravity Compensation System — VR controller smoothing to eliminate high-frequency jitter via low-pass filtering + OneEuro algorithm.

**Devices:**
- Device 0 = HMD
- Device 5 = Left Controller
- Device 6 = Right Controller

---

Conversation info (untrusted metadata):
```json
{
  "message_id": "1478688038430183610",
  "sender_id": "142843545215041536",
  "conversation_label": "Guild ### RGCS Smoothing Development — v1.2.324 Fresh Thread channel id:1478240533557022730",
  "sender": "ragesaq",
  "timestamp": "Wed 2026-03-04 09:38 UTC",
  "group_subject": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_channel": "#rgcs-smoothing-development-v1-2-324-fresh-thread",
  "group_space": "1474997926919929927",
  "thread_label": "Discord thread #rgcs-projects › ## RGCS Smoothing Development — v1.2.324 Fresh Thread",
  "topic_id": "1478240533557022730",
  "is_group_chat": true
}
```

Sender (untrusted metadata):
```json
{
  "label": "ragesaq (142843545215041536)",
  "id": "142843545215041536",
  "name": "ragesaq",
  "username": "ragesaq",
  "tag": "ragesaq"
}
```

can you take the last 20 or so posts in this channel and make a new forum post in <#1476018965284261908> summarizing where we were at, with the key issues we have been troubleshooting?
