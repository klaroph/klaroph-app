declare module 'react-test-renderer' {
  import type { ReactElement } from 'react'

  export type ReactTestRendererJSON = {
    type: string
    props: Record<string, unknown>
    children: null | Array<ReactTestRendererJSON | string>
  }

  export type ReactTestInstance = {
    props: Record<string, unknown>
    findByProps(props: Record<string, unknown>): ReactTestInstance
  }

  export type ReactTestRenderer = {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null
    root: ReactTestInstance
  }

  export function create(element: ReactElement): ReactTestRenderer
}
