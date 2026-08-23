import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
})

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: ObserverStub,
})
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ObserverStub })

for (const [attribute, name] of [
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:url'],
  ['property', 'og:type'],
  ['property', 'og:image'],
  ['name', 'description'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
] as const) {
  const meta = document.createElement('meta')
  meta.setAttribute(attribute, name)
  document.head.append(meta)
}
const canonical = document.createElement('link')
canonical.rel = 'canonical'
document.head.append(canonical)

HTMLDialogElement.prototype.showModal = function showModal(): void {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close(): void {
  this.removeAttribute('open')
}
