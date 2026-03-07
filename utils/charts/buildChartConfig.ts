/**
 * Build Chart.js config for FinancialChart. Single place for chart options and theme.
 * Chart semantics (design system): income=success, expenses=danger, savings=primary.
 * Chart type constants live in @/lib/chart-types (single source of truth).
 */

import type { ChartData, ChartDataset } from 'chart.js'
import type { TrendChartType, CategoryChartType } from '@/lib/chart-types'

export type ChartTypeTrend = TrendChartType
export type ChartTypeCategory = CategoryChartType
export type FinancialChartType = ChartTypeTrend | ChartTypeCategory

export type ChartTheme = {
  primary: string
  secondary: string
  accent: string
  grid: string
  text: string
  textMuted: string
  background: string
  /** For multi-series / category slices */
  palette: string[]
}

/** Token-aligned: income=success, expense=danger, savings=primary */
const CHART_SEMANTIC = { income: '#059669', expense: '#CE1126', savings: '#0038A8' } as const

const DEFAULT_PALETTE = [
  CHART_SEMANTIC.income,
  CHART_SEMANTIC.expense,
  CHART_SEMANTIC.savings,
  '#FCD116',
  '#1a4fbf',
  '#059669',
  '#CE1126',
  '#7ba3f0',
  '#fde047',
]

/** Reusable KlaroPH color palette for charts. Returns `count` colors (cycles palette). */
export function getKlaroColorPalette(count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(DEFAULT_PALETTE[i % DEFAULT_PALETTE.length])
  return out
}

export const DEFAULT_THEME: ChartTheme = {
  primary: CHART_SEMANTIC.savings,
  secondary: CHART_SEMANTIC.expense,
  accent: '#FCD116',
  grid: 'rgba(0,0,0,0.06)',
  text: '#0f172a',
  textMuted: '#94a3b8',
  background: '#ffffff',
  palette: DEFAULT_PALETTE,
}

export type TrendData = {
  labels: string[]
  values: number[]
  /** For multiLine: each key is a series name, values are number[] */
  series?: Record<string, number[]>
}

