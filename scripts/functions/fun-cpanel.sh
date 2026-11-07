#!/usr/bin/env bash

# cPanel accounts: the UAPI over HTTPS (port 2083, an API token per account) for the domains, and
# SSH for everything that touches the site (the database dump, the files, the deploy, the log). The
# hooks the hosting dispatcher (fun-cpanel-tool.sh) calls for one project directory. Everything
# defaults to read-only; --link, --push, --pull-db and --pull-files each demand their flag.

# The dashboard passes the tokens map as CPANEL_API_TOKENS (JSON by user) and the key as
# CPANEL_SSH_KEY; on the host they come from core/config/plugin.cpanel.settings.yml.
function cpanel_token_for() {
  local user="$1";
  if [ -n "${CPANEL_API_TOKENS:-}" ] ; then
    printf '%s' "${CPANEL_API_TOKENS}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1],""))' "${user}" 2>/dev/null ;
  else
    python3 - "${WORKSPACE_CONFIG}/plugin.cpanel.settings.yml" "${user}" <<'PY' 2>/dev/null
import re,sys,io
s=io.open(sys.argv[1],encoding='utf-8').read()
m=re.search(r'^api_tokens:\s*(\{.*\})\s*$', s, re.M)
if m:
    body=m.group(1).strip('{}')
    for pair in body.split(','):
        if ':' in pair:
            k,v=pair.split(':',1)
            if k.strip().strip('"\'')==sys.argv[2]: print(v.strip().strip('"\'')); break
PY
  fi
}

function cpanel_ssh_key() {
  local k="${CPANEL_SSH_KEY:-${ssh_key:-~/.ssh/id_ed25519}}";
  printf '%s' "${k/#\~/${HOME}}";
}

function ensure_cpanel() {
  for tool in ssh rsync curl python3 ; do
    command -v "${tool}" > /dev/null 2>&1 || { echo "${tool} is not installed, and the cPanel tool needs it."; return 1; } ;
  done
  return 0 ;
}

# The link is user@host:/remote/docroot, kept as three keys; the id the dashboard shows is user@host.
function cpanel_do_link() {
  local project_path="$1" spec="$2" user host remote;
  [[ "${spec}" =~ ^([^@]+)@([^:]+):(/.+)$ ]] || { echo "A cPanel link is user@host:/remote/docroot, got: ${spec}"; return 1; } ;
  user="${BASH_REMATCH[1]}"; host="${BASH_REMATCH[2]}"; remote="${BASH_REMATCH[3]}";
  cpanel_link_set "${project_path}" id "${user}@${host}" ;
  cpanel_link_set "${project_path}" user "${user}" ;
  cpanel_link_set "${project_path}" host "${host}" ;
  cpanel_link_set "${project_path}" remote "${remote}" ;
  if ssh -i "$(cpanel_ssh_key)" -o BatchMode=yes -o ConnectTimeout=10 "${user}@${host}" "test -d '${remote}'" 2>/dev/null ; then
    echo "  SSH reaches ${user}@${host} and ${remote} exists." ;
  else
    echo "  SSH could not reach ${user}@${host} with $(cpanel_ssh_key) (or ${remote} is missing): authorize the key in cPanel → Security → SSH Access." ;
  fi
}

function cpanel_uapi() {
  local project_path="$1" call="$2" user host token;
  user="$(cpanel_link_get "${project_path}" user)"; host="$(cpanel_link_get "${project_path}" host)";
  token="$(cpanel_token_for "${user}")";
  [ -z "${token}" ] && { echo "No API token for cPanel user ${user} in plugin.cpanel.settings.yml (api_tokens)." >&2; return 1; } ;
  curl -sS -k -m 30 -H "Authorization: cpanel ${user}:${token}" "https://${host}:2083/execute/${call}" ;
}

function cpanel_list_environments() {
  cpanel_uapi "$1" DomainInfo/list_domains | python3 -c 'import json,sys
d=json.load(sys.stdin).get("data",{})
for x in [d.get("main_domain")]+d.get("addon_domains",[])+d.get("sub_domains",[]):
    if x: print(x)' 2>/dev/null ;
}

function cpanel_do_environments() {
  local project_path="$1";
  cpanel_uapi "${project_path}" DomainInfo/list_domains | python3 -c 'import json,sys
d=json.load(sys.stdin).get("data",{})
print("  %-40s %s" % (d.get("main_domain",""), "main   https://"+d.get("main_domain","")))
for x in d.get("addon_domains",[]): print("  %-40s %s" % (x, "addon  https://"+x))
for x in d.get("sub_domains",[]): print("  %-40s %s" % (x, "sub    https://"+x))
for x in d.get("parked_domains",[]): print("  %-40s %s" % (x, "alias"))' || return 1 ;
  cpanel_uapi "${project_path}" Quota/get_quota_info 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin).get("data",{})
print("  disk: %s MB of %s MB" % (d.get("megabytes_used","?"), d.get("megabyte_limit","?")))' 2>/dev/null ;
}

function cpanel_ssh() {
  local project_path="$1"; shift;
  ssh -i "$(cpanel_ssh_key)" -o BatchMode=yes -o ConnectTimeout=15 "$(cpanel_link_get "${project_path}" id)" "$@" ;
}

