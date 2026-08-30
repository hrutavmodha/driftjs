#!/usr/bin/env bash
set -euo pipefail

# DriftJS Benchmark Suite - High Performance CPU Runner
# Sets CPU scaling governor / power profile to performance mode before running benchmarks
# and restores the previous governor upon completion or interrupt.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Track initial settings
ORIG_GOVERNOR=""
ORIG_PROFILE=""

if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
  ORIG_GOVERNOR="$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true)"
fi

if command -v powerprofilesctl >/dev/null 2>&1; then
  ORIG_PROFILE="$(powerprofilesctl get 2>/dev/null || true)"
fi

cleanup() {
  echo ""
  echo "🧹 Restoring previous CPU and power configuration..."
  
  if [ -n "${ORIG_PROFILE}" ] && command -v powerprofilesctl >/dev/null 2>&1; then
    powerprofilesctl set "${ORIG_PROFILE}" 2>/dev/null || true
    echo "   • Restored power profile: ${ORIG_PROFILE}"
  fi

  if [ -n "${ORIG_GOVERNOR}" ]; then
    if command -v cpupower >/dev/null 2>&1; then
      sudo cpupower frequency-set -g "${ORIG_GOVERNOR}" >/dev/null 2>&1 || true
      echo "   • Restored CPU governor: ${ORIG_GOVERNOR}"
    else
      for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
        if [ -f "$gov" ]; then
          echo "${ORIG_GOVERNOR}" | sudo tee "$gov" >/dev/null 2>&1 || true
        fi
      done
      echo "   • Restored CPU governor: ${ORIG_GOVERNOR}"
    fi
  fi
  echo "✅ Cleanup complete."
}

trap cleanup EXIT INT TERM

echo "🚀 Preparing CPU for benchmarking in PERFORMANCE mode..."

# 1. Attempt to set power profile to performance only (no balanced fallback)
if command -v powerprofilesctl >/dev/null 2>&1; then
  if powerprofilesctl set performance 2>/dev/null; then
    echo "   • Power profile set to: performance"
  fi
fi

# 2. Set CPU governor to performance (prompting sudo if needed)
SET_GOV_SUCCESS=false

CURRENT_GOV="$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo 'unknown')"
if [ "${CURRENT_GOV}" != "performance" ]; then
  echo "   • Current CPU Governor is '${CURRENT_GOV}'. Requesting sudo to set 'performance' mode..."
  if command -v cpupower >/dev/null 2>&1; then
    if sudo cpupower frequency-set -g performance >/dev/null 2>&1; then
      SET_GOV_SUCCESS=true
    fi
  fi

  if [ "$SET_GOV_SUCCESS" = false ]; then
    for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
      if [ -f "$gov" ]; then
        echo performance | sudo tee "$gov" >/dev/null 2>&1 || true
      fi
    done
  fi
fi

CURRENT_GOV="$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo 'unknown')"
echo "   • Active CPU Governor: ${CURRENT_GOV}"

if [ "${CURRENT_GOV}" != "performance" ]; then
  echo "   ⚠️ Warning: CPU governor could not be switched to performance mode."
fi
echo ""

# 3. Build framework bundles for size and startup measurements
echo "📦 Building benchmark framework packages..."
cd "${ROOT_DIR}"
pnpm -r --filter "./benchmarks/frameworks/**" build

# 4. Run the benchmarks
echo ""
echo "⚡ Starting Benchmark Suite with CPU in performance mode..."
pnpm --filter driftjs-benchmark-runner bench "$@"

# 5. Start the TS + Vite results dashboard app
echo ""
echo "📊 Launching DriftJS Benchmark Results Dashboard..."
pnpm --filter driftjs-benchmark-app dev --open