export type CategoryData = {
  labels: string[]
  values: number[]
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

export type ChartDataInput = TrendData | CategoryData

export interface BuildChartConfigOptions {
  theme?: Partial<ChartTheme>
  /** Currency formatter for tooltips/labels */
  formatValue?: (value: number) => string
  title?: string
  /** Chart height (used in options for aspect ratio / responsive) */
  height?: number
}

/** Line/area/multiLine use Line component and ChartData<'line'> */
export type LineChartConfig = {
  chartKind: 'line'
  data: ChartData<'line', (number | null)[]>
  options: Record<string, unknown>
}

/** Bar uses Bar component and ChartData<'bar'> */
export type BarChartConfig = {
  chartKind: 'bar'
  data: ChartData<'bar', (number | null)[]>
  options: Record<string, unknown>
}

/** Pie uses Pie component and ChartData<'pie'> */
export type PieChartConfig = {
  chartKind: 'pie'
  data: ChartData<'pie'>
  options: Record<string, unknown>
}

/** Doughnut uses Doughnut component and ChartData<'doughnut'> */
export type DoughnutChartConfig = {
  chartKind: 'doughnut'
  data: ChartData<'doughnut'>
  options: Record<string, unknown>
}

/** Radar uses Radar component and ChartData<'radar'> */
export type RadarChartConfig = {
  chartKind: 'radar'
  data: ChartData<'radar'>
  options: Record<string, unknown>
}

export type BuiltChartConfig =
  | LineChartConfig
  | BarChartConfig
  | PieChartConfig
  | DoughnutChartConfig
  | RadarChartConfig

/**
 * Returns Chart.js data + options for the given type and data.
 * Used by FinancialChart to avoid duplicated config logic.
 */
export function buildChartConfig(
  type: FinancialChartType,
  data: ChartDataInput,
  options: BuildChartConfigOptions = {}
): BuiltChartConfig {
  const theme = { ...DEFAULT_THEME, ...options.theme }
  const formatValue = options.formatValue ?? formatPeso

  if (type === 'line' || type === 'bar' || type === 'area' || type === 'multiLine') {
    const trendData = data as TrendData
    const labels = trendData.labels
    const isArea = type === 'area'
    const isMulti = type === 'multiLine' && trendData.series && Object.keys(trendData.series).length > 0

    const chartOptions: Record<string, unknown> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      layout: {
        padding: { top: 8, right: 8, bottom: 24, left: 4 },
      },
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: { display: isMulti, position: 'top' as const },
        tooltip: {
          callbacks: {
            title: (items: { label?: string }[]) => (items[0]?.label ? String(items[0].label) : ''),
            label: (ctx: { raw: number }) => formatValue(Number(ctx.raw)),
          },
        },
      },
      scales: {
        x: {
          grid: { color: theme.grid },
          ticks: { color: theme.textMuted, maxTicksLimit: 10, font: { size: 11 }, autoSkip: true },
        },
        y: {
          beginAtZero: true,
          grid: { color: theme.grid },
          ticks: {
            color: theme.textMuted,
            callback: (value: unknown) => formatValue(Number(value)),
          },
        },
      },
    }

    if (type === 'bar') {
      const datasets: ChartDataset<'bar', (number | null)[]>[] =
        isMulti && trendData.series
          ? Object.entries(trendData.series).map(([label, values], i) => ({
              label,
              data: values,
              backgroundColor: theme.palette[i % theme.palette.length],
            }))
          : [
              {
                label: 'Amount',
                data: trendData.values,
                backgroundColor: theme.primary,
              },
            ]
      const barData: ChartData<'bar', (number | null)[]> = { labels, datasets }
      return { chartKind: 'bar' as const, data: barData, options: chartOptions }
    }

    const datasets: ChartDataset<'line', (number | null)[]>[] =
      isMulti && trendData.series
        ? Object.entries(trendData.series).map(([label, values], i) => ({
            label,
            data: values,
            borderColor: theme.palette[i % theme.palette.length],
            backgroundColor: isArea
              ? `${theme.palette[i % theme.palette.length]}40`
              : theme.palette[i % theme.palette.length],
            fill: isArea,
            tension: 0.4,
            pointHoverRadius: 6,
            pointRadius: 2,
          }))
        : [
            {
              label: 'Amount',
              data: trendData.values,
              borderColor: theme.primary,
              backgroundColor: isArea ? `${theme.primary}40` : theme.primary,
              fill: isArea,
              tension: 0.4,
              pointHoverRadius: 6,
              pointRadius: 2,
            },
          ]
    const lineData: ChartData<'line', (number | null)[]> = { labels, datasets }
    return { chartKind: 'line' as const, data: lineData, options: chartOptions }
  }

  // Pie, doughnut, radar (category charts)
  const catData = data as CategoryData
  const { labels, values } = catData
  const backgroundColor = getKlaroColorPalette(labels.length)
  const borderColor = theme.background

  const categoryOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
  }

  if (type === 'radar') {
    const radarDataset: ChartDataset<'radar', number[]> = {
      label: 'Amount',
      data: values,
      backgroundColor,
      borderColor,
      borderWidth: 1,
    }
    const radarData: ChartData<'radar'> = { labels, datasets: [radarDataset] }
    return {
      chartKind: 'radar' as const,
      data: radarData,
      options: {
        ...categoryOptions,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: { raw: number; label: string }) =>
                `${ctx.label}: ${formatValue(Number(ctx.raw))}`,
            },
          },
        },
        scales: {
          r: {
            grid: { color: theme.grid },
            ticks: { color: theme.textMuted, callback: (v: unknown) => formatValue(Number(v)) },
          },
        },
      },
    }
  }

  // Pie and Doughnut: legend at bottom, smaller font, percentage in tooltip
  const pieDataset: ChartDataset<'pie', number[]> = {
    label: 'Amount',
    data: values,
    backgroundColor,
    borderColor,
    borderWidth: 1,
    hoverOffset: 4,
  }
  const doughnutDataset: ChartDataset<'doughnut', number[]> = {
    label: 'Amount',
    data: values,
    backgroundColor,
    borderColor,
    borderWidth: 1,
    hoverOffset: 4,
  }

  const pieDoughnutChartOptions = {
    ...categoryOptions,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 11 },
          boxWidth: 12,
          padding: 10,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: number; label: string; parsed: number; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0)
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0'
            return `${ctx.label}: ${formatValue(ctx.parsed)} (${pct}%)`
          },
        },
      },
    },
  }

  if (type === 'doughnut') {
    const doughnutData: ChartData<'doughnut'> = { labels, datasets: [doughnutDataset] }
    return { chartKind: 'doughnut' as const, data: doughnutData, options: pieDoughnutChartOptions }
  }

  const pieData: ChartData<'pie'> = { labels, datasets: [pieDataset] }
  return { chartKind: 'pie' as const, data: pieData, options: pieDoughnutChartOptions }
}

/** Which chart types require pro plan */
export function isProChartType(type: FinancialChartType): boolean {
  if (type === 'line' || type === 'pie') return false
  return true
}
