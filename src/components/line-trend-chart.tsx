import { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line as SvgLine, LinearGradient, Path, Stop } from 'react-native-svg';

type Point = {
  label: string;
  value: number;
};

type LineTrendChartProps = {
  points: Point[];
  color?: string;
  title: string;
  subtitle: string;
  formatValue?: (value: number) => string;
  compact?: boolean;
};

export function LineTrendChart({
  points,
  color = '#1d5f55',
  title,
  subtitle,
  formatValue = (value) => `${value}`,
  compact = false,
}: LineTrendChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(320);
  const width = 320;
  const height = compact ? 104 : 144;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const gradientId = useMemo(
    () => `trendFill-${title.replace(/[^a-zA-Z0-9_-]/g, '')}-${compact ? 'compact' : 'full'}`,
    [compact, title]
  );

  const coordinates = useMemo(() => {
    return points.map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - minValue) / range) * (height - 18) - 12;
      return { x, y };
    });
  }, [height, minValue, points, range, width]);

  const line = coordinates
    .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`)
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const latest = points[points.length - 1]?.value ?? 0;
  const currentPoint = selectedIndex !== null ? points[selectedIndex] : null;
  const displayValue = currentPoint ? currentPoint.value : latest;
  const selectedCoord = selectedIndex !== null ? coordinates[selectedIndex] : null;

  const maxTicks = compact ? 6 : 7;
  const tickStep = Math.max(Math.ceil(points.length / maxTicks), 1);
  const tickPoints = points.filter((_, index) => index === 0 || index === points.length - 1 || index % tickStep === 0);

  const handleTouch = (evt: GestureResponderEvent) => {
    const touchX = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, touchX / (chartWidth || 300)));
    const index = Math.round(ratio * (points.length - 1));
    setSelectedIndex(Math.max(0, Math.min(points.length - 1, index)));
  };

  const onLayout = (evt: LayoutChangeEvent) => {
    const measuredWidth = evt.nativeEvent.layout.width;
    if (measuredWidth > 0) setChartWidth(measuredWidth);
  };

  return (
    <View className="rounded-[18px] border border-[#e7dfcf]/70 bg-[#fbf8f2] p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-[1.6px] text-[#7d7468]">{title}</Text>
        {currentPoint ? (
          <Text className="text-xs font-semibold text-[#1d5f55]">{currentPoint.label}</Text>
        ) : null}
      </View>
      <View className="mt-1 flex-row items-baseline gap-2">
        <Text className={`font-bold text-[#16181a] ${compact ? 'text-[22px]' : 'text-[28px]'}`}>{formatValue(displayValue)}</Text>
        {currentPoint ? (
          <Text onPress={() => setSelectedIndex(null)} className="text-xs font-medium text-[#a4512b]">
            重置
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} className="mt-1 text-xs text-[#8a8072]">
        {currentPoint ? `选中时段数值 · 点击空白重置` : subtitle}
      </Text>

      <View
        className={`overflow-hidden rounded-[14px] bg-[#f4efe4] p-3 ${compact ? 'mt-3' : 'mt-4'}`}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {selectedCoord ? (
            <>
              <SvgLine
                x1={selectedCoord.x}
                y1={0}
                x2={selectedCoord.x}
                y2={height}
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="4,4"
                opacity={0.8}
              />
              <Circle
                cx={selectedCoord.x}
                cy={selectedCoord.y}
                r="5.5"
                fill={color}
                stroke="#fff"
                strokeWidth="2.5"
              />
            </>
          ) : null}
        </Svg>

        <View className="mt-2 flex-row justify-between">
          {tickPoints.map((point, index) => (
            <Text key={`${point.label}-${index}`} className={`text-[#7d7468] ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
