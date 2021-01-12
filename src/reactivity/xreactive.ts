import {
  def,
  hasOwn,
  isPlainObject,
  isUndef,
  isPrimitive,
  isArray,
  isValidArrayIndex,
  warn,
  getVueInternalClasses,
} from '../utils'
import { RefKey } from '../utils/symbols'
import { isRef, UnwrapRef } from './ref'
import { isRaw } from './reactive'
import { arrayMethods } from './array'

export let shouldObserve: boolean = true

type AnyObject = Record<string | number | symbol, any>

export function shallowReactive<T extends AnyObject>(obj: T): T {
  if (__DEV__ && !obj) {
    warn('"shallowReactive()" is called without provide an "object".')
    // @ts-ignore
    return
  }

  if (
    !(isPlainObject(obj) || isArray(obj)) ||
    isRaw(obj) ||
    !Object.isExtensible(obj)
  ) {
    return obj
  }

  new Observer(obj)
  observeObj(obj, true)
  return obj
}

export function reactive<T extends object>(obj: T): UnwrapRef<T> {
  if (__DEV__ && !obj) {
    warn('"reactive()" is called without provide an "object".')
    // @ts-ignore
    return
  }

  observe(obj)
  return obj as UnwrapRef<T>
}

//------------------------------------------------------------------------------

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | AnyObject, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target as any).__ob__
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.'
      )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

//------------------------------------------------------------------------------

class Observer {
  value: any
  dep: any // Dep
  vmCount: number // number of vms that have this object as root $data

  constructor(value: any) {
    const internal = getVueInternalClasses()

    this.value = value
    this.dep = new internal.Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
  }

  observeArray(items: any[]) {
    observeArray(items)
  }
}

/**
 * Walk through all properties and convert them into
 * getter/setters. This method should only be called when
 * value type is Object.
 */
function observeObj(obj: AnyObject, shallow = false) {
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = obj[key]
    defineReactive(obj, key, val, shallow)
  }
}

/**
 * Observe a list of Array items.
 */
function observeArray(items: Array<any>) {
  for (let i = 0, l = items.length; i < l; i++) {
    observe(items[i])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any): Observer | void {
  if (
    !(isPlainObject(value) || isArray(value)) ||
    value._isVue ||
    isRaw(value) ||
    !Object.isExtensible(value)
  ) {
    return
  }

  let ob: Observer | void

  if (value && hasOwn(value, '__ob__')) {
    ob = value.__ob__
  } else if (shouldObserve) {
    ob = new Observer(value)
    if (Array.isArray(value)) {
      protoAugment(value, arrayMethods)
      observeArray(value)
    } else {
      observeObj(value)
    }
  }

  return ob
}

export function defineReactive(
  obj: AnyObject,
  key: string,
  val: any,
  shallow?: boolean
) {
  const internal = getVueInternalClasses()
  const dep = new internal.Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb: Observer | void
  if (!shallow) {
    childOb = observe(val)
  }

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      let value = getter ? getter.call(obj) : val
      if (!shallow && key !== RefKey && isRef(value)) {
        value = value.value
      }

      if (internal.Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val

      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      // #7981: for accessor properties without setter
      if (getter && !setter) return

      if (setter) {
        setter.call(obj, newVal)
      } else if (!shallow && key !== RefKey && isRef(value) && !isRef(newVal)) {
        value.value = newVal
      } else {
        val = newVal
      }

      if (!shallow) {
        childOb = observe(newVal)
      }

      dep.notify()
    },
  })
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target: any, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}
