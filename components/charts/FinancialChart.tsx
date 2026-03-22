'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
} from 'chart.js'
import type { ChartData } from 'chart.js'
import { Line, Bar, Pie, Doughnut, Radar } from 'react-chartjs-2'
import {
  buildChartConfig,
  DEFAULT_THEME,
  type BuiltChartConfig,
  type FinancialChartType,
  type TrendData,
  type CategoryData,
  type ChartDataInput,
  isProChartType,
  type ChartTypeTrend,
  type ChartTypeCategory,
} from '@/utils/charts/buildChartConfig'
import { generateCategoryColor } from '@/lib/generateCategoryColor'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale
)

export type FinancialChartProps = {
  type: FinancialChartType
  labels: string[]
  /** Single series values (trend) or category values */
  dataset?: number[]
  /** Multi-series for multiLine; keys = series names, values = number[] */
  datasets?: Record<string, number[]>
  userPlan: 'free' | 'pro'
  title?: string
  height?: number
  onPremiumRequired?: () => void
  /** 'trend' = line/bar/area/multiLine; 'category' = pie/doughnut/radar */
  chartContext: 'trend' | 'category'
}

function getEffectiveType(
  requested: FinancialChartType,
  userPlan: 'free' | 'pro',
  chartContext: 'trend' | 'category'
): FinancialChartType {
  if (userPlan === 'pro') return requested
  if (chartContext === 'trend') return 'line'
  return 'pie'
}

export default function FinancialChart({
  type,
  labels,
  dataset = [],
  datasets,
  userPlan,
  title,
  height = 280,
  onPremiumRequired,
  chartContext,
}: FinancialChartProps) {
  const [mounted, setMounted] = useState(false)
  const effectiveType = getEffectiveType(type, userPlan, chartContext)
  const isGated = userPlan === 'free' && isProChartType(type)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const dataInput: ChartDataInput = useMemo(() => {
    if (chartContext === 'trend') {
      const trend: TrendData = {
        labels,
        values: dataset,
      }
      if ((effectiveType === 'multiLine' || type === 'multiLine') && datasets) trend.series = datasets
      return trend
    }
    return {
      labels,
      values: dataset,
    } as CategoryData
  }, [labels, dataset, datasets, effectiveType, type, chartContext])

  const config = useMemo(
    () =>
      buildChartConfig(effectiveType, dataInput, {
        theme: DEFAULT_THEME,
        height,
      }),
    [effectiveType, dataInput, height]
  )

  const gatedConfig = useMemo(
    () =>
      isGated
        ? buildChartConfig(type, dataInput, { theme: DEFAULT_THEME, height })
        : null,
    [isGated, type, dataInput, height]
  )

  const handleClick = () => {
    if (isGated && onPremiumRequired) onPremiumRequired()
  }

  if (!mounted) {
    /* Reserve layout so Chart.js client mount does not shift surrounding content (CLS). */
    return (
      <div
        className="financial-chart-mount-placeholder"
        style={{ width: '100%', minWidth: 0, height, minHeight: height }}
        aria-hidden
      />
    )
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    position: 'relative',
    ...(isGated ? { height: '100%' } : {}),
    cursor: isGated ? 'pointer' : undefined,
  }

  if (isGated && gatedConfig) {
    return (
      <div className="financial-chart-container" style={containerStyle} onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()}>
        {title && (
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        )}
        <div style={{ filter: 'blur(4px)', pointerEvents: 'none', height: '100%', width: '100%', minWidth: 0 }}>
          <FinancialChartInner config={gatedConfig} chartContext={chartContext} isMobile={isMobile} />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>
            Explore KlaroPH Pro to unlock this chart
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="financial-chart-container chart-fade-in" style={containerStyle}>
      {title && (
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      )}
      <FinancialChartInner config={config} chartContext={chartContext} isMobile={isMobile} />
    </div>
  )
}

type InnerProps = {
  config: BuiltChartConfig
  chartContext: 'trend' | 'category'
  isMobile: boolean
}

const chartWrapperStyle: React.CSSProperties = { width: '100%', maxWidth: '100%' }

/** Stable container for circular charts: deterministic size breaks resize reflow loop */
const chartStableContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: 1,
}

const pieDoughnutStyle: React.CSSProperties = { width: '100%', height: '100%' }

/* Chart.js: with explicit container size, use maintainAspectRatio: false so chart fills container. */
const desktopCategoryOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  devicePixelRatio: 1,
  plugins: {
    legend: {
      position: 'bottom' as const,
      boxWidth: 12,
      padding: 8,
      labels: {
        font: { size: 12 },
        padding: 8,
      },
    },
  },
}

