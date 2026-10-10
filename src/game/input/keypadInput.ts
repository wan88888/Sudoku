interface KeypadActions {
  blocked: () => boolean;
  input: (value: number) => void;
  highlight: (value: number | null) => void;
}

export function bindKeypadInput(root: HTMLElement, actions: KeypadActions): () => void {
  let pointer: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let captureTarget: HTMLButtonElement | null = null;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const id = pointer;
    pointer = null;
    if (id !== null && captureTarget?.hasPointerCapture?.(id)) captureTarget.releasePointerCapture(id);
    captureTarget = null;
    actions.highlight(null);
  };
  const key = (event: Event) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.key-btn') : null;
    return element && root.contains(element) ? element : null;
  };
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || pointer !== null || actions.blocked()) return;
    const button = key(event);
    if (!button || button.disabled) return;
    suppressClick = false;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    // Capture on the button so the browser's subsequent click still targets that key.
    captureTarget = button;
    button.setPointerCapture?.(event.pointerId);
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      if (!actions.blocked()) actions.highlight(Number(button.dataset.value));
    }, 260);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === pointer) stop();
  };
  const cancel = (event?: PointerEvent) => {
    if (pointer === null || (event && event.pointerId !== pointer)) return;
    suppressClick = true;
    stop();
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId === pointer && Math.hypot(event.clientX - startX, event.clientY - startY) > 12) cancel(event);
  };
  const click = (event: MouseEvent) => {
    if (actions.blocked()) return;
    // Keyboard activation has detail=0 and should remain usable after a cancelled gesture.
    if (suppressClick && event.detail !== 0) { event.preventDefault(); return; }
    const button = key(event);
    const value = Number(button?.dataset.value);
    if (button && !button.disabled && Number.isInteger(value) && value >= 1 && value <= 9) actions.input(value);
  };
  const contextMenu = (event: Event) => { event.preventDefault(); };
  const blur = () => cancel();
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', cancel);
  root.addEventListener('pointermove', move);
  root.addEventListener('click', click);
  root.addEventListener('contextmenu', contextMenu);
  globalThis.addEventListener?.('blur', blur);
  return () => {
    stop();
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', cancel);
    root.removeEventListener('lostpointercapture', cancel);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('click', click);
    root.removeEventListener('contextmenu', contextMenu);
    globalThis.removeEventListener?.('blur', blur);
  };
}
