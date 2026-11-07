# @webship/workspace-cpanel

cPanel for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **CPANEL**
menu on every site row, a live-site chip on the project card, "Link to cPanel" when a new folder is
made, and the `cmd-tools-cpanel.sh` command in every site workspace. A provider of
[`@webship/workspace-hosting`](https://github.com/webship/workspace-hosting), which draws the menu,
the environments modal, the get-database-and-files flow and the New-folder section for every host.

cPanel has no CLI of its own, so the dashboard talks to the UAPI over HTTPS (port 2083) with an API token per account, and the pulls, the deploy and the log go over SSH (`ssh`, `rsync`, `drush sql:dump` in the remote docroot). The link is `user@host:/home/user/public_html`; the environments are the account's domains, each a live site.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-cpanel
bash core/scripts/plugins.sh --activate cpanel
bash core/scripts/plugins.sh --install cpanel
bash core/scripts/plugins.sh --configure cpanel      # core/config/plugin.cpanel.settings.yml
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## The command

```bash
cd ~/workspace/dev
bash cmd-tools-cpanel.sh <project> [verb]
```

| Verb | What it does |
| --- | --- |
| `--link` <value> | Link the project to a cPanel account and site: user@host:/remote/docroot (the account user, the server host, the site's document root on it). |
| `--push` | Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing. |
| `--environment` <value> | The domain for THIS run (an account can serve several). Default: the one remembered by --select. |
| `--environments` | List the account's domains (UAPI DomainInfo::list_domains) and disk usage. |
| `--select` <value> | Remember which domain this project works against (in .cpanel/workspace.yml, git-excluded). Checked against the account's domains. |
| `--pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| `--pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |
| `--logs` | Show the last 50 lines of the site's error_log over SSH. |
| `--no-safety-backup` | Skip exporting the local database before --pull-db replaces it. |
| `--force` | Allow --link to relink a project that already points at a different account. |

The link lives in the project's `.cpanel/workspace.yml` (git-excluded); the dashboard reads it to know
the project is linked and which environment it works against.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerHosting(api, cpanelProvider(api))` |
| `src/lib/provider.ts` | The cPanel provider: the credentials, the environments and their URLs, the verbs, the pulls, the console |
| `src/lib/link.ts` | The link file reader |
| `commands/cmd-tools-cpanel.sh` | The per-workspace command |
| `scripts/functions/fun-cpanel.sh` | The provider's bash hooks (its API) |
| `scripts/functions/fun-cpanel-tool.sh` | The family's dispatcher: link file, environment selection, safety export, status |
| `scripts/args/arg-cpanel.sh` | Its argparse |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |
| `config/plugin.cpanel.settings.yml` | The settings template |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
