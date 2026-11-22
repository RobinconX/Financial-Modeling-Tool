export class PromiseTimeoutError extends Error {
  readonly label: string

  constructor(label: string) {
    super(`Timed out: ${label}`)
    this.name = 'PromiseTimeoutError'
    this.label = label
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PromiseTimeoutError(label))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}