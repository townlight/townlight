#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PROFILE="clerk-core"
MENU_STYLE="guided"
SHOW_MENU=()
SHOW_READINESS=()
DETECT_HOST=()
READINESS_SCENARIO="nominal"
EXECUTE=()
SHOW_EXECUTOR_DESIGN=()
SHOW_EVIDENCE_SCHEMA=()
SHOW_ARTIFACTS=()
SHOW_PROFILE_CONFIG=()
SHOW_HEALTH_CHECKS=()
SHOW_PREFLIGHT=()
GENERATE_INSTALL_KIT=()
GENERATE_PROFILE_PACKAGE=()
GENERATE_RELEASE_ARTIFACTS=()
PACKAGE_PLATFORM_ARGS=()
INSTALLER_VERSION_ARGS=()
RUN_CLEANROOM_PROOF=()
RUN_CLEANROOM_GATE=()
WRITE_REPORT=()
RUN_ID_ARGS=()
APPROVAL_ARGS=()
MODULE_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --module)
      MODULE_ARGS+=("--module" "$2")
      shift 2
      ;;
    --menu-style)
      MENU_STYLE="$2"
      shift 2
      ;;
    --show-menu)
      SHOW_MENU=("--show-menu")
      shift
      ;;
    --show-readiness)
      SHOW_READINESS=("--show-readiness")
      shift
      ;;
    --detect-host)
      DETECT_HOST=("--detect-host")
      shift
      ;;
    --readiness-scenario)
      READINESS_SCENARIO="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=("--execute")
      shift
      ;;
    --show-executor-design)
      SHOW_EXECUTOR_DESIGN=("--show-executor-design")
      shift
      ;;
    --show-evidence-schema)
      SHOW_EVIDENCE_SCHEMA=("--show-evidence-schema")
      shift
      ;;
    --show-artifacts)
      SHOW_ARTIFACTS=("--show-artifacts")
      shift
      ;;
    --show-profile-config)
      SHOW_PROFILE_CONFIG=("--show-profile-config")
      shift
      ;;
    --show-health-checks)
      SHOW_HEALTH_CHECKS=("--show-health-checks")
      shift
      ;;
    --show-preflight)
      SHOW_PREFLIGHT=("--show-preflight")
      shift
      ;;
    --generate-install-kit)
      GENERATE_INSTALL_KIT=("--generate-install-kit")
      shift
      ;;
    --generate-profile-package)
      GENERATE_PROFILE_PACKAGE=("--generate-profile-package")
      shift
      ;;
    --generate-release-artifacts)
      GENERATE_RELEASE_ARTIFACTS=("--generate-release-artifacts")
      shift
      ;;
    --installer-version)
      INSTALLER_VERSION_ARGS=("--installer-version" "$2")
      shift 2
      ;;
    --package-platform)
      PACKAGE_PLATFORM_ARGS=("--package-platform" "$2")
      shift 2
      ;;
    --run-cleanroom-proof)
      RUN_CLEANROOM_PROOF=("--run-cleanroom-proof")
      shift
      ;;
    --run-cleanroom-gate)
      RUN_CLEANROOM_GATE=("--run-cleanroom-gate")
      shift
      ;;
    --write-report)
      WRITE_REPORT=("--write-report")
      shift
      ;;
    --run-id)
      RUN_ID_ARGS=("--run-id" "$2")
      shift 2
      ;;
    --approval-token)
      APPROVAL_ARGS=("--approval-token" "$2")
      shift 2
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ${#RUN_CLEANROOM_PROOF[@]} -gt 0 || ${#RUN_CLEANROOM_GATE[@]} -gt 0 ]]; then
  echo "Townlight installer launcher: Linux cleanroom mode"
else
  echo "Townlight installer launcher: Linux dry-run only"
fi
echo "Profile: ${PROFILE}"
echo "Menu style: ${MENU_STYLE}"
if [[ ${#SHOW_READINESS[@]} -gt 0 ]]; then
  echo "Readiness scenario: ${READINESS_SCENARIO}"
  if [[ ${#DETECT_HOST[@]} -gt 0 ]]; then
    echo "Detection mode: host read-only"
  fi
fi
if [[ ${#EXECUTE[@]} -gt 0 ]]; then
  echo "Execution gate requested: blocked by default"
fi
if [[ ${#SHOW_EXECUTOR_DESIGN[@]} -gt 0 ]]; then
  echo "Executor design requested: dry-run only"
fi
if [[ ${#SHOW_EVIDENCE_SCHEMA[@]} -gt 0 ]]; then
  echo "Evidence schema requested: dry-run only"
fi
if [[ ${#SHOW_ARTIFACTS[@]} -gt 0 ]]; then
  echo "Artifact/version resolver requested: dry-run only"
fi
if [[ ${#SHOW_PROFILE_CONFIG[@]} -gt 0 ]]; then
  echo "Profile config requested: dry-run only"
fi
if [[ ${#SHOW_HEALTH_CHECKS[@]} -gt 0 ]]; then
  echo "Health-check plan requested: dry-run only"
fi
if [[ ${#SHOW_PREFLIGHT[@]} -gt 0 ]]; then
  echo "Executor preflight requested: blocked dry-run only"
fi
if [[ ${#GENERATE_INSTALL_KIT[@]} -gt 0 ]]; then
  echo "Minimal TownlightCore install kit generation requested: writes installer/generated only"
fi
if [[ ${#GENERATE_PROFILE_PACKAGE[@]} -gt 0 ]]; then
  echo "Profile package generation requested: writes installer/generated/packages only"
fi
if [[ ${#GENERATE_RELEASE_ARTIFACTS[@]} -gt 0 ]]; then
  echo "Release artifact generation requested: writes installer/generated/native and installer/dist"
fi
if [[ ${#RUN_CLEANROOM_PROOF[@]} -gt 0 ]]; then
  echo "Cleanroom proof requested: Docker cleanroom runner will build/start/verify/teardown"
fi
if [[ ${#RUN_CLEANROOM_GATE[@]} -gt 0 ]]; then
  echo "Cleanroom gate requested: Docker cleanroom runner will build/start/verify/teardown and print concise pass/fail output"
fi
if [[ ${#WRITE_REPORT[@]} -gt 0 ]]; then
  echo "Evidence report requested: installer/reports dry-run evidence only"
fi
DRY_RUN_ARG=("--dry-run")
if [[ ${#RUN_CLEANROOM_PROOF[@]} -gt 0 || ${#RUN_CLEANROOM_GATE[@]} -gt 0 || ${#GENERATE_PROFILE_PACKAGE[@]} -gt 0 || ${#GENERATE_RELEASE_ARTIFACTS[@]} -gt 0 ]]; then
  DRY_RUN_ARG=()
fi
python3 "${REPO_ROOT}/scripts/plan-installer.py" --profile "${PROFILE}" --menu-style "${MENU_STYLE}" "${DRY_RUN_ARG[@]}" "${SHOW_MENU[@]}" "${SHOW_READINESS[@]}" "${DETECT_HOST[@]}" "${EXECUTE[@]}" "${SHOW_EXECUTOR_DESIGN[@]}" "${SHOW_EVIDENCE_SCHEMA[@]}" "${SHOW_ARTIFACTS[@]}" "${SHOW_PROFILE_CONFIG[@]}" "${SHOW_HEALTH_CHECKS[@]}" "${SHOW_PREFLIGHT[@]}" "${GENERATE_INSTALL_KIT[@]}" "${GENERATE_PROFILE_PACKAGE[@]}" "${GENERATE_RELEASE_ARTIFACTS[@]}" "${PACKAGE_PLATFORM_ARGS[@]}" "${INSTALLER_VERSION_ARGS[@]}" "${RUN_CLEANROOM_PROOF[@]}" "${RUN_CLEANROOM_GATE[@]}" "${WRITE_REPORT[@]}" "${RUN_ID_ARGS[@]}" --readiness-scenario "${READINESS_SCENARIO}" "${APPROVAL_ARGS[@]}" "${MODULE_ARGS[@]}"
