---
name: cpanel-hosting
description: Work with a Webship Workspace site on cPanel through the cPanel plugin (`@webship.co/workspace-cpanel`) — the CPANEL menu of a project row and the command behind every entry, `cmd-tools-cpanel.sh`, with each of its options, how a project is linked, the keys of `plugin.cpanel.settings.yml` and the credential they hold, and what the command says when something is missing. Use when asked "is this site linked to cPanel", "link this project", "list the environments", "what was deployed last", "get the live database", "deploy this site", "the menu says not linked", or "where does the cPanel token go".
argument-hint: '<project>'
---

# cpanel-hosting

cPanel for a site of a Webship Workspace (`~/workspace`, container-based, DDEV by default). It comes
with the cPanel plugin (`@webship.co/workspace-cpanel`), a provider of the hosting family (`@webship.co/workspace-hosting`),
like the agent `cpanel-deployer`, the command `/cpanel-status` and the prompt `cpanel-test-then-deploy`.

## The CPANEL menu

The CPANEL menu is on the project rows of the sites folders. The caption beside it says `linked`
or `not linked`. A project that is not linked is shown how to link it; a linked one gets these
entries, and each of them runs the command of the plugin in a terminal session, from the sites
folder:

| Menu entry | The command |
| --- | --- |
| **Link and domains** | `bash cmd-tools-cpanel.sh <project>` |
| **Last 50 lines of error_log** | `bash cmd-tools-cpanel.sh <project> --logs` |
| **Deploy with rsync…** | `bash cmd-tools-cpanel.sh <project> --push` |

The menu ends with the note "The pulls, the deploy and the log go over SSH with the key in the settings; the API token only lists domains".

### Get the live data

The menu also offers to get the database and the files of an environment into the local site. From a terminal:

| What | The command | What it does |
| --- | --- | --- |
| The database | `bash cmd-tools-cpanel.sh <project> --environment <environment> --pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| The files | `bash cmd-tools-cpanel.sh <project> --environment <environment> --pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |

## The command

`cmd-tools-cpanel.sh` is placed in every sites folder of the workspace. The first word after it is the
project; with nothing else it says whether the project is linked, and to what.

```bash
cd ~/workspace/<folder>
bash cmd-tools-cpanel.sh <project>
bash cmd-tools-cpanel.sh <project> --link user@host:/home/user/public_html
bash cmd-tools-cpanel.sh <project> --environments
```

| Option | What it does |
| --- | --- |
| `--link <value>` | Link the project to a cPanel account and site: user@host:/remote/docroot (the account user, the server host, the site's document root on it). |
| `--push` | Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing. |
| `--environment <value>` | The domain for THIS run (an account can serve several). Default: the one remembered by --select. |
| `--environments` | List the account's domains (UAPI DomainInfo::list_domains) and disk usage. |
| `--select <value>` | Remember which domain this project works against (in .cpanel/workspace.yml, git-excluded). Checked against the account's domains. |
| `--pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| `--pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |
| `--logs` | Show the last 50 lines of the site's error_log over SSH. |
| `--no-safety-backup` | Skip exporting the local database before --pull-db replaces it. |
| `--force` | Allow --link to relink a project that already points at a different account. |

With no project the command says that `PROJECT_NAME` is required; with a project that is not in
the folder, "No such project"; with an option that needs a link on a project that has none, "Not
linked to cPanel".

## Link a project

A project is linked to a cPanel account and a site on it: `user@host:/remote/docroot`, the account user, the server, and the document root of the site there. The link is written to `.cpanel/workspace.yml` in the project, which git does not track. A cPanel link is user@host:/remote/docroot — the account user, the server, and the site's document root on it.

```bash
bash cmd-tools-cpanel.sh <project> --link user@host:/home/user/public_html
```

## The settings: `core/config/plugin.cpanel.settings.yml`

| Key | What it is |
| --- | --- |
| `api_tokens:` | A map of cPanel user → API token (cPanel → Security → Manage API Tokens), one per account the dashboard lists domains for. Example: a nested map, one user per line. Injected only into cPanel jobs, never printed. |
| `ssh_key:` | The private key the pulls and deploys use to reach the accounts over SSH (authorized in cPanel → Security → SSH Access). Default: ~/.ssh/id_ed25519. |

The dashboard reaches cPanel with api_tokens (by cPanel user) in core/config/plugin.cpanel.settings.yml. The file is created mode 600 and its secrets are
masked on the Settings page. Never print them, never copy them into another file, and never commit
the file.

## Turn it on, and check it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-cpanel
bash core/scripts/plugins.sh --activate cpanel --with-needs     # adds a sites folder and the AI folders when they are missing
bash core/scripts/plugins.sh --install cpanel
bash core/scripts/plugins.sh --configure cpanel
bash core/scripts/plugins.sh --check cpanel                     # the commands it needs on the machine
```

## Traps

- **Two ways in, for two things.** The API token (`api_tokens:`, one per cPanel user) only lists the domains of the account; the pulls, the deploy and the log go over SSH with the key in `ssh_key:`.
- **"no token for <user>"**: `api_tokens:` has no entry for the user of the link.
- **A deploy is an rsync that deletes**: it syncs the local docroot to the remote document root and removes there what is gone here. It leaves `sites/default/files`, `settings.php`, `.git` and `.ddev` alone, and asks before it syncs.
- **The database pull runs `drush sql:dump` in the remote docroot**, over SSH: the site there needs drush. It replaces the local database; the current one is exported to `backups/` first, unless `--no-safety-backup` was given.
- **An account can serve several domains**: `--environment` names the domain for one run, `--select` remembers it.
- **A deploy is outward-facing.** The command asks before it sends anything, in a terminal: it is
  not a step for an AI assistant to take on its own.
