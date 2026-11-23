#!/usr/bin/env bash
# security-scan.sh — รัน DevSecOps scans ในเครื่องผ่าน Docker images (ไม่ต้องติดตั้ง tools)
# ใช้: ./scripts/security-scan.sh [gitleaks|semgrep|trivy|all]   (default: all)
# ต้องมี docker daemon ทำงานอยู่
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Git Bash path (/c/...) → Windows path สำหรับ docker -v mount
ROOT_MNT="$(cygpath -m "$ROOT" 2>/dev/null || echo "$ROOT")"
WHAT="${1:-all}"

echo "==> security-scan: $WHAT (repo: $ROOT)"

run_gitleaks() {
  echo "--- gitleaks: secret scan (git history) ---"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$ROOT_MNT:/repo" zricethezav/gitleaks:latest \
    git --verbose --redact /repo
}

run_semgrep() {
  echo "--- semgrep: SAST (ERROR severity) ---"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$ROOT_MNT:/src" semgrep/semgrep \
    semgrep scan --config p/javascript --config p/typescript --config p/nodejs \
    --config p/owasp-top-ten --config p/secrets --severity ERROR --error /src/server/src /src/client/src /src/scripts /src/tests
}

run_trivy() {
  echo "--- trivy: filesystem vuln scan (CRITICAL,HIGH) ---"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$ROOT_MNT:/repo" aquasec/trivy:latest fs \
    --severity CRITICAL,HIGH --ignore-unfixed --scanners vuln,secret /repo
  echo "--- trivy: IaC config scan ---"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$ROOT_MNT:/repo" aquasec/trivy:latest config \
    --severity CRITICAL,HIGH /repo
}

case "$WHAT" in
  gitleaks) run_gitleaks ;;
  semgrep)  run_semgrep ;;
  trivy)    run_trivy ;;
  all)      run_gitleaks; run_semgrep; run_trivy ;;
  *) echo "usage: $0 [gitleaks|semgrep|trivy|all]" >&2; exit 2 ;;
esac
echo "==> done"
