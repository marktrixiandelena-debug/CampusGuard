import type { ReactNode } from 'react'
import { DemoContext, useStoreValue } from './store'
export function DemoProvider({children}:{children:ReactNode}){return <DemoContext.Provider value={useStoreValue()}>{children}</DemoContext.Provider>}
