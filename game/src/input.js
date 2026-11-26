// Sky Courier — keyboard and mouse input.
// Keyboard flies the plane; the mouse clicks menu cards and drags the
// on-screen throttle slider. Every frame the game reads a snapshot.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, consumed by the game
  const mouse = { x: 0, y: 0, down: false, clicked: false, dragY: null };
  const sliders = []; // {x,y,w,h,get,set} registered by the renderer

  const KEYMAP = {
    ArrowUp: 'pitchUp',
    ArrowDown: 'pitchDown',
    KeyW: 'throttleUp',
    KeyS: 'throttleDown',
    ArrowLeft: 'rollLeft',
    ArrowRight: 'rollRight',
    KeyA: 'rollLeft',
    KeyD: 'rollRight',
    Space: 'airbrake',
    KeyG: 'gear',
    KeyF: 'flaps',
    KeyP: 'pause',
    KeyM: 'mute',
    KeyR: 'restart',
    Digit1: 'mission1',
    Digit2: 'mission2',
    Digit3: 'mission3',
    Enter: 'confirm',
    Escape: 'back',
  };

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) pressed.add(action);
    keys.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) keys.delete(action);
  }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    if (mouse.down && mouse.dragY !== null) {
      for (const s of sliders) {
        if (mouse.x >= s.x - 14 && mouse.x <= s.x + s.w + 14) {
          s.set(1 - (mouse.y - s.y) / s.h);
        }
      }
    }
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
    for (const s of sliders) {
      if (
        mouse.x >= s.x - 14 &&
        mouse.x <= s.x + s.w + 14 &&
        mouse.y >= s.y - 10 &&
        mouse.y <= s.y + s.h + 10
      ) {
        mouse.dragY = mouse.y;
        s.set(1 - (mouse.y - s.y) / s.h);
        break;
      }
    }
  }
  function onMouseUp() {
    mouse.down = false;
    mouse.dragY = null;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
    mouse.dragY = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    sliders,
    held(action) {
      return keys.has(action);
    },
    // True once per physical press; the game consumes it.
    wasPressed(action) {
      if (pressed.has(action)) {
        pressed.delete(action);
        return true;
      }
      return false;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    // The renderer registers clickable rectangles; the game asks whether
    // the last click landed inside one.
    clickedIn(rect) {
      return (
        mouse.clicked &&
        mouse.x >= rect.x &&
        mouse.x <= rect.x + rect.w &&
        mouse.y >= rect.y &&
        mouse.y <= rect.y + rect.h
      );
    },
  };
}
