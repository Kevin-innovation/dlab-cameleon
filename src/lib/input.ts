export type TouchLookState = {
  pointerId: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
};

export class GameInputState {
  readonly keyboardKeys = new Set<string>();
  readonly touchKeys = new Set<string>();
  readonly touchJoystickKeys = new Set<string>();
  readonly touchLook: TouchLookState = { pointerId: -1, x: 0, y: 0, dx: 0, dy: 0 };

  clearKeyboard() {
    this.keyboardKeys.clear();
  }

  clearTouch() {
    this.touchKeys.clear();
    this.touchJoystickKeys.clear();
    this.touchLook.pointerId = -1;
    this.touchLook.dx = 0;
    this.touchLook.dy = 0;
  }

  clearAll() {
    this.clearKeyboard();
    this.clearTouch();
  }

  setJoystick(keys: string[]) {
    for (const key of this.touchJoystickKeys) this.touchKeys.delete(key);
    this.touchJoystickKeys.clear();
    for (const key of keys) {
      this.touchJoystickKeys.add(key);
      this.touchKeys.add(key);
    }
  }

  clearJoystick() {
    for (const key of this.touchJoystickKeys) this.touchKeys.delete(key);
    this.touchJoystickKeys.clear();
  }
}
