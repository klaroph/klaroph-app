import { act } from 'react'
import { create, type ReactTestRendererJSON } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { BudgetRing } from '../components/BudgetRing'
import { ThemeProvider } from '../components/ThemeProvider'
import { DELETE_UNSYNCED_LABEL, OLDER_ENTRIES_LINE, PERIOD_BUDGET_LINE, UNINSTALL_WARNING, unsyncedSignOutLine } from '../ui/copy'
import { BudgetSheet } from './BudgetSheet'
import { FirstRun } from './FirstRun'
import { HistoryScreen } from './HistoryScreen'
import { SettingsSheet } from './SettingsSheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-native', () => {
  const React = require('react') as typeof import('react')
  const host = (type: string) => (props: { children?: React.ReactNode }) => React.createElement(type, props, props.children)
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    TextInput: host('TextInput'),
    Modal: host('Modal'),
    Switch: host('Switch'),
    FlatList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: {
      data?: { id: string }[]
      renderItem?: (info: { item: { id: string }; index: number }) => React.ReactNode
      ListHeaderComponent?: React.ReactNode
      ListEmptyComponent?: React.ReactNode
    }) => React.createElement(
      'FlatList',
      null,
      ListHeaderComponent,
      data && data.length > 0 && renderItem
        ? data.map((item, index) => renderItem({ item, index }))
        : ListEmptyComponent,
    ),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      absoluteFill: {},
    },
    Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
    useColorScheme: () => 'light',
    Alert: { alert: () => undefined },
  }
})

vi.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react')
  const host = (type: string) => (props: { children?: React.ReactNode }) => React.createElement(type, props, props.children)
  return { default: host('Svg'), Circle: host('Circle') }
})

vi.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const React = require('react') as typeof import('react')
  return { default: (props: { children?: React.ReactNode }) => React.createElement('Icon', props, props.children) }
})

vi.mock('react-native-safe-area-context', () => {
  const React = require('react') as typeof import('react')
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => React.createElement('SafeAreaProvider', null, children),
  }
})

function press(renderer: ReturnType<typeof create>, label: string) {
  const onPress = renderer.root.findByProps({ accessibilityLabel: label }).props.onPress
  if (typeof onPress !== 'function') throw new Error(`Missing press handler for ${label}`)
  act(() => {
    onPress()
  })
}

function collect(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(collect).join('\n')
  const children = node.children?.map((child) => (typeof child === 'string' ? child : collect(child))).join('\n') ?? ''
  return children
}

describe('screen components', () => {
  it('walks the two first-run screens and shows the uninstall warning', () => {
    const done = vi.fn()
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(<ThemeProvider><FirstRun onDone={done} /></ThemeProvider>)
    })
    expect(collect(renderer.toJSON())).toContain('Your payday budget, on this phone')
    press(renderer, 'Continue')
    const text = collect(renderer.toJSON())
    expect(text).toContain('Before you start')
    expect(text).toContain(UNINSTALL_WARNING)
    press(renderer, 'Start')
    expect(done).toHaveBeenCalledOnce()
  })

  it('renders the Free history line and edit/delete actions', () => {
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
      <ThemeProvider>
        <HistoryScreen
          rows={[{
            id: '1',
            kind: 'expense',
            date: '2026-10-20',
            amount: 80,
            title: 'Groceries',
            category: 'Groceries',
            description: '',
            icon: 'cart-outline',
            amountLabel: '₱80.00',
            dateLabel: 'Oct 20',
            detail: 'Need',
          }]}
          olderLineVisible
          emptyLabel="No entries in the last 90 days."
          onOpenSettings={() => undefined}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
      )
    })
    const text = collect(renderer!.toJSON())
    expect(text).toContain(OLDER_ENTRIES_LINE)
    expect(text).toContain('Groceries')
    expect(renderer!.root.findByProps({ accessibilityLabel: 'Edit Groceries' })).toBeTruthy()
    expect(renderer!.root.findByProps({ accessibilityLabel: 'Delete Groceries' })).toBeTruthy()
  })

  it('describes the budget ring with the spent amount', () => {
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <ThemeProvider>
          <BudgetRing spent={800} budget={1600} />
        </ThemeProvider>,
      )
    })
    const ring = renderer!.root.findByProps({ testID: 'budget-ring' })
    expect(ring.props.accessibilityLabel).toBe('Spent ₱800.00 of ₱1,600.00 this pay period.')
    expect(collect(renderer!.toJSON())).toContain('50%')
  })

  it('blocks sign-out with the unsynced count until the red button is confirmed', () => {
    const onSignOut = vi.fn()
    const onDelete = vi.fn()
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <ThemeProvider>
          <SettingsSheet
            syncEnabled
            signedIn
            configured
            notices={[]}
            pill={{ tone: 'pending', label: 'Not synced' }}
            unsyncedCount={2}
            onClose={() => undefined}
            onToggleSync={() => undefined}
            onSignIn={async () => undefined}
            onSignOut={onSignOut}
            onDeleteUnsynced={onDelete}
          />
        </ThemeProvider>,
      )
    })
    expect(collect(renderer.toJSON())).toContain(unsyncedSignOutLine(2))
    expect(collect(renderer.toJSON())).not.toContain('Sign out')
    press(renderer, DELETE_UNSYNCED_LABEL)
    expect(onDelete).not.toHaveBeenCalled()
    press(renderer, 'Confirm delete unsynced entries')
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('tells the reader the pay-period amount stays on the phone', () => {
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <ThemeProvider>
          <BudgetSheet initialAmount="900.00" onClose={() => undefined} onSave={() => undefined} />
        </ThemeProvider>,
      )
    })
    expect(collect(renderer.toJSON())).toContain(PERIOD_BUDGET_LINE)
  })
})
