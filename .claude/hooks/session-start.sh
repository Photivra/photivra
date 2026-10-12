#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Claude Code cloud SessionStart hook: provide the pinned Node version and the
# repository's dependencies before work starts. Does nothing outside cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

log() { echo "[session-start] $*" >&2; }

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

NODE_VERSION=24.21.0
if [ -f .node-version ]; then
  NODE_VERSION=$(tr -d '[:space:]' < .node-version)
  NODE_VERSION=${NODE_VERSION#v}
fi
case "$NODE_VERSION" in
  *[!0-9.]* | "" ) log "invalid .node-version: $NODE_VERSION"; exit 1 ;;
esac
NODE_DIR="/opt/node$NODE_VERSION"

if [ "$(node --version 2>/dev/null || true)" = "v$NODE_VERSION" ]; then
  log "node v$NODE_VERSION already active"
else
  if [ ! -x "$NODE_DIR/bin/node" ] || [ "$("$NODE_DIR/bin/node" --version)" != "v$NODE_VERSION" ]; then
    log "installing node v$NODE_VERSION from nodejs.org"
    file="node-v$NODE_VERSION-linux-x64.tar.xz"
    base="https://nodejs.org/dist/v$NODE_VERSION"
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    curl -fsSL "$base/$file" -o "$tmp/$file"
    curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
    expected=$(awk -v f="$file" '$2 == f { print $1 }' "$tmp/SHASUMS256.txt")
    actual=$(sha256sum "$tmp/$file" | awk '{ print $1 }')
    if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
      log "sha256 mismatch for $file"
      exit 1
    fi
    rm -rf "$NODE_DIR.partial"
    mkdir -p "$NODE_DIR.partial"
    tar -xJf "$tmp/$file" -C "$NODE_DIR.partial" --strip-components=1
    rm -rf "$NODE_DIR"
    mv "$NODE_DIR.partial" "$NODE_DIR"
  fi
  export PATH="$NODE_DIR/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
  log "using $(node --version)"
fi

log "installing dependencies (npm ci)"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci >&2
log "done"
