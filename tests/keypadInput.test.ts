import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindKeypadInput } from '../src/game/input/keypadInput';

class Key extends EventTarget {
  dataset = { value: '3' };
  disabled = false;
  captured: number | null = null;
  closest() { return this; }
  contains() { return true; }
  setPointerCapture(id: number) { this.captured = id; }
  hasPointerCapture(id: number) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}

describe('keypad pointer gestures', () => {
  let root: Key, key: Key;
  let input: ReturnType<typeof vi.fn>, highlight: ReturnType<typeof vi.fn>;
  let dispose: () => void;
  const fire = (type: string, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target: key, pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, detail: 1, ...properties }).map(([k,v]) => [k,{value:v}])));
    root.dispatchEvent(event);
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Element', Key);
    root = new Key(); key = new Key(); input = vi.fn(); highlight = vi.fn();
    dispose = bindKeypadInput(root as unknown as HTMLElement, { blocked: () => false, input, highlight });
  });
  afterEach(() => { dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['mouse', 'touch', 'pen'])('suppresses the click after a %s long press', (pointerType) => {
    fire('pointerdown', { pointerType });
    vi.advanceTimersByTime(260);
    expect(highlight).toHaveBeenCalledWith(3);
    fire('pointerup', { pointerType });
    fire('click');
    expect(input).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenLastCalledWith(null);
    expect(key.captured).toBeNull();
    fire('pointerdown'); fire('pointerup'); fire('click');
    expect(input).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('cancels a drag or interrupted touch without inserting a number', () => {
    fire('pointerdown'); fire('pointermove', { clientX: 20 });
    vi.advanceTimersByTime(500); fire('pointerup'); fire('click');
    expect(input).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalledWith(3);
    fire('pointerdown'); fire('pointercancel'); fire('click');
    expect(input).not.toHaveBeenCalled();
    fire('click', { detail: 0 });
    expect(input).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('removes pending timers and listeners on scene shutdown', () => {
    fire('pointerdown'); dispose();
    vi.advanceTimersByTime(500); fire('click');
    expect(highlight).not.toHaveBeenCalledWith(3);
    expect(input).not.toHaveBeenCalled();
  });
});
