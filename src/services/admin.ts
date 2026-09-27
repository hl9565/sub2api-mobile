import { adminFetch } from '@/src/lib/admin-fetch';
import { adminConfigState } from '@/src/store/admin-config';
import {
  getCodexProxyAccount,
  getCodexProxyAccountTodayStats,
  getCodexProxyDashboardModels,
  getCodexProxyDashboardStats,
  getCodexProxyDashboardTrend,
  getCodexProxySettings,
  listCodexProxyAccounts,
  listCodexProxyGroups,
  refreshCodexProxyAccount,
  refreshCodexProxyAccountQuota,
} from '@/src/services/codex-proxy';
import type {
  AccountTodayStats,
  AdminAccount,
  AdminApiKey,
  AdminGroup,
  AdminSettings,
  AdminResourceId,
  AdminUser,
  BalanceOperation,
  DashboardModelStats,
  DashboardSnapshot,
  DashboardStats,
  DashboardTrend,
  CreateAccountRequest,
  CreateUserRequest,
  PaginatedData,
  UsageStats,
  UserUsageSummary,
} from '@/src/types/admin';

function isCodexProxyBackend() {
  return adminConfigState.backend === 'codex-proxy-rs';
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const value = query.toString();

  return value ? `?${value}` : '';
}

export function getDashboardStats() {
  if (isCodexProxyBackend()) return getCodexProxyDashboardStats();
  return adminFetch<DashboardStats>('/api/v1/admin/dashboard/stats');
}

export function getAdminSettings() {
  if (isCodexProxyBackend()) return getCodexProxySettings();
  return adminFetch<AdminSettings>('/api/v1/admin/settings');
}

export function getDashboardTrend(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  group_id?: number;
  user_id?: number;
}) {
  if (isCodexProxyBackend()) return getCodexProxyDashboardTrend();
  return adminFetch<DashboardTrend>(`/api/v1/admin/dashboard/trend${buildQuery(params)}`);
}

export function getDashboardModels(params: { start_date: string; end_date: string }) {
  if (isCodexProxyBackend()) return getCodexProxyDashboardModels();
  return adminFetch<DashboardModelStats>(`/api/v1/admin/dashboard/models${buildQuery(params)}`);
}

export function getDashboardSnapshot(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  user_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
  include_stats?: boolean;
  include_trend?: boolean;
  include_model_stats?: boolean;
  include_group_stats?: boolean;
  include_users_trend?: boolean;
}) {
  return adminFetch<DashboardSnapshot>(`/api/v1/admin/dashboard/snapshot-v2${buildQuery(params)}`);
}

export function getUsageStats(params: {
  start_date: string;
  end_date: string;
  user_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
}) {
  return adminFetch<UsageStats>(`/api/v1/admin/usage/stats${buildQuery(params)}`);
}

export function listUsers(search = '') {
  return adminFetch<PaginatedData<AdminUser>>(
    `/api/v1/admin/users${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getUser(userId: number) {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`);
}

export function createUser(body: CreateUserRequest) {
  return adminFetch<AdminUser>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getUserUsage(userId: number, period: 'day' | 'week' | 'month' = 'month') {
  return adminFetch<UserUsageSummary>(`/api/v1/admin/users/${userId}/usage${buildQuery({ period })}`);
}

export function listUserApiKeys(userId: number) {
  return adminFetch<PaginatedData<AdminApiKey>>(`/api/v1/admin/users/${userId}/api-keys${buildQuery({ page: 1, page_size: 100 })}`);
}

export function updateUserBalance(
  userId: number,
  body: { balance: number; operation: BalanceOperation; notes?: string }
) {
  return adminFetch<AdminUser>(
    `/api/v1/admin/users/${userId}/balance`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    {
      idempotencyKey: `user-balance-${userId}-${Date.now()}`,
    }
  );
}

export function updateUserStatus(userId: number, status: 'active' | 'disabled') {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function listGroups(search = '') {
  if (isCodexProxyBackend()) return listCodexProxyGroups(search);
  return adminFetch<PaginatedData<AdminGroup>>(
    `/api/v1/admin/groups${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getGroup(groupId: AdminResourceId) {
  if (isCodexProxyBackend()) {
    return Promise.reject(new Error('CODEX_PROXY_GROUP_DETAIL_UNSUPPORTED'));
  }
  return adminFetch<AdminGroup>(`/api/v1/admin/groups/${groupId}`);
}

export function listAccounts(search = '') {
  if (isCodexProxyBackend()) return listCodexProxyAccounts(search);
  return adminFetch<PaginatedData<AdminAccount>>(
    `/api/v1/admin/accounts${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getAccount(accountId: number | string) {
  if (isCodexProxyBackend()) return getCodexProxyAccount(String(accountId));
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}`);
}

export function createAccount(body: CreateAccountRequest) {
  if (isCodexProxyBackend()) return Promise.reject(new Error('CODEX_PROXY_ACCOUNT_CREATE_UNSUPPORTED'));
  return adminFetch<AdminAccount>('/api/v1/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getAccountTodayStats(accountId: number | string) {
  if (isCodexProxyBackend()) return getCodexProxyAccountTodayStats(String(accountId));
  return adminFetch<AccountTodayStats>(`/api/v1/admin/accounts/${accountId}/today-stats`);
}

export function testAccount(accountId: number | string) {
  if (isCodexProxyBackend()) return Promise.reject(new Error('CODEX_PROXY_ACCOUNT_TEST_UNSUPPORTED'));
  return adminFetch(`/api/v1/admin/accounts/${accountId}/test`, {
    method: 'POST',
  });
}

export function refreshAccount(accountId: number | string) {
  if (isCodexProxyBackend()) return refreshCodexProxyAccount(String(accountId));
  return adminFetch(`/api/v1/admin/accounts/${accountId}/refresh`, {
    method: 'POST',
  });
}

export function refreshOpenAIAccountQuota(accountId: number | string) {
  if (isCodexProxyBackend()) return refreshCodexProxyAccountQuota(String(accountId));
  return adminFetch(`/api/v1/admin/openai/accounts/${accountId}/quota/refresh`, {
    method: 'POST',
  });
}

export function setAccountSchedulable(accountId: number | string, schedulable: boolean) {
  if (isCodexProxyBackend()) return Promise.reject(new Error('CODEX_PROXY_ACCOUNT_TOGGLE_UNSUPPORTED'));
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/schedulable`, {
    method: 'POST',
    body: JSON.stringify({ schedulable }),
  });
}
