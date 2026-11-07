/**
 * cPanel for Webship Workspace.
 *
 * The CPANEL menu on every site row, a live-site chip, the New-folder link option and the
 * `/cpanel-site/<workspace>/<project>` jump: all of it is the hosting family's surface
 * (@webship/workspace-hosting). This package is the cPanel provider plus what the installer places
 * (the per-workspace command, its bash functions, the settings template, the host install).
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from
 * the dashboard's own files.
 */

import type { PluginApi } from '@webship/workspace-plugin-api';
import { registerHosting } from '@webship/workspace-hosting';

import { cpanelProvider } from './lib/provider';

export { cpanelProvider };
export { cpanelLinkOf } from './lib/link';

export function register(api: PluginApi): void {
  registerHosting(api, cpanelProvider(api));
}
