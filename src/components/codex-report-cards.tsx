import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { LineTrendChart } from '@/src/components/line-trend-chart';
import { formatLatencyMs, formatMoneyPrecise, formatPointLabel, parseFlexibleNumber } from '@/src/lib/formatters';
import { getDashboardDiagnostics } from '@/src/services/admin';
import type { DashboardStats } from '@/src/types/admin';

type ReportTabKey = 'health' | 'diagnostics' | 'performance' | 'cost';

const REPORT_TABS: Array<{ key: ReportTabKey; label: string }> = [
  { key: 'health', label: '请求健康' },
  { key: 'diagnostics', label: '热点诊断' },
  { key: 'performance', label: '响应速度' },
  { key: 'cost', label: '成本效率' },
];

type DimensionKey = 'model' | 'account' | 'apiKey' | 'provider' | 'transport' | 'failureClass';

const DIMENSION_TABS: Array<{ key: DimensionKey; label: string }> = [
  { key: 'model', label: '模型' },
  { key: 'account', label: '账号' },
  { key: 'apiKey', label: '密钥' },
  { key: 'provider', label: '上游' },
  { key: 'transport', label: '传输' },
  { key: 'failureClass', label: '错误' },
];

const colors = {
  card: '#fbf8f2',
  mutedCard: '#f1ece2',
  primary: '#1d5f55',
  text: '#16181a',
  subtext: '#6f665c',
  border: '#e7dfcf',
  dangerBg: '#fbf1eb',
  danger: '#c25d35',
  successBg: '#e6f4ee',
  success: '#1d5f55',
  warningBg: '#fdf6e9',
  warning: '#b7791f',
  blueText: '#2563eb',
};

