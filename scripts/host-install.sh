#!/usr/bin/env bash
## The host side of the cPanel plugin: the CLI on this machine and the dashboard's credentials.
## Run by core/scripts/plugins.sh --install cpanel, and by core/scripts/install.sh for every installed
## plugin that ships one. Idempotent: whatever is already there is reported, not redone. Offered,
## never automatic: a hosting CLI carries cloud credentials for real environments.
set -u
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)}";

STATE="$(grep -E '^api_tokens:' "${WORKSPACE_ROOT}/core/config/plugin.cpanel.settings.yml" 2>/dev/null | head -1 | sed -E 's/^[a-z_]+:[[:space:]]*//')";
case "${STATE}" in
  ''|CHANGE_ME|"''"|'""') printf '  ✗ %-16s %s\n' "api_tokens" "not set in plugin.cpanel.settings.yml — the dashboard cannot reach cPanel" ;;
  *)                       printf '  ✓ %-16s %s\n' "api_tokens" "set (plugin.cpanel.settings.yml)" ;;
esac

