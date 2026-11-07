#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The project directory in this workspace.')
parser.add_argument('-l', '--link',
                    default="_none_",
                    help='Link the project to a cPanel account and site: user@host:/remote/docroot (the account user, the server host, the site's document root on it).')
parser.add_argument('-p', '--push',
                    action='store_true',
                    default=False,
                    help='Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing.')
parser.add_argument('-e', '--environment',
                    default="_none_",
                    help='The domain for THIS run (an account can serve several). Default: the one remembered by --select.')
parser.add_argument('-E', '--environments',
                    action='store_true',
                    default=False,
                    help='List the account's domains (UAPI DomainInfo::list_domains) and disk usage.')
parser.add_argument('-s', '--select',
                    default="_none_",
                    help='Remember which domain this project works against (in .cpanel/workspace.yml, git-excluded). Checked against the account's domains.')
parser.add_argument('-D', '--pull-db',
                    action='store_true',
                    default=False,
                    help='Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data.')
parser.add_argument('-F', '--pull-files',
                    action='store_true',
                    default=False,
                    help='rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data.')
parser.add_argument('-g', '--logs',
                    action='store_true',
                    default=False,
                    help='Show the last 50 lines of the site's error_log over SSH.')
parser.add_argument('-B', '--no-safety-backup',
                    action='store_true',
                    default=False,
                    help='Skip exporting the local database before --pull-db replaces it.')
parser.add_argument('-f', '--force',
                    action='store_true',
                    default=False,
                    help='Allow --link to relink a project that already points at a different account.')
ARGEOF
