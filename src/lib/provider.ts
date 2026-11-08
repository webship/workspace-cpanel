/**
 * cPanel, as a hosting provider.
 *
 * The link is `.cpanel/workspace.yml` (user, host, remote docroot); the account's domains come from
 * the UAPI over HTTPS with the account's API token from plugin.cpanel.settings.yml; the pulls, the
 * deploy and the log go over SSH through cmd-tools-cpanel.sh in a screen session.
 */

import type { PluginApi, PluginLib } from '@webship.co/workspace-plugin-api';
import { configured } from '@webship.co/workspace-hosting';
import type { EnvInfo, EnvRow, HostingLink, HostingProvider } from '@webship.co/workspace-hosting';

import { cpanelLinkOf } from './link';

export function cpanelProvider(api: PluginApi): HostingProvider {
  const settings = () => api.settings.read() || {};

  /** The token of one account: `api_tokens` is a map by user. */
  const tokenFor = (user: string): string | null => {
    const map = settings().api_tokens;
    if (map && typeof map === 'object') return configured((map as Record<string, unknown>)[user]);
    return null;
  };

  const jobEnv = (): NodeJS.ProcessEnv | null => {
    const map = settings().api_tokens;
    const any = map && typeof map === 'object' && Object.values(map as Record<string, unknown>).some((v) => configured(v));
    return any ? { ...process.env, CPANEL_API_TOKENS: JSON.stringify(map), CPANEL_SSH_KEY: String(settings().ssh_key || '~/.ssh/id_ed25519') } : null;
  };

  async function environments(link: HostingLink, lib: PluginLib, env: NodeJS.ProcessEnv): Promise<EnvInfo> {
    const fields = (link as any).fields || {};
    const user = fields.user; const host = fields.host;
    const id = link.id as string;
    const token = user ? tokenFor(user) : null;
    if (!token) return { id, rows: [], why: `no token for ${user || 'the account'}` };
    const out = await lib.run('curl', ['-sS', '-k', '-m', '30', '-H', `Authorization: cpanel ${user}:${token}`, `https://${host}:2083/execute/DomainInfo/list_domains`],
      process.env.HOME, { timeoutMs: 40 * 1000, env });
    if (!out.ok) return { id, rows: [], why: 'list failed' };
    let data: any;
    try { data = JSON.parse(String(out.stdout)).data || {}; } catch (_) { return { id, rows: [], why: 'list failed' }; }
    const rows: EnvRow[] = [];
    if (data.main_domain) rows.push({ title: `${data.main_domain} (main)`, envId: data.main_domain, status: 'active', url: `https://${data.main_domain}` });
    for (const d of [...(data.addon_domains || []), ...(data.sub_domains || [])]) rows.push({ title: d, envId: d, status: 'active', url: `https://${d}` });
    for (const d of data.parked_domains || []) rows.push({ title: `${d} (alias)`, envId: d, status: 'alias' });
    return { id, rows };
  }

  return {
    id: 'cpanel',
    label: 'CPANEL',
    title: 'cPanel',
    script: 'cmd-tools-cpanel.sh',
    detect: (projectDir) => cpanelLinkOf(projectDir),
    linkHint: (project) => `bash cmd-tools-cpanel.sh ${project} --link user@host:/home/user/public_html`,
    consoleUrl: (link) => { const h = (link as any).fields && (link as any).fields.host; return h ? `https://${h}:2083/` : null; },
    jobEnv,
    tokenHint: 'api_tokens (by cPanel user) in core/config/plugin.cpanel.settings.yml',
    environments,
    tools: {
      status: { verb: 'cpanel', label: 'Link and domains', icon: 'info', args: [] },
      logs: { verb: 'cpanel-logs', label: 'Last 50 lines of error_log', icon: 'file-text', args: ['--logs'] },
      deploy: { verb: 'cpanel-push', label: 'Deploy with rsync…', icon: 'push', args: ['--push'] },
    },
    pull: {
      db: true, files: true,
      dbArgs: (e) => ['--environment', e, '--pull-db'],
      filesArgs: (e) => ['--environment', e, '--pull-files'],
      noSafetyBackupArg: '--no-safety-backup',
    },
    folder: {
      idPattern: /^[a-z0-9_.-]+@[a-z0-9.-]+:\/.+$/i,
      idPlaceholder: 'webshipco@server.example.com:/home/webshipco/public_html',
      idHelp: 'A cPanel link is user@host:/remote/docroot — the account user, the server, and the site\'s document root on it.',
    },
    menuNote: 'The pulls, the deploy and the log go over SSH with the key in the settings; the API token only lists domains',
  };
}