function cpanel_pull_db() {
  local project_path="$1" acct="$2" env="$3" stamp out dump safety remote;
  remote="$(cpanel_link_get "${project_path}" remote)";
  stamp="$(date +%Y-%m-%d-%H%M%S)";
  out="${backups}/${doc_name}/${PROJECT_NAME}";
  mkdir -p "${out}" ;
  dump="${out}/${PROJECT_NAME}-cpanel-${env}-${stamp}.sql.gz";
  safety="${out}/${PROJECT_NAME}-before-cpanel-pull-${stamp}.sql.gz";
  echo "";
  echo "Pulling the database of ${env} on ${acct} (drush sql:dump in ${remote}).";
  echo "  This is client data: it lands on this machine and in ${out}.";
  echo "";
  cpanel_safety_export "${project_path}" "${safety}" ;
  echo "Dumping over SSH.";
  cpanel_ssh "${project_path}" "cd '${remote}' && (command -v drush >/dev/null 2>&1 && drush sql:dump --gzip || ../vendor/bin/drush sql:dump --gzip)" > "${dump}" || return 1 ;
  [ -s "${dump}" ] || { echo "The dump is empty — is drush on the server (vendor/bin/drush beside the docroot)?"; return 1; } ;
  cpanel_import_dump "${project_path}" "${dump}" || return 1 ;
  echo "";
  echo "  Imported ${env} into ${doc_name}/${PROJECT_NAME}.";
  echo "    pulled dump:   ${dump}";
  echo "    local backup:  ${safety}";
}

function cpanel_pull_files() {
  local project_path="$1" acct="$2" env="$3" docroot remote;
  remote="$(cpanel_link_get "${project_path}" remote)";
  docroot="$(cpanel_docroot "${project_path}")";
  [ -z "${docroot}" ] && { echo "No web/ or docroot/ in ${doc_name}/${PROJECT_NAME} — nothing to pull files into."; return 1; } ;
  echo "";
  echo "rsync ${acct}:${remote}/sites/default/files → ${docroot}/sites/default/files (adds and overwrites, never deletes).";
  mkdir -p "${project_path}/${docroot}/sites/default/files" ;
  rsync -az --info=progress2 -e "ssh -i $(cpanel_ssh_key) -o BatchMode=yes" "${acct}:${remote}/sites/default/files/" "${project_path}/${docroot}/sites/default/files/" || return 1 ;
  echo "  If Drupal still shows broken images: ddev drush cr";
}

function cpanel_do_push() {
  local project_path="$1" acct="$2" env="$3" docroot remote a;
  remote="$(cpanel_link_get "${project_path}" remote)";
  docroot="$(cpanel_docroot "${project_path}")";
  [ -z "${docroot}" ] && { echo "No web/ or docroot/ in ${doc_name}/${PROJECT_NAME} — nothing to deploy."; return 1; } ;
  echo "Deploy ${docroot}/ of ${doc_name}/${PROJECT_NAME} → ${acct}:${remote}/ (${env})";
  echo "  rsync --delete, excluding sites/default/files, sites/*/settings*.php, .git, .ddev. The live site changes.";
  read -r -p "  Continue? [y/N] " a < /dev/tty || return 1 ;
  [[ "${a}" =~ ^[Yy] ]] || { echo "Not deployed."; return 1; } ;
  rsync -az --delete --info=progress2 -e "ssh -i $(cpanel_ssh_key) -o BatchMode=yes" \
    --exclude 'sites/default/files' --exclude 'sites/*/settings*.php' --exclude '.git' --exclude '.ddev' \
    "${project_path}/${docroot}/" "${acct}:${remote}/" || return 1 ;
  if [ -d "${project_path}/vendor" ] ; then
    echo "  vendor/ is beside the docroot locally: syncing it to $(dirname "${remote}")/vendor/ too.";
    rsync -az --delete -e "ssh -i $(cpanel_ssh_key) -o BatchMode=yes" "${project_path}/vendor/" "${acct}:$(dirname "${remote}")/vendor/" || return 1 ;
  fi
  echo "  Deployed. Clear caches on the server: ssh ${acct} 'cd ${remote} && drush cr'";
}

function cpanel_do_logs() {
  local project_path="$1" remote;
  remote="$(cpanel_link_get "${project_path}" remote)";
  cpanel_ssh "${project_path}" "for f in '${remote}/error_log' \"\$HOME/logs/\"*error_log; do [ -f \"\$f\" ] && { echo \"— \$f —\"; tail -50 \"\$f\"; }; done" ;
}

function cpanel_status() {
  local project_path="$1" acct="$2";
  if [ -z "${acct}" ] ; then
    echo "    (the link is user@host:/remote/docroot)";
    return 0 ;
  fi
  echo "    remote:  $(cpanel_link_get "${project_path}" remote)";
  echo "";
  cpanel_do_environments "${project_path}" ;
  echo "";
  echo "  Console: https://$(cpanel_link_get "${project_path}" host):2083/";
  echo "  Data: --pull-db and --pull-files bring the site down into DDEV over SSH; --push deploys with rsync.";
}
