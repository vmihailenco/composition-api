import { isRef, ShallowUnwrapRef } from './ref'
import { isReactive, markRaw } from './reactive'
import { proxy } from '../utils'

export function proxyRefs<T extends Record<string, any>>(
  obj: T
): ShallowUnwrapRef<T> {
  if (isReactive(obj)) {
    return obj as ShallowUnwrapRef<T>
  }

  const value: Record<string, any> = {}

  for (const key of Object.keys(obj)) {
    if (isRef(obj[key])) {
      proxy(value, key, {
        get() {
          return obj[key].value
        },
        set(v: unknown) {
          obj[key].value = v
          return true
        },
      })
    } else {
      proxy(value, key, {
        get() {
          return obj[key]
        },
        set(v: unknown) {
          // @ts-ignore
          obj[key] = v
        },
      })
    }
  }

  return markRaw(value) as ShallowUnwrapRef<T>
}
