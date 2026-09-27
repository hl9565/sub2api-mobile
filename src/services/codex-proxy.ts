import { adminFetch } from '@/src/lib/admin-fetch';
import type {
  AccountTodayStats,
  AdminAccount,
  AdminAccountExtra,
  AdminGroup,
  AdminSettings,
  DashboardModelStats,
  DashboardStats,
  DashboardTrend,
  PaginatedData,
} from '@/src/types/admin';

type CodexQuotaWindow = {
  windowSeconds?: number | null;
  windowLabelDisplay?: string;
  labelDisplay?: string;
  usedPercent?: number | null;
  resetAtDisplay?: string;
};

type CodexAccount = {
  id: string;
  name: string;
  provider: string;
  authenticationKind: string;
  email?: string | null;
  status: string;
  errorMessage?: string | null;
  enabled: boolean;
  concurrencyLimit?: number | null;
  weight: number;
  updatedAt: string;
  quota: {
    windows: CodexQuotaWindow[];
  };
  usage: {
    requestCount?: number | null;
    totalTokens?: number | null;
    lastUsedAt?: string | null;
    costs?: Array<{ estimatedAmount?: string | null }>;
  };
  groups: Array<{ id: string; name: string; enabled: boolean }>;
};

type CodexAccountListResponse = {
  items: CodexAccount[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
};

type CodexAccountResponse = { account: CodexAccount };

type CodexGroup = {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type CodexGroupListResponse = {
  items: CodexGroup[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
};

type CodexDashboardSummary = {
  cards?: {
    credentials?: { totalValue?: number; availableValue?: number; unavailableValue?: number };
    traffic?: { todayRequestsValue?: number; totalRequests?: string; totalRequestsValue?: number };
    tokens?: { todayTokensValue?: number; totalTokens?: string; totalTokensValue?: number; totalBillingAmountUsd?: string };
  };
  accountUsage?: Array<{ requestCount?: number; tokens?: string; model?: string | null }>;
  usageRecords?: Array<{
    model?: string | null;
    tokenDetails?: { totalTokens?: number | null };
    billing?: { totalAmountDisplay?: string | null };
  }>;
};

type CodexDashboardTrend = {
  points?: Array<{
    bucket?: string;
    time?: string;
    requestsValue?: number;
    inputTokensValue?: number;
    outputTokensValue?: number;
    cachedTokensValue?: number;
  }>;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCompactNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().replace(/,/g, '');
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([kmgt])?$/i);
  if (!match) return toNumber(normalized);

  const base = Number(match[1]);
  const multiplier = {
    k: 1_000,
    m: 1_000_000,
    g: 1_000_000_000,
    t: 1_000_000_000_000,
  }[match[2]?.toLowerCase() ?? ''] ?? 1;

  const parsed = base * multiplier;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMoney(value: unknown) {
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUsageCost(account: CodexAccount) {
  return (account.usage.costs ?? []).reduce((total, cost) => total + parseMoney(cost.estimatedAmount), 0);
}

function getQuotaWindowKind(window: CodexQuotaWindow) {
  const label = `${window.windowLabelDisplay ?? ''} ${window.labelDisplay ?? ''}`.toLowerCase();
  const seconds = window.windowSeconds ?? 0;
  if (seconds >= 28 * 24 * 60 * 60 || /month|monthly|月/.test(label)) return '30d' as const;
  if ((seconds > 0 && seconds <= 8 * 60 * 60) || /5\s*h|5\s*hour/.test(label)) return '5h' as const;
  if (seconds >= 5 * 24 * 60 * 60 || /7\s*d|7\s*day|week/.test(label)) return '7d' as const;
  return undefined;
}

function mapQuotaExtra(account: CodexAccount): AdminAccountExtra {
  const extra: AdminAccountExtra = {
    today_requests: account.usage.requestCount ?? 0,
    today_tokens: account.usage.totalTokens ?? 0,
    today_cost: getUsageCost(account),
  };

  account.quota.windows.forEach((window) => {
    const kind = getQuotaWindowKind(window);
    if (!kind) return;
    extra[`codex_${kind}_used_percent`] = window.usedPercent ?? null;
    extra[`codex_${kind}_reset_label`] = window.resetAtDisplay ?? null;
  });

  return extra;
}

function mapCodexAccount(account: CodexAccount): AdminAccount {
  return {
    id: account.id,
    name: account.name,
    platform: account.provider,
    type: account.authenticationKind,
    status: account.status,
    schedulable: account.enabled,
    concurrency: account.concurrencyLimit ?? undefined,
    rate_multiplier: account.weight,
    error_message: account.errorMessage ?? undefined,
    updated_at: account.updatedAt,
    last_used_at: account.usage.lastUsedAt ?? null,
    group_ids: account.groups.map((group) => group.id),
    groups: account.groups.map((group) => ({
      id: group.id,
      name: group.name,
      platform: account.provider,
      status: group.enabled ? 'active' : 'disabled',
      account_count: undefined,
    })),
    extra: mapQuotaExtra(account),
  };
}

function toPaginatedData<T>(response: { items: T[]; page: { page: number; pageSize: number; total: number; totalPages: number } }): PaginatedData<T> {
  return {
    items: response.items,
    total: response.page.total,
    page: response.page.page,
    page_size: response.page.pageSize,
    pages: response.page.totalPages,
  };
}

export async function getCodexProxySettings() {
  const settings = await adminFetch<AdminSettings>('/api/admin/settings');
  return {
    ...settings,
    site_name: settings.site_name ?? 'Codex Proxy RS',
  };
}

export async function getCodexProxyDashboardStats() {
  const summary = await adminFetch<CodexDashboardSummary>('/api/admin/dashboard/summary?kind=usage');
  const cards = summary.cards ?? {};
  const credentials = cards.credentials ?? {};
  const traffic = cards.traffic ?? {};
  const tokens = cards.tokens ?? {};
  const totalAccounts = credentials.totalValue ?? 0;

  return {
    total_users: 0,
    today_new_users: 0,
    active_users: 0,
    total_api_keys: 0,
    active_api_keys: 0,
    total_accounts: totalAccounts,
    normal_accounts: credentials.availableValue ?? 0,
    error_accounts: credentials.unavailableValue ?? 0,
    total_requests: traffic.totalRequestsValue ?? parseCompactNumber(traffic.totalRequests) ?? 0,
    total_cost: parseMoney(tokens.totalBillingAmountUsd),
    total_tokens: tokens.totalTokensValue ?? parseCompactNumber(tokens.totalTokens) ?? 0,
    today_requests: traffic.todayRequestsValue ?? 0,
    today_cost: 0,
    today_tokens: tokens.todayTokensValue ?? 0,
    today_input_tokens: 0,
    today_output_tokens: 0,
    today_cache_read_tokens: 0,
    rpm: 0,
    tpm: 0,
  } satisfies DashboardStats;
}

export async function getCodexProxyDashboardTrend() {
  const response = await adminFetch<CodexDashboardTrend>('/api/admin/dashboard/trend?kind=usage');
  const trend = (response.points ?? []).map((point) => ({
    date: point.bucket ?? point.time ?? '',
    requests: point.requestsValue ?? 0,
    input_tokens: point.inputTokensValue ?? 0,
    output_tokens: point.outputTokensValue ?? 0,
    cache_creation_tokens: 0,
    cache_read_tokens: point.cachedTokensValue ?? 0,
    total_tokens: (point.inputTokensValue ?? 0) + (point.outputTokensValue ?? 0),
    cost: 0,
    actual_cost: 0,
  }));

  return {
    start_date: trend[0]?.date ?? '',
    end_date: trend.at(-1)?.date ?? '',
    granularity: 'day',
    trend,
  } satisfies DashboardTrend;
}

export async function getCodexProxyDashboardModels() {
  return {
    start_date: '',
    end_date: '',
    models: [],
  } satisfies DashboardModelStats;
}

export async function listCodexProxyAccounts(search = '') {
  const response = await adminFetch<CodexAccountListResponse>(`/api/admin/accounts${buildQuery({ page: 1, pageSize: 100, search: search.trim() })}`);
  return toPaginatedData({ ...response, items: response.items.map(mapCodexAccount) });
}

export async function getCodexProxyAccount(accountId: string) {
  const response = await adminFetch<CodexAccountResponse>(`/api/admin/accounts/detail${buildQuery({ accountId })}`);
  return mapCodexAccount(response.account);
}

export async function getCodexProxyAccountTodayStats(accountId: string): Promise<AccountTodayStats> {
  const account = await getCodexProxyAccount(accountId);
  return {
    requests: Number(account.extra?.today_requests ?? 0),
    tokens: Number(account.extra?.today_tokens ?? 0),
    cost: Number(account.extra?.today_cost ?? 0),
  };
}

export function refreshCodexProxyAccount(accountId: string) {
  return adminFetch<CodexAccountResponse>('/api/admin/accounts/refresh', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

export function refreshCodexProxyAccountQuota(accountId: string) {
  return adminFetch<CodexAccountResponse>('/api/admin/accounts/quota/refresh', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

export async function listCodexProxyGroups(search = '') {
  const response = await adminFetch<CodexGroupListResponse>(`/api/admin/account-groups${buildQuery({ page: 1, pageSize: 100, search: search.trim() })}`);
  const items: AdminGroup[] = response.items.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    platform: 'mixed',
    status: group.enabled ? 'active' : 'disabled',
    account_count: group.memberCount,
    created_at: group.createdAt,
    updated_at: group.updatedAt,
  }));
  return toPaginatedData({ ...response, items });
}
