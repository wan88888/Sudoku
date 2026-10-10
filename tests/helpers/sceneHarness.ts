import { vi } from "vitest";

type Listener = (...args: any[]) => void;
export class TestEvents {
  private listeners = new Map<string, Map<Listener, boolean>>();
  on(name: string, fn: Listener) { this.add(name, fn, false); return this; }
  once(name: string, fn: Listener) { this.add(name, fn, true); return this; }
  private add(name: string, fn: Listener, once: boolean) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Map());
    this.listeners.get(name)!.set(fn, once);
  }
  off(name: string, fn: Listener) { this.listeners.get(name)?.delete(fn); return this; }
  emit(name: string, ...args: any[]) {
    for (const [fn, once] of [...(this.listeners.get(name) ?? [])]) {
      if (once) this.off(name, fn);
      fn(...args);
    }
  }
  listenerCount(name: string) { return this.listeners.get(name)?.size ?? 0; }
}

export function attachScene(scene: object) {
  const events = new TestEvents();
  const keyboard = new TestEvents();
  const start = vi.fn();
  const restart = vi.fn();
  Object.assign(scene, {
    add: {
      rectangle: () => ({ setOrigin() {} }),
      dom: () => ({ createFromHTML: (html: string) => {
        const root = document.createElement("div");
        root.innerHTML = html;
        document.body.append(root);
        return { getChildByID: (id: string) => root.querySelector(`#${id}`), destroy: () => root.remove() };
      } }),
    },
    input: { keyboard }, events, scene: { start, restart },
  });
  return { events, keyboard, start, restart };
}

export function button(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${id}`);
  return element;
}

export function pointer(element: Element, type: string, extras: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10, detail: 1 });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, pointerType: "touch", isPrimary: true, ...extras }).map(([key, value]) => [key, { value }])));
  element.dispatchEvent(event);
}
