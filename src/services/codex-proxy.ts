import { adminFetch } from '@/src/lib/admin-fetch';
import type {
  AccountTodayStats,
  AdminAccount,
  AdminAccountExtra,
  AdminGroup,
  AdminSettings,
  CodexUsageSummary,
  DashboardModelStats,
  DashboardStats,
  DashboardTrend,
  PaginatedData,
  TrendPoint,
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
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([kmgtb])?$/i);
  if (!match) return toNumber(normalized);

  const base = Number(match[1]);
  const multiplier = {
    k: 1_000,
    m: 1_000_000,
    g: 1_000_000_000,
    b: 1_000_000_000,
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

function getCodexRangeTime(rangeKey: '24h' | '7d' | '30d' = '7d') {
  const now = new Date();
  let startTime: string;
  const endTime = now.toISOString();

  if (rangeKey === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    startTime = d.toISOString();
  } else if (rangeKey === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    startTime = d.toISOString();
  } else {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    startTime = d.toISOString();
  }

  return { startTime, endTime };
}

export async function getCodexProxyDashboardStats(params?: {
  rangeKey?: '24h' | '7d' | '30d';
  start_date?: string;
  end_date?: string;
}) {
  const summaryPromise = adminFetch<CodexDashboardSummary>('/api/admin/dashboard/summary?kind=usage');

  const { startTime, endTime } = getCodexRangeTime(params?.rangeKey);
  const usageQuery = buildQuery({ startTime, endTime });
  const usageSummaryPromise = adminFetch<CodexUsageSummary>(`/api/admin/usage/records/summary${usageQuery}`).catch(() => null);

  const [summary, usageSummary] = await Promise.all([summaryPromise, usageSummaryPromise]);

  const cards = summary.cards ?? {};
  const credentials = cards.credentials ?? {};
  const traffic = cards.traffic ?? {};
  const tokens = cards.tokens ?? {};
  const totalAccounts = credentials.totalValue ?? 0;

  const totalRequestsNum = parseCompactNumber(usageSummary?.totalRequests) ?? traffic.totalRequestsValue ?? parseCompactNumber(traffic.totalRequests) ?? 0;
  const totalTokensNum = parseCompactNumber(usageSummary?.totalTokens) ?? tokens.totalTokensValue ?? parseCompactNumber(tokens.totalTokens) ?? 0;
  const inputTokensNum = parseCompactNumber(usageSummary?.inputTokens) ?? 0;
  const outputTokensNum = parseCompactNumber(usageSummary?.outputTokens) ?? 0;
  const cachedTokensNum = parseCompactNumber(usageSummary?.cachedTokens) ?? 0;

  return {
    total_users: 0,
    today_new_users: 0,
    active_users: 0,
    total_api_keys: 0,
    active_api_keys: 0,
    total_accounts: totalAccounts,
    normal_accounts: credentials.availableValue ?? 0,
    error_accounts: credentials.unavailableValue ?? 0,
    total_requests: totalRequestsNum,
    total_cost: parseMoney(tokens.totalBillingAmountUsd),
    total_tokens: totalTokensNum,
    today_requests: totalRequestsNum,
    today_cost: 0,
    today_tokens: totalTokensNum,
    today_input_tokens: inputTokensNum,
    today_output_tokens: outputTokensNum,
    today_cache_read_tokens: cachedTokensNum,
    rpm: 0,
    tpm: 0,
    codex_usage_summary: usageSummary ?? undefined,
  } satisfies DashboardStats;
}

export async function getCodexProxyDashboardTrend(params?: {
  rangeKey?: '24h' | '7d' | '30d';
  start_date?: string;
  end_date?: string;
}) {
  const { startTime, endTime } = getCodexRangeTime(params?.rangeKey);

  try {
    const overviewQuery = buildQuery({ startTime, endTime });
    const overview = await adminFetch<{
      granularity?: string;
      health?: {
        points?: Array<{
          bucket?: string;
          totalRequests?: number;
          successRequests?: number;
          failedRequests?: number;
        }>;
      };
      cost?: {
        points?: Array<{
          bucket?: string;
          label?: string;
          inputTokens?: number;
          outputTokens?: number;
          cachedTokens?: number;
          totalTokens?: number;
          estimatedCost?: number;
        }>;
      };
    }>(`/api/admin/usage/insights/overview${overviewQuery}`);

    const costPoints = overview.cost?.points ?? [];
    const healthPoints = overview.health?.points ?? [];

    if (costPoints.length > 0 || healthPoints.length > 0) {
      const maxLen = Math.max(costPoints.length, healthPoints.length);
      const points: TrendPoint[] = [];

      for (let i = 0; i < maxLen; i++) {
        const cp = costPoints[i];
        const hp = healthPoints[i];
        const date = cp?.bucket ?? hp?.bucket ?? cp?.label ?? '';
        const requests = hp?.totalRequests ?? hp?.successRequests ?? 0;
        const input_tokens = cp?.inputTokens ?? 0;
        const output_tokens = cp?.outputTokens ?? 0;
        const cache_read_tokens = cp?.cachedTokens ?? 0;
        const total_tokens = cp?.totalTokens ?? (input_tokens + output_tokens);
        const cost = cp?.estimatedCost ?? 0;

        points.push({
          date,
          requests,
          input_tokens,
          output_tokens,
          cache_creation_tokens: 0,
          cache_read_tokens,
          total_tokens,
          cost,
          actual_cost: cost,
        });
      }

      if (points.length > 0) {
        return {
          start_date: points[0]?.date ?? '',
          end_date: points.at(-1)?.date ?? '',
          granularity: overview.granularity ?? 'day',
          trend: points,
        } satisfies DashboardTrend;
      }
    }
  } catch {
    // Fall back to standard dashboard trend
  }

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