const radarVisualOptions = {
  elements: {
    line: { borderWidth: 2 },
  },
  scales: {
    r: {
      pointLabels: {
        font: { size: 12 },
      },
    },
  },
}

/* Chart.js: with explicit container height, maintainAspectRatio: false so chart fills container. */
const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  devicePixelRatio: 1,
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

const categoryTooltipPlugin = {
  tooltip: {
    callbacks: {
      label(this: unknown, context: { label?: string; raw?: unknown; dataset?: { data?: unknown[] } }) {
        const label = context.label ?? ''
        const value = Number(context.raw ?? 0)
        const dataset = context.dataset?.data ?? []
        const total = (dataset as number[]).reduce((sum, val) => sum + Number(val), 0)
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
        return `${label}: ${formatCurrency(value)} (${percentage}%)`
      },
    },
  },
}

/** Ref type for any Chart.js instance (used for unmount destroy). */
type ChartInstanceRef = React.RefObject<{ destroy: () => void } | null>

function FinancialChartInner({ config, chartContext, isMobile }: InnerProps) {
  const chartRef = useRef<{ destroy: () => void } | null>(null) as ChartInstanceRef

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [])

  const baseOptions =
    chartContext === 'category' && !isMobile ? desktopCategoryOptions : defaultOptions
  let options: object = {
    ...(config.options as object),
    ...baseOptions,
  }
  const isCategoryChart = config.chartKind === 'pie' || config.chartKind === 'doughnut'
  if (isCategoryChart) {
    options = {
      ...options,
      plugins: {
        ...((options as { plugins?: object }).plugins as object),
        ...categoryTooltipPlugin,
      },
    }
  }
  const style = { height: '100%' }

  if (config.chartKind === 'line') {
    const data: ChartData<'line'> = config.data
    return (
      <div style={chartWrapperStyle}>
        <Line ref={chartRef as React.RefObject<React.ComponentRef<typeof Line>>} data={data} options={options} style={style} />
      </div>
    )
  }

  if (config.chartKind === 'bar') {
    const data: ChartData<'bar'> = config.data
    return (
      <div style={chartWrapperStyle}>
        <Bar ref={chartRef as React.RefObject<React.ComponentRef<typeof Bar>>} data={data} options={options} style={style} />
      </div>
    )
  }

  const isDesktopCategory = chartContext === 'category' && !isMobile
  const circularChartWrapperStyle =
    isDesktopCategory
      ? { ...chartWrapperStyle, ...chartStableContainerStyle }
      : chartWrapperStyle

  if (config.chartKind === 'pie') {
    const raw = config.data as ChartData<'pie'>
    const data: ChartData<'pie'> = {
      ...raw,
      datasets: raw.datasets.map((ds) => ({
        ...ds,
        backgroundColor: (raw.labels ?? []).map((label) => generateCategoryColor(String(label))),
      })),
    }
    return (
      <div
        style={circularChartWrapperStyle}
        className={isDesktopCategory ? 'chart-stable-container' : undefined}
      >
        <Pie ref={chartRef as React.RefObject<React.ComponentRef<typeof Pie>>} data={data} options={options} style={pieDoughnutStyle} />
      </div>
    )
  }

  if (config.chartKind === 'doughnut') {
    const raw = config.data as ChartData<'doughnut'>
    const data: ChartData<'doughnut'> = {
      ...raw,
      datasets: raw.datasets.map((ds) => ({
        ...ds,
        backgroundColor: (raw.labels ?? []).map((label) => generateCategoryColor(String(label))),
      })),
    }
    return (
      <div
        style={circularChartWrapperStyle}
        className={isDesktopCategory ? 'chart-stable-container' : undefined}
      >
        <Doughnut ref={chartRef as React.RefObject<React.ComponentRef<typeof Doughnut>>} data={data} options={options} style={pieDoughnutStyle} />
      </div>
    )
  }

  if (config.chartKind === 'radar') {
    const data: ChartData<'radar'> = config.data
    const radarOptions = { ...options, ...radarVisualOptions }
    return (
      <div
        style={circularChartWrapperStyle}
        className={isDesktopCategory ? 'chart-stable-container' : undefined}
      >
        <Radar ref={chartRef as React.RefObject<React.ComponentRef<typeof Radar>>} data={data} options={radarOptions} style={style} />
      </div>
    )
  }

  const data: ChartData<'line'> = { labels: [], datasets: [] }
  return (
    <div style={chartWrapperStyle}>
      <Line ref={chartRef as React.RefObject<React.ComponentRef<typeof Line>>} data={data} options={options} style={style} />
    </div>
  )
}

export { isProChartType }
export type { ChartTypeTrend, ChartTypeCategory }
