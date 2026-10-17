#!/bin/sh
# agent-notifier installer
#
#   curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh | sh
#
# Options (pass after `| sh -s --`):
#   --version <ver>     npm version/tag to install (default: latest)
#   --prefix <dir>      install into <dir>/bin instead of the global prefix
#   --minimal           install the CLI only; skip the interactive setup
#   --no-run            install the CLI only (same as --minimal)
#   -h, --help          show this help
#
# Environment:
#   AGENT_NOTIFIER_VERSION   same as --version
#   AGENT_NOTIFIER_PREFIX    same as --prefix
#   AGENT_NOTIFIER_NPM       npm binary to use (default: npm)
#   AGENT_NOTIFIER_SPEC      full npm spec override (e.g. a local .tgz)

set -eu

PKG="agent-notifier"
NPM_PKG="@hancic128/agent-notifier"
VERSION="${AGENT_NOTIFIER_VERSION:-latest}"
PREFIX="${AGENT_NOTIFIER_PREFIX:-}"
NPM="${AGENT_NOTIFIER_NPM:-npm}"
SPEC_OVERRIDE="${AGENT_NOTIFIER_SPEC:-}"
RUN_SETUP=1

usage() {
  cat <<'EOF'
agent-notifier installer

  curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh | sh

Options (pass after `| sh -s --`):
  --version <ver>     npm version/tag to install (default: latest)
  --prefix <dir>      install into <dir>/bin instead of the global prefix
  --minimal           install the CLI only; skip the interactive setup
  --no-run            install the CLI only (same as --minimal)
  -h, --help          show this help

Environment:
  AGENT_NOTIFIER_VERSION   same as --version
  AGENT_NOTIFIER_PREFIX    same as --prefix
  AGENT_NOTIFIER_NPM       npm binary to use (default: npm)
  AGENT_NOTIFIER_SPEC      full npm spec override (e.g. a local .tgz)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version requires a value}"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    --prefix) PREFIX="${2:?--prefix requires a value}"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --minimal|--no-run) RUN_SETUP=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

say ""
say "agent-notifier installer"
say ""

# ---------------------------------------------------------------- Node check

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is required but was not found.

  Install Node.js >= 20 first:
    macOS:   brew install node
    Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
    Other:   https://nodejs.org/en/download

  Then re-run this installer."
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js >= 20 is required (found $(node -v)). Please upgrade and re-run."
fi
ok "Node $(node -v)"

if ! command -v "$NPM" >/dev/null 2>&1; then
  die "npm was not found. It normally ships with Node.js — reinstall Node or set AGENT_NOTIFIER_NPM."
fi
ok "npm $("$NPM" --version)"

# ---------------------------------------------------------------- install

SPEC="${SPEC_OVERRIDE:-$NPM_PKG@$VERSION}"

install_global() {
  "$NPM" install -g "$SPEC" --no-fund --no-audit >/dev/null 2>&1
}

say ""
say "Installing $SPEC …"

INSTALLED=0
INSTALL_DIR=""

if [ -n "$PREFIX" ]; then
  mkdir -p "$PREFIX"
  INSTALL_DIR="$PREFIX/bin"
  "$NPM" install -g "$SPEC" --prefix "$PREFIX" --no-fund --no-audit >/dev/null 2>&1 \
    || die "npm install failed (prefix: $PREFIX)"
  INSTALLED=1
else
  # Try the default global prefix first.
  if install_global; then
    INSTALLED=1
    GLOBAL_BIN=$("$NPM" prefix -g 2>/dev/null)/bin
    [ -x "$GLOBAL_BIN/$PKG" ] && INSTALL_DIR="$GLOBAL_BIN"
  else
    # Most common failure is EACCES on /usr/local or /usr/lib.
    warn "Global npm install failed (likely permissions). Retrying into ~/.local …"
    mkdir -p "$HOME/.local"
    if "$NPM" install -g "$SPEC" --prefix "$HOME/.local" --no-fund --no-audit >/dev/null 2>&1; then
      INSTALLED=1
      INSTALL_DIR="$HOME/.local/bin"
    fi
  fi
fi

[ "$INSTALLED" -eq 1 ] || die "Installation failed. Try: sudo npm install -g $SPEC"

# ---------------------------------------------------------------- verify

say ""
if [ -n "$INSTALL_DIR" ] && [ -x "$INSTALL_DIR/$PKG" ]; then
  ok "Installed $("$INSTALL_DIR/$PKG" --version 2>/dev/null || echo "$VERSION") → $INSTALL_DIR/$PKG"
elif command -v "$PKG" >/dev/null 2>&1; then
  ok "Installed $("$PKG" --version 2>/dev/null || echo "$VERSION")"
else
  warn "Installed, but '$PKG' is not on PATH yet."
  [ -n "$INSTALL_DIR" ] && warn "Add it: export PATH=\"$INSTALL_DIR:\$PATH\""
fi

if [ -n "$INSTALL_DIR" ]; then
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) warn "'$INSTALL_DIR' is not in PATH — add it to your shell profile." ;;
  esac
fi

# ---------------------------------------------------------------- next step

if [ "$RUN_SETUP" -eq 0 ]; then
  say ""
  say "Done. Next: $PKG install"
  exit 0
fi

say ""
if [ -t 0 ] && [ -t 1 ]; then
  say "Starting interactive setup …"
  exec "$PKG" install
fi

# stdin is the downloaded script (curl | sh), so we cannot prompt here.
if [ -r /dev/tty ]; then
  say "Starting interactive setup (attached to terminal) …"
  exec "$PKG" install < /dev/tty
fi

say "Non-interactive shell detected. Run the setup manually:"
say ""
say "  $PKG install"
say ""