function formatGranularity(g?: string) {
  if (!g) return '周期';
  if (g === '15m') return '15 分钟';
  if (g === '1h' || g === 'hour') return '小时';
  if (g === '1d' || g === 'day') return '天';
  return g;
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
          {subtitle ? <Text style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

export function CodexReportCards({
  stats,
  rangeKey,
}: {
  stats?: DashboardStats;
  rangeKey: '24h' | '7d' | '30d';
}) {
  const [activeReportTab, setActiveReportTab] = useState<ReportTabKey>('health');
  const [dimension, setDimension] = useState<DimensionKey>('model');
  const [perfTab, setPerfTab] = useState<'total' | 'firstToken'>('total');

  const diagnosticsQuery = useQuery({
    queryKey: ['codex-diagnostics', rangeKey, dimension],
    queryFn: () => getDashboardDiagnostics({ rangeKey, dimension }),
    enabled: activeReportTab === 'diagnostics',
    staleTime: 60_000,
  });

  const health = stats?.codex_health;
  const performance = stats?.codex_performance;
  const cost = stats?.codex_cost_efficiency;
  const granularityText = formatGranularity(stats?.codex_granularity);

  // Health chart points
  const healthPoints = useMemo(() => {
    return (health?.points ?? []).map((point) => ({
      label: formatPointLabel(point.bucket || point.label || '', rangeKey),
      value: parseFlexibleNumber(point.totalRequests ?? point.successRequests) ?? 0,
    }));
  }, [health?.points, rangeKey]);

  // Performance chart points
  const latencyPoints = useMemo(() => {
    return (performance?.points ?? []).map((point) => {
      const rawMs = perfTab === 'firstToken' ? point.firstTokenP95Ms : point.latencyP95Ms;
      const ms = parseFlexibleNumber(rawMs);
      return {
        label: formatPointLabel(point.bucket || point.label || '', rangeKey),
        value: ms != null && ms > 0 ? Number((ms / 1000).toFixed(2)) : 0,
      };
    });
  }, [performance?.points, perfTab, rangeKey]);

  // Cost chart points
  const costPoints = useMemo(() => {
    return (cost?.points ?? []).map((point) => ({
      label: formatPointLabel(point.bucket || point.label || '', rangeKey),
      value: parseFlexibleNumber(point.estimatedCost) ?? 0,
    }));
  }, [cost?.points, rangeKey]);

  // Health metrics
  const successRateText = health?.successRate != null ? `${(health.successRate * 100).toFixed(0)}%` : '100%';
  const completionRateText = health?.completionRate != null ? `${(health.completionRate * 100).toFixed(0)}%` : '100%';
  const abnormalCount = (health?.cancelledRequests ?? 0) + (health?.incompleteRequests ?? 0);

  // Diagnostic items
  const diagnosticItems = diagnosticsQuery.data?.items ?? [];

  return (
    <View style={{ gap: 12 }}>
      {/* 报表切换 Segmented Tabs */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.mutedCard,
          borderRadius: 14,
          padding: 4,
          gap: 4,
        }}
      >
        {REPORT_TABS.map((tab) => {
          const active = tab.key === activeReportTab;
          return (
            <Pressable
              key={tab.key}
              style={{
                flex: 1,
                paddingVertical: 9,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                backgroundColor: active ? colors.card : 'transparent',
                shadowColor: active ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: active ? 0.08 : 0,
                shadowRadius: 2,
                elevation: active ? 1 : 0,
              }}
              onPress={() => setActiveReportTab(tab.key)}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? '700' : '500',
                  color: active ? colors.text : colors.subtext,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 1. 请求健康 */}
      {activeReportTab === 'health' && (
        <SectionCard
          title="请求健康"
          subtitle={`按 ${granularityText} 区分服务结果、取消、未完成与调用方错误`}
        >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 11, color: '#8a8072' }}>服务成功率</Text>
            <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.success }}>
              {successRateText}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 11, color: '#8a8072' }}>完成率</Text>
            <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
              {completionRateText}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 11, color: '#8a8072' }}>非正常结束</Text>
            <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: abnormalCount > 0 ? colors.warning : colors.text }}>
              {abnormalCount}
            </Text>
          </View>
        </View>

          {healthPoints.length > 1 ? (
            <View style={{ marginTop: 12 }}>
              <LineTrendChart
                title="健康请求趋势"
                subtitle="筛选周期内请求量变化趋势"
                points={healthPoints}
                color={colors.primary}
                compact
              />
            </View>
          ) : null}
        </SectionCard>
      )}

      {/* 2. 热点诊断 */}
      {activeReportTab === 'diagnostics' && (
        <SectionCard
          title="热点诊断"
          subtitle={`按${DIMENSION_TABS.find((t) => t.key === dimension)?.label ?? '维度'}聚合`}
          right={
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {DIMENSION_TABS.map((tab) => {
                const active = tab.key === dimension;
                return (
                  <Pressable
                    key={tab.key}
                    style={{
                      backgroundColor: active ? colors.primary : colors.mutedCard,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                    onPress={() => setDimension(tab.key)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : colors.text }}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          }
        >
          {diagnosticsQuery.isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={{ marginTop: 8, fontSize: 12, color: colors.subtext }}>正在加载诊断数据...</Text>
            </View>
          ) : diagnosticItems.length === 0 ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.subtext }}>当前维度暂无诊断数据</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 4 }}>
                <Text style={{ flex: 1.8, fontSize: 11, color: '#8a8072', fontWeight: '600' }}>
                  {DIMENSION_TABS.find((t) => t.key === dimension)?.label ?? '维度'}
                </Text>
                <Text style={{ flex: 1, fontSize: 11, color: '#8a8072', fontWeight: '600', textAlign: 'right' }}>请求</Text>
                <Text style={{ flex: 0.8, fontSize: 11, color: '#8a8072', fontWeight: '600', textAlign: 'right' }}>失败</Text>
                <Text style={{ flex: 1.8, fontSize: 11, color: '#8a8072', fontWeight: '600', textAlign: 'right' }}>性能</Text>
              </View>
              {diagnosticItems.slice(0, 8).map((item, idx) => {
                const hasFailure = (item.errorCount ?? 0) > 0;
                const sharePercent = item.requestShare != null ? `${(item.requestShare * 100).toFixed(1)}%` : '';
                return (
                  <View
                    key={`${item.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.mutedCard,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                    }}
                  >
                    <View style={{ flex: 1.8 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                        {item.name}
                      </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{item.requestCount ?? 0}</Text>
                      {sharePercent ? (
                        <Text style={{ fontSize: 10, color: colors.subtext }}>{sharePercent}</Text>
                      ) : null}
                    </View>
                    <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: hasFailure ? colors.danger : colors.subtext }}>
                        {item.errorCount ?? 0}
                      </Text>
                    </View>
                    <View style={{ flex: 1.8, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.blueText }}>
                        TTFT {formatLatencyMs(item.firstTokenP95Ms)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.subtext }}>
                        P95 {formatLatencyMs(item.latencyP95Ms)} · 重试 {item.retryCount ?? 0}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>
      )}

      {/* 3. 响应速度 */}
      {activeReportTab === 'performance' && (
        <SectionCard
          title="响应速度"
          subtitle="延迟、吞吐与调度分位"
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                style={{
                  backgroundColor: perfTab === 'total' ? colors.primary : colors.mutedCard,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
                onPress={() => setPerfTab('total')}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: perfTab === 'total' ? '#fff' : colors.text }}>
                  总耗时
                </Text>
              </Pressable>
              <Pressable
                style={{
                  backgroundColor: perfTab === 'firstToken' ? colors.primary : colors.mutedCard,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
                onPress={() => setPerfTab('firstToken')}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: perfTab === 'firstToken' ? '#fff' : colors.text }}>
                  首字
                </Text>
              </Pressable>
            </View>
          }
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontSize: 11, color: '#8a8072' }}>P50</Text>
              <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                {formatLatencyMs(perfTab === 'firstToken' ? performance?.firstTokenP50Ms : performance?.latencyP50Ms)}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontSize: 11, color: '#8a8072' }}>P95</Text>
              <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                {formatLatencyMs(perfTab === 'firstToken' ? performance?.firstTokenP95Ms : performance?.latencyP95Ms)}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontSize: 11, color: '#8a8072' }}>P99</Text>
              <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                {formatLatencyMs(perfTab === 'firstToken' ? performance?.firstTokenP99Ms : performance?.latencyP99Ms)}
              </Text>
            </View>
          </View>

          {latencyPoints.length > 1 && latencyPoints.some((p) => p.value > 0) ? (
            <View style={{ marginTop: 12 }}>
              <LineTrendChart
                title={perfTab === 'firstToken' ? '首字耗时趋势 (秒)' : '响应耗时趋势 (秒)'}
                subtitle="P95 分位响应延迟走势"
                points={latencyPoints}
                color="#d38b36"
                formatValue={(v) => `${v}s`}
                compact
              />
            </View>
          ) : null}
        </SectionCard>
      )}

      {/* 4. 成本效率 */}
      {activeReportTab === 'cost' && (
        <SectionCard
          title="成本效率"
          subtitle="实际费用、缓存节省、服务层溢价与单位成本"
        >
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 11, color: '#8a8072' }}>实际费用</Text>
                <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                  {formatMoneyPrecise(cost?.estimatedCost)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.successBg, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>缓存节省</Text>
                <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.success }}>
                  {formatMoneyPrecise(cost?.cacheSavings)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 11, color: '#8a8072' }}>层级溢价</Text>
                <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.warning }}>
                  {formatMoneyPrecise(cost?.tierPremium ?? 0)}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 11, color: '#8a8072' }}>每成功请求</Text>
                <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                  {formatMoneyPrecise(cost?.costPerSuccessfulRequest)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <Text style={{ fontSize: 11, color: '#8a8072' }}>费用覆盖</Text>
                <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>
                  {cost?.coverageRate != null ? `${Math.round(cost.coverageRate * 100)}%` : '100%'}
                </Text>
              </View>
            </View>
          </View>

          {costPoints.length > 1 && costPoints.some((p) => p.value > 0) ? (
            <View style={{ marginTop: 12 }}>
              <LineTrendChart
                title="实际费用趋势"
                subtitle="基于官方 API 定价的周期费用走势"
                points={costPoints}
                color="#7651c8"
                formatValue={formatMoneyPrecise}
                compact
              />
            </View>
          ) : null}
        </SectionCard>
      )}
    </View>
  );
}
