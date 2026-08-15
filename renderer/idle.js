(function () {
  const rand = (min, max) => min + Math.random() * (max - min);

  class IdleStateMachine {
    constructor() {
      this.mode = 'alert';
      this.timerMs = rand(4000, 9000);
      this.lookTargetX = 0;
      this.lookTargetY = 0;
      this.drowsyLevel = 0;
    }

    update(dtMs) {
      this.timerMs -= dtMs;

      if (this.timerMs <= 0) {
        if (this.mode === 'alert') {
          this.mode = 'look_around';
          this.timerMs = rand(2500, 5000);
          this.lookTargetX = rand(-0.35, 0.35);
          this.lookTargetY = rand(-0.12, 0.18);
        } else if (this.mode === 'look_around') {
          this.mode = Math.random() < 0.35 ? 'drowsy' : 'alert';
          this.timerMs = this.mode === 'drowsy' ? rand(15000, 45000) : rand(5000, 12000);
          this.lookTargetX = 0;
          this.lookTargetY = 0;
        } else if (this.mode === 'drowsy') {
          this.mode = Math.random() < 0.45 ? 'doze' : 'alert';
          this.timerMs = this.mode === 'doze' ? rand(8000, 20000) : rand(6000, 14000);
        } else if (this.mode === 'doze') {
          this.mode = 'alert';
          this.timerMs = rand(4000, 9000);
        }
      }

      const targetDrowsy = this.mode === 'drowsy' ? 0.45 : this.mode === 'doze' ? 0.85 : 0;
      this.drowsyLevel += (targetDrowsy - this.drowsyLevel) * 0.02;
    }

    getGazeOffset() {
      if (this.mode === 'alert') return { x: 0, y: 0 };
      return { x: this.lookTargetX, y: this.lookTargetY };
    }

    getBlinkBase() {
      if (this.mode === 'doze') return 0.15;
      if (this.mode === 'drowsy') return 0.55;
      return 0.8;
    }

    getHeadDroop() {
      return this.drowsyLevel * -8;
    }
  }

  window.PetIdle = { IdleStateMachine };
})();
