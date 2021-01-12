import type { VueConstructor } from 'vue'
import {
  ComponentInstance,
  SetupContext,
  SetupFunction,
  Data,
} from './component'
import { isReactive, toRefs } from './reactivity'
import { isPlainObject, assert, proxy, warn, isFunction, def } from './utils'
import vmStateManager from './utils/vmStateManager'
import {
  updateTemplateRef,
  activateCurrentInstance,
  resolveScopedSlots,
  asVmProperty,
} from './utils/instance'
import { createObserver, reactive } from './reactivity/reactive'

export function mixin(Vue: VueConstructor) {
  Vue.mixin({
    beforeCreate: functionApiInit,
    mounted(this: ComponentInstance) {
      updateTemplateRef(this)
    },
    updated(this: ComponentInstance) {
      updateTemplateRef(this)
    },
  })

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */

  function functionApiInit(this: ComponentInstance) {
    const vm = this
    const $options = vm.$options
    const { setup, render } = $options

    if (render) {
      // keep currentInstance accessible for createElement
      $options.render = function (...args: any): any {
        return activateCurrentInstance(vm, () => render.apply(this, args))
      }
    }

    if (!setup) {
      return
    }
    if (typeof setup !== 'function') {
      if (__DEV__) {
        warn(
          'The "setup" option should be a function that returns a object in component definitions.',
          vm
        )
      }
      return
    }

    const { data } = $options
    // wrapper the data option, so we can invoke setup before data get resolved
    $options.data = function wrappedData() {
      initSetup(vm, vm.$props)
      return typeof data === 'function'
        ? (data as (
            this: ComponentInstance,
            x: ComponentInstance
          ) => object).call(vm, vm)
        : data || {}
    }
  }

  function initSetup(vm: ComponentInstance, props: Record<any, any> = {}) {
    const setup = vm.$options.setup!
    const ctx = createSetupContext(vm)

    // fake reactive for `toRefs(props)`
    def(props, '__ob__', createObserver())

    // resolve scopedSlots and slots to functions
    // @ts-expect-error
    resolveScopedSlots(vm, ctx.slots)

    let binding: ReturnType<SetupFunction<Data, Data>> | undefined | null
    activateCurrentInstance(vm, () => {
      // make props to be fake reactive, this is for `toRefs(props)`
      binding = setup(props, ctx)
    })

    if (!binding) return
    if (isFunction(binding)) {
      // keep typescript happy with the binding type.
      const bindingFunc = binding
      // keep currentInstance accessible for createElement
      vm.$options.render = () => {
        // @ts-expect-error
        resolveScopedSlots(vm, ctx.slots)
        return activateCurrentInstance(vm, () => bindingFunc())
      }
      return
    } else if (isPlainObject(binding)) {
      if (isReactive(binding)) {
        binding = toRefs(binding) as Data
      }

      vmStateManager.set(vm, 'rawBindings', binding)
      const bindingObj = binding

      Object.keys(bindingObj).forEach((name) => {
        let bindingValue: any = bindingObj[name]
        if (isFunction(bindingValue)) {
          bindingValue = bindingValue.bind(vm)
        }
        asVmProperty(vm, name, bindingValue)
      })

      return
    }

    if (__DEV__) {
      assert(
        false,
        `"setup" must return a "Object" or a "Function", got "${Object.prototype.toString
          .call(binding)
          .slice(8, -1)}"`
      )
    }
  }

  function createSetupContext(
    vm: ComponentInstance & { [x: string]: any }
  ): SetupContext {
    const ctx = { slots: {} } as SetupContext

    const propsPlain = [
      'root',
      'parent',
      'refs',
      'listeners',
      'isServer',
      'ssrContext',
    ]
    const propsReactiveProxy = ['attrs']
    const methodReturnVoid = ['emit']

    propsPlain.forEach((key) => {
      let srcKey = `$${key}`
      proxy(ctx, key, {
        get: () => vm[srcKey],
        set() {
          warn(
            `Cannot assign to '${key}' because it is a read-only property`,
            vm
          )
        },
      })
    })

    propsReactiveProxy.forEach((key) => {
      let srcKey = `$${key}`
      proxy(ctx, key, {
        get: () => {
          const data = reactive({})
          const source = vm[srcKey]

          for (const attr of Object.keys(source)) {
            proxy(data, attr, {
              get: () => {
                // to ensure it always return the latest value
                return vm[srcKey][attr]
              },
            })
          }

          return data
        },
        set() {
          warn(
            `Cannot assign to '${key}' because it is a read-only property`,
            vm
          )
        },
      })
    })

    methodReturnVoid.forEach((key) => {
      const srcKey = `$${key}`
      proxy(ctx, key, {
        get() {
          return (...args: any[]) => {
            const fn: Function = vm[srcKey]
            fn.apply(vm, args)
          }
        },
      })
    })
    if (process.env.NODE_ENV === 'test') {
      ;(ctx as any)._vm = vm
    }
    return ctx
  }
}
