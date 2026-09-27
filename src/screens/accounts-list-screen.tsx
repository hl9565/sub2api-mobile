import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ChevronDown,
  ChevronUp,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatTokenValue } from '@/src/lib/formatters';
import {
  getAccountTodayStats,
  listAccounts,
  refreshOpenAIAccountQuota,
  setAccountSchedulable,
  testAccount,
} from '@/src/services/admin';
import type { AdminAccount, AdminResourceId } from '@/src/types/admin';
import { adminConfigState } from '@/src/store/admin-config';

type AccountStatusFilter = 'all' | 'active' | 'paused' | 'error';
type UsageSort = 'usage-desc' | 'usage-asc';
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '暂停' | '异常';
  badgeTone: 'success' | 'muted' | 'danger';
};

type AccountTodaySummary = {
  requests: number;
  tokens: number;
  cost: number;
};

type AccountQuotaWindow = {
  label: '5h' | '7d' | '30d';
  usedPercent?: number;
  resetAfterSeconds?: number;
  resetAt?: string;
  resetLabel?: string;
};

function formatTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function readExtraNumber(account: AdminAccount, key: string) {
  const value = account.extra?.[key];
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getAccountQuota(account: AdminAccount): AccountQuotaWindow[] {
  const isOAuthAccount =
    (account.platform.toLowerCase() === 'openai' && account.type.toLowerCase() === 'oauth')
    || ['oauth', 'oauth_credentials'].includes(account.type.toLowerCase())
    || account.platform.toLowerCase() === 'codex'
    || account.extra?.codex_5h_used_percent !== undefined
    || account.extra?.codex_7d_used_percent !== undefined;

  if (!isOAuthAccount) {
    return [];
  }

  return (['5h', '7d', '30d'] as const)
    .map((label) => ({
      label,
      usedPercent: readExtraNumber(account, `codex_${label}_used_percent`),
      resetAfterSeconds: readExtraNumber(account, `codex_${label}_reset_after_seconds`),
      resetAt: typeof account.extra?.[`codex_${label}_reset_at`] === 'string'
        ? (account.extra[`codex_${label}_reset_at`] as string)
        : undefined,
      resetLabel: typeof account.extra?.[`codex_${label}_reset_label`] === 'string'
        ? (account.extra[`codex_${label}_reset_label`] as string)
        : undefined,
    }))
    .filter((window) => window.usedPercent !== undefined || window.resetAfterSeconds !== undefined || window.resetAt);
}

function formatQuotaReset(window: AccountQuotaWindow) {
  if (window.resetLabel) return window.resetLabel;

  if (typeof window.resetAfterSeconds === 'number' && window.resetAfterSeconds > 0) {
    const totalHours = Math.floor(window.resetAfterSeconds / 3600);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = Math.floor((window.resetAfterSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h 后重置`;
    if (totalHours > 0) return `${totalHours}h ${minutes}m 后重置`;
    return `${Math.max(minutes, 1)}m 后重置`;
  }

  if (window.resetAt) {
    return `重置于 ${formatTime(window.resetAt)}`;
  }

  return '重置时间未知';
}

function QuotaWindowRow({ window }: { window: AccountQuotaWindow }) {
  const percent = typeof window.usedPercent === 'number'
    ? Math.min(100, Math.max(0, window.usedPercent))
    : undefined;
  const progressColor = percent !== undefined && percent >= 90 ? '#a4512b' : '#1d5f55';

  return (
    <View className="flex-row items-center gap-2">
      <View className="w-9 rounded-[8px] bg-[#e7dfcf] px-1.5 py-1.5">
        <Text className="text-center text-xs font-bold text-[#4e463e]">{window.label}</Text>
      </View>
      <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#e7dfcf]">
        {percent !== undefined ? <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: progressColor }} /> : null}
      </View>
      <Text className="w-[62px] text-right text-xs font-semibold text-[#4e463e]">
        {percent !== undefined ? `${percent.toFixed(0)}%` : '--'}
      </Text>
      <Text className="w-[94px] text-right text-[11px] text-[#7d7468]">{formatQuotaReset(window)}</Text>
    </View>
  );
}

function getAccountError(account: AdminAccount) {
  return Boolean(account.status === 'error' || account.error_message);
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);

  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger' };
  }
  if (isPausedStatus || account.schedulable === false) {
    return { filterKey: 'paused', label: '暂停', badgeTone: 'muted' };
  }
  return { filterKey: 'active', label: '正常', badgeTone: 'success' };
}

type AccountsListScreenProps = {
  safeAreaEdges?: Edge[];
};

export function AccountsListScreen({ safeAreaEdges }: AccountsListScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<AccountStatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [usageSort, setUsageSort] = useState<UsageSort>('usage-desc');
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [testingAccountId, setTestingAccountId] = useState<AdminResourceId | null>(null);
  const [testFeedbackByAccountId, setTestFeedbackByAccountId] = useState<Record<string, string>>({});
  const [togglingAccountId, setTogglingAccountId] = useState<AdminResourceId | null>(null);
  const isCodexProxy = adminConfigState.backend === 'codex-proxy-rs';
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts', keyword],
    queryFn: () => listAccounts(keyword),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: AdminResourceId; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: (accountId: AdminResourceId) => testAccount(accountId),
  });

  const quotaMutation = useMutation({
    mutationFn: (accountId: AdminResourceId) => refreshOpenAIAccountQuota(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const items = accountsQuery.data?.items ?? [];
  const accountCostQueries = useQueries({
    queries: items.map((account) => ({
      queryKey: ['account-today-stats', account.id],
      queryFn: () => getAccountTodayStats(account.id),
      staleTime: 60_000,
    })),
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<AdminResourceId, AccountTodaySummary>();
    items.forEach((account, index) => {
      const result = accountCostQueries[index]?.data;
      const fromStatsCost = typeof result?.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined;
      const fromExtra = typeof account.extra?.today_cost === 'number' ? account.extra.today_cost : undefined;
      const cost = fromStatsCost ?? fromExtra ?? 0;
      const requests = typeof result?.requests === 'number' && Number.isFinite(result.requests) ? result.requests : 0;
      const tokens = typeof result?.tokens === 'number' && Number.isFinite(result.tokens) ? result.tokens : 0;
      next.set(account.id, { requests, tokens, cost });
    });
    return next;
  }, [accountCostQueries, items]);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    items.forEach((account) => {
      if (account.platform?.trim()) {
        set.add(account.platform.trim().toLowerCase());
      }
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const statusMatched = items.filter((account) => {
      const visualStatus = getAccountVisualStatus(account);
      if (filter === 'active' && visualStatus.filterKey !== 'active') return false;
      if (filter === 'paused' && visualStatus.filterKey !== 'paused') return false;
      if (filter === 'error' && visualStatus.filterKey !== 'error') return false;

      if (platformFilter !== 'all' && account.platform?.toLowerCase() !== platformFilter) {
        return false;
      }

      return true;
    });

    const sorted = [...statusMatched].sort((left, right) => {
      const requestsLeft = todayByAccountId.get(left.id)?.requests ?? 0;
      const requestsRight = todayByAccountId.get(right.id)?.requests ?? 0;
      if (requestsLeft === requestsRight) {
        const tokensLeft = todayByAccountId.get(left.id)?.tokens ?? 0;
        const tokensRight = todayByAccountId.get(right.id)?.tokens ?? 0;
        return tokensLeft - tokensRight;
      }
      if (usageSort === 'usage-asc') return requestsLeft - requestsRight;
      return requestsRight - requestsLeft;
    });

    return sorted;
  }, [filter, items, platformFilter, todayByAccountId, usageSort]);

  const errorMessage = accountsQuery.error instanceof Error ? accountsQuery.error.message : '';

  const summary = useMemo(() => {
    const total = items.length;
    const errors = items.filter((item) => getAccountVisualStatus(item).filterKey === 'error').length;
    const paused = items.filter((item) => getAccountVisualStatus(item).filterKey === 'paused').length;
    const active = items.filter((item) => getAccountVisualStatus(item).filterKey === 'active').length;
    return { total, active, paused, errors };
  }, [items]);

  const areAllExpanded = filteredItems.length > 0 && filteredItems.every((item) => expandedAccountIds.has(String(item.id)));

  const toggleExpand = useCallback((id: AdminResourceId) => {
    const key = String(id);
    setExpandedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    if (areAllExpanded) {
      setExpandedAccountIds(new Set());
    } else {
      setExpandedAccountIds(new Set(filteredItems.map((item) => String(item.id))));
    }
  }, [areAllExpanded, filteredItems]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View className="rounded-[24px] border border-[#e6dece]/80 bg-[#fbf8f2] p-3 shadow-sm">
          <View className="flex-row items-center rounded-[18px] bg-[#f1ece2] px-4 py-3">
            <Search color="#7d7468" size={18} />
            <TextInput
              defaultValue=""
              onChangeText={setSearchText}
              placeholder="搜索账号名称 / 平台"
              placeholderTextColor="#9b9081"
              className="ml-3 flex-1 text-base text-[#16181a]"
            />
          </View>

          {/* Status filter tabs */}
          <View className="mt-3 flex-row gap-2">
            {([
              ['all', `全部 ${summary.total}`],
              ['active', `正常 ${summary.active}`],
              ['paused', `暂停 ${summary.paused}`],
              ['error', `异常 ${summary.errors}`],
            ] as const).map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  className={active ? 'rounded-full bg-[#1d5f55] px-3 py-1.5' : 'rounded-full bg-[#e7dfcf] px-3 py-1.5'}
                >
                  <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#4e463e]'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Platform filter pills if multiple */}
          {availablePlatforms.length > 1 ? (
            <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
              <Text className="text-[11px] text-[#7d7468] mr-1">平台：</Text>
              <Pressable
                onPress={() => setPlatformFilter('all')}
                className={`rounded-full px-2.5 py-1 ${platformFilter === 'all' ? 'bg-[#4e463e]' : 'bg-[#e7dfcf]/70'}`}
              >
                <Text className={`text-[11px] font-semibold ${platformFilter === 'all' ? 'text-white' : 'text-[#4e463e]'}`}>全部</Text>
              </Pressable>
              {availablePlatforms.map((plat) => {
                const active = platformFilter === plat;
                return (
                  <Pressable
                    key={plat}
                    onPress={() => setPlatformFilter(plat)}
                    className={`rounded-full px-2.5 py-1 ${active ? 'bg-[#4e463e]' : 'bg-[#e7dfcf]/70'}`}
                  >
                    <Text className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-[#4e463e]'}`}>{plat}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Sort & Expand Controls */}
          <View className="mt-2.5 flex-row items-center justify-between pt-2 border-t border-[#e7dfcf]/50">
            <View className="flex-row gap-2">
              {([
                ['usage-desc', '请求高→低'],
                ['usage-asc', '请求低→高'],
              ] as const).map(([key, label]) => {
                const active = usageSort === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setUsageSort(key)}
                    className={active ? 'rounded-full bg-[#4e463e] px-2.5 py-1' : 'rounded-full bg-[#e7dfcf] px-2.5 py-1'}
                  >
                    <Text className={active ? 'text-[11px] font-semibold text-white' : 'text-[11px] font-semibold text-[#4e463e]'}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={toggleExpandAll} className="px-2 py-1">
              <Text className="text-xs font-semibold text-[#1d5f55]">
                {areAllExpanded ? '全部折叠' : '全部展开'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [
      availablePlatforms,
      filter,
      platformFilter,
      summary.active,
      summary.errors,
      summary.paused,
      summary.total,
      usageSort,
      areAllExpanded,
      toggleExpandAll,
    ]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const visualStatus = getAccountVisualStatus(account);
      const statusText = visualStatus.label;
      const groupsText = account.groups?.map((group) => group.name).filter(Boolean).slice(0, 3).join(' · ');
      const todayStats = todayByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const nextSchedulable = visualStatus.filterKey === 'paused';
      const toggleLabel = nextSchedulable ? '恢复' : '暂停';
      const testFeedback = testFeedbackByAccountId[String(account.id)];
      const quotaWindows = getAccountQuota(account);
      const isExpanded = expandedAccountIds.has(String(account.id));
      const isTogglingCurrent = togglingAccountId === account.id && toggleMutation.isPending;
      const isTestingCurrent = testingAccountId === account.id && testMutation.isPending;
      const isRefreshingQuota = quotaMutation.isPending && quotaMutation.variables === account.id;

      // Primary quota window for mini preview (usually 5h)
      const primaryQuota = quotaWindows.find((w) => w.label === '5h') || quotaWindows[0];

      return (
        <Pressable onPress={() => toggleExpand(account.id)} className="active:opacity-90">
          <ListCard
            title={account.name}
            meta={`${account.platform} · ${account.type}`}
            badge={statusText}
            badgeTone={visualStatus.badgeTone}
            icon={KeyRound}
          >
            <View className="gap-2.5">
              {/* Compact Metrics Bar */}
              <View className="flex-row gap-2">
                <View className="flex-1 rounded-[12px] bg-[#f1ece2] px-2.5 py-2">
                  <Text className="text-[10px] text-[#7d7468]">今日请求</Text>
                  <Text className="mt-0.5 text-sm font-bold text-[#16181a]">{todayStats.requests}</Text>
                </View>
                <View className="flex-1 rounded-[12px] bg-[#f1ece2] px-2.5 py-2">
                  <Text className="text-[10px] text-[#7d7468]">消费金额</Text>
                  <Text className="mt-0.5 text-sm font-bold text-[#16181a]">${todayStats.cost.toFixed(2)}</Text>
                </View>
                <View className="flex-1 rounded-[12px] bg-[#f1ece2] px-2.5 py-2">
                  <Text className="text-[10px] text-[#7d7468]">Token 消耗</Text>
                  <Text className="mt-0.5 text-sm font-bold text-[#16181a]">{formatTokenValue(todayStats.tokens)}</Text>
                </View>
              </View>

              {/* Collapsed state mini quota preview */}
              {!isExpanded && primaryQuota && primaryQuota.usedPercent !== undefined ? (
                <View className="flex-row items-center justify-between rounded-[10px] bg-[#f1ece2]/80 px-2.5 py-1.5">
                  <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                    <Text className="text-[11px] font-bold text-[#4e463e]">{primaryQuota.label} 额度</Text>
                    <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e7dfcf]">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, primaryQuota.usedPercent))}%`,
                          backgroundColor: primaryQuota.usedPercent >= 90 ? '#a4512b' : '#1d5f55',
                        }}
                      />
                    </View>
                    <Text className="text-[11px] font-semibold text-[#4e463e]">{primaryQuota.usedPercent.toFixed(0)}%</Text>
                  </View>
                  <Text className="text-[10px] text-[#7d7468]">{formatQuotaReset(primaryQuota)}</Text>
                </View>
              ) : null}

              {/* Expand/Collapse Toggle Indicator */}
              <View className="flex-row items-center justify-between pt-1">
                <View className="flex-row items-center gap-1.5">
                  {account.schedulable && !isError ? <ShieldCheck color="#1d5f55" size={13} /> : <ShieldOff color="#7d7468" size={13} />}
                  <Text className="text-[11px] text-[#7d7468]">
                    {account.schedulable && !isError ? '调度正常' : '暂停调度'} · 最近活跃 {formatTime(account.last_used_at || account.updated_at)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-0.5">
                  <Text className="text-[11px] font-medium text-[#7d7468]">{isExpanded ? '收起' : '详情'}</Text>
                  {isExpanded ? <ChevronUp color="#7d7468" size={14} /> : <ChevronDown color="#7d7468" size={14} />}
                </View>
              </View>

              {/* Expanded details container */}
              {isExpanded ? (
                <View className="gap-2.5 pt-2 border-t border-[#e7dfcf]/60">
                  <Text className="text-xs text-[#7d7468]">
                    优先级 {account.priority ?? 0} · 倍率 {(account.rate_multiplier ?? 1).toFixed(2)}x
                    {account.concurrency ? ` · 并发 ${account.concurrency}` : ''}
                  </Text>

                  {groupsText ? <Text className="text-xs text-[#7d7468]">分组：{groupsText}</Text> : null}
                  {account.error_message ? <Text className="text-xs text-[#a4512b]">异常信息：{account.error_message}</Text> : null}

                  {/* Full Quota Windows */}
                  {quotaWindows.length > 0 ? (
                    <View className="rounded-[14px] bg-[#f1ece2] px-3 py-3">
                      <View className="mb-2 flex-row items-center justify-between">
                        <Text className="text-xs font-semibold text-[#4e463e]">OAuth 额度详情</Text>
                        <Pressable
                          accessibilityLabel="刷新 OAuth 额度"
                          className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5 bg-[#e7dfcf]"
                          disabled={isRefreshingQuota}
                          onPress={(event) => {
                            event.stopPropagation();
                            quotaMutation.mutate(account.id);
                          }}
                        >
                          <RefreshCw color="#1d5f55" size={12} />
                          <Text className="text-[11px] font-semibold text-[#1d5f55]">
                            {isRefreshingQuota ? '刷新中' : '刷新'}
                          </Text>
                        </Pressable>
                      </View>
                      <View className="gap-2">
                        {quotaWindows.map((window) => (
                          <QuotaWindowRow key={window.label} window={window} />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Action buttons (only in Sub2API) */}
                  {!isCodexProxy ? (
                    <View className="flex-row gap-2 mt-1">
                      <Pressable
                        className="rounded-full bg-[#1b1d1f] px-4 py-2"
                        disabled={isTestingCurrent}
                        onPress={(event) => {
                          event.stopPropagation();
                          setTestingAccountId(account.id);
                          testMutation.mutate(account.id, {
                            onSuccess: () => {
                              setTestFeedbackByAccountId((current) => ({
                                ...current,
                                [String(account.id)]: '测试成功',
                              }));
                            },
                            onError: (error) => {
                              const message = error instanceof Error && error.message ? error.message : '测试失败';
                              setTestFeedbackByAccountId((current) => ({
                                ...current,
                                [String(account.id)]: message,
                              }));
                            },
                            onSettled: () => {
                              setTestingAccountId((current) => (current === account.id ? null : current));
                            },
                          });
                        }}
                      >
                        <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#f6f1e8]">
                          {isTestingCurrent ? '测试中...' : '测试'}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="rounded-full bg-[#e7dfcf] px-4 py-2"
                        disabled={isTogglingCurrent}
                        onPress={(event) => {
                          event.stopPropagation();
                          setTogglingAccountId(account.id);
                          toggleMutation.mutate(
                            {
                              accountId: account.id,
                              schedulable: nextSchedulable,
                            },
                            {
                              onSettled: () => {
                                setTogglingAccountId((current) => (current === account.id ? null : current));
                              },
                            }
                          );
                        }}
                      >
                        <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#4e463e]">
                          {isTogglingCurrent ? '处理中...' : toggleLabel}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {testFeedback ? <Text className="text-xs text-[#1d5f55]">测试结果：{testFeedback}</Text> : null}
                </View>
              ) : null}
            </View>
          </ListCard>
        </Pressable>
      );
    },
    [
      expandedAccountIds,
      isCodexProxy,
      quotaMutation,
      testFeedbackByAccountId,
      testMutation,
      testingAccountId,
      todayByAccountId,
      toggleExpand,
      toggleMutation,
      togglingAccountId,
    ]
  );

  const emptyState = useMemo(
    () => <ListCard title="暂无账号" meta={errorMessage || '连上后这里会展示账号列表。'} icon={KeyRound} />,
    [errorMessage]
  );

  const headerRight = useMemo(() => {
    if (isCodexProxy) return null;
    return (
      <Pressable
        onPress={() => router.push('/accounts/create')}
        className="flex-row items-center gap-1 rounded-full bg-[#1d5f55] px-3 py-1.5"
      >
        <Plus color="#fff" size={14} />
        <Text className="text-xs font-bold text-white">添加</Text>
      </Pressable>
    );
  }, [isCodexProxy]);

  return (
    <ScreenShell
      title="账号清单"
      subtitle="卡片支持展开详情，支持按平台与状态过滤。"
      titleAside={<Text className="text-[11px] text-[#7d7468]">共 {summary.total} 个账号</Text>}
      right={headerRight}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching} onRefresh={() => void accountsQuery.refetch()} tintColor="#1d5f55" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-3" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={6}
      />
    </ScreenShell>
  );
}
