# Thread Analysis: RGCS Smoothing Development (v1.2.324 Fresh Thread)

## Overview
**Status:** 7008-line thread with substantial technical work completed  
**Date Captured:** 2026-03-04 09:38 UTC  
**Project:** RGCS (Room-scale Gravity Compensation System) — VR controller/HMD motion smoothing  
**Key Commits:** `30cf996`, `947ffe1`  
**Version Bump:** v1.2.354

---

## Context from Thread

### What is RGCS?
- **Purpose:** VR controller & HMD motion stabilization via low-pass filtering + One Euro algorithm
- **Devices:** Device 0 (HMD), Device 5 (Right Controller), Device 6 (Left Controller)
- **Key Components:** OneEuro filter, quaternion smoothing, calibration offset system
- **Architecture:** Overlay UI + Driver (SharedMemoryIPC communication)

---

## Major Issues Identified & Fixed

### 1. HMD 1% Strength Too Sensitive — CONFIRMED & FIXED ✅

**User Issue:** At low HMD smoothing (1%), noticeable latency/nausea despite high cutoff

**Root Cause Analysis (from thread):**
- Old `kHmdBaseMinCutoff = 4.0 Hz`
- At 1% UI: `effCutoff = 4.0 × 0.01^0.01 ≈ 3.8 Hz`
- Resulting lag: `1/(2π×3.8) ≈ 42ms`
- **Vestibular system detects lag at ~20ms** → 1% setting was genuinely perceptible

**Fix Applied:** Raised `kHmdBaseMinCutoff` from `4.0 Hz` to `20.0 Hz`

**New Behavior:**
- 1% → ~19 Hz → **~8ms lag** (imperceptible) ✅
- 25% (default) → ~4 Hz → ~40ms (light stabilization)
- 50% → ~2 Hz → meaningful hold
- 100% (DiagMax) → 0.2 Hz (brick-wall reference)

**Migration:** Automatic remapping of saved `4.0 → 20.0` in migration guard (no manual INI deletion needed)

**Updated Files:**
- `kHmdMinCutoff` constant changed
- `loadSettings` defaults (2 locations)
- `applyPreset` references
- Driver-side IPC config (`m_oneEuroParams[0].minCutoff = 20.0f`)

---

### 2. Notchy at 10 o'Clock Roll — CONFIRMED & FIXED ✅

**User Issue:** Controller orientation jump-around at ~10 o'clock roll orientation

**Root Cause (from thread):**
- Quaternion filter was filtering only x/y/z components
- w was reconstructed from unit-sphere constraint: `w = √(1 - x² - y² - z²)`
- At ~180° roll (10 o'clock), `|x,y,z| ≈ 1.0`, so `wSq ≈ 0`
- Small independent drift in filtered x/y/z compounds into large w errors
- Result: orientation-dependent jitter in that specific zone

**Fix Applied:**
- Added 4th filter for w component
- All four quaternion components filtered independently
- Normalize after filtering
- Sign canonicalization before filtering maintains consistency

**Result:** Orientation-dependent notchiness eliminated ✅

---

### 3. One Euro UI Layout & Drag Issue — CONFIRMED & FIXED ✅

**UI Issue:** One Euro control section clipping + button presses eaten by ScrollView drag

**Root Causes:**
1. Hardcoded `height: 250` but actual content is ~420px
2. Overflow rendered on top of Recommended/Default buttons
3. ScrollView consuming button press events as drag events

**Fixes Applied:**
1. Changed to `implicitHeight: oneEuroColumn.implicitHeight + 24` (dynamic sizing)
2. Added `MouseArea` blocker inside rectangle to prevent scroll event capture

**Result:** Layout now properly sized, buttons responsive ✅

---

## Calibration Drift (Ongoing Investigation)

**Status:** Not yet fully resolved  
**Known:** `947ffe1` fix (rotate by `qOrig` not `qFinal`) already in main branch  
**New Hypothesis:** Small per-frame rotation from smoothing filter compounding over time in offset path

**Action Needed:** Share driver log from drifting session with:
- `[EffectiveConfig]` logging enabled
- Smoothing enabled/strength values

---

## Context from Parallel ClawText Thread (Mixed in File)

**Unrelated to RGCS but in same file:**

### ClawText Phase 2b: Enhanced Deduplication Controls ✅
- **Status:** Live on GitHub (v1.2.0)
- **New Feature:** `checkDedupe` option in `fromFiles()`/`fromJSON()`
- **Default:** `checkDedupe: true` (safe)
- **Use Case:** Agents can disable for performance if no duplicates exist

### ClawText Phase 2 Validation Tool ✅
- **Exit codes:** 0 (quality ≥70%), 1 (quality <70%)
- **Usage:** Post-rebuild verification, tuning baseline, agent onboarding

---

## Assessment: What's in MEMORY.md vs. What Should Be

### Currently Missing from MEMORY.md:
- ❌ RGCS project existence
- ❌ The three fixes from this thread
- ❌ HMD sensitivity math & fix
- ❌ Quaternion filter notchiness root cause
- ❌ UI layout issue resolution
- ❌ Calibration drift investigation status
- ❌ Device ID mapping (Device 0=HMD, 5=Right, 6=Left)
- ❌ One Euro filter configuration model
- ❌ IPC communication architecture

### Currently Present in MEMORY.md:
- ✅ ClawSaver project (new)
- ✅ ClawSec hardening plan
- ✅ ClawText Phase 2 (partial)
- ✅ Prompt injection research

---

## Recommendations for MEMORY.md Update

**Priority 1 (Critical):**
1. Add RGCS project overview section
2. Document the three fixes + math/rationale
3. Add version history (v1.2.354 with commit hashes)
4. Add calibration drift investigation note

**Priority 2 (Important):**
1. Architecture diagram (Overlay ↔ Driver via IPC)
2. Device ID reference table
3. OneEuro filter parameter tuning guide
4. Migration strategy for old config values

**Priority 3 (Optional):**
1. Log interpretation guide (`[EffectiveConfig]`, `[STARTUP]`, etc.)
2. Quaternion rotation matrix math
3. Vestibular system sensitivity thresholds
4. Per-device config flow documentation

---

## Files Extracted This Thread

**3 driver logs + 2 text files:**
- `8d9662a3-c22a-4506-ad16-07a94d2f7680.txt` (first 6,809 lines of driver.log)
- `139ae26d-4cf9-43b8-8b0b-747369495c7c.txt` (likely overlay config or sensor data)
- `driver.log` (Discord CDN, full VR session log from 01:12:39 - 01:17:39 UTC)
- `96da1c84-c777-447f-a07d-f702980c1c5e.txt` (unknown)
- `c8bc256c-3977-4c07-8bd5-6c597d3be901.txt` (unknown)

**Available for deep-dive analysis** if needed for future debugging

---

## Summary: Context Capture Status

| Category | Status | Notes |
|----------|--------|-------|
| **Technical findings** | 80% captured | Math, fixes documented; some edge cases remain |
| **Architecture** | 20% captured | IPC mentioned but not fully documented |
| **Commits/versions** | 90% captured | 30cf996, 947ffe1, v1.2.354 recorded |
| **Logs** | 100% available | All 5 files present for analysis |
| **Decisions** | 70% captured | Why fixes work; not implementation details |
| **Next steps** | 50% captured | Calibration drift investigation ongoing |

---

*This analysis prepared for context review against MEMORY.md. Ready for integration.*
