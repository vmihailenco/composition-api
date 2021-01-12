import { def } from '../utils'

const arrayProto: any = Array.prototype
export const augmentedArray = Object.create(arrayProto)

const arrayMethods = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
]

/**
 * Intercept mutating methods and emit events
 */
arrayMethods.forEach((method) => {
  // cache original method
  const original: any = arrayProto[method]
  def(augmentedArray, method, function mutator(this: any, ...args: any[]) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
