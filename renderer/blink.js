(function () {
  const rand = (min, max) => min + Math.random() * (max - min);

  class BlinkStateMachine {
    constructor(options = {}) {
      this.closeMs = options.closeMs ?? 75;
      this.openMinMs = options.openMinMs ?? 150;
      this.openMaxMs = options.openMaxMs ?? 300;
      this.intervalMinMs = options.intervalMinMs ?? 3000;
      this.intervalMaxMs = options.intervalMaxMs ?? 8000;
      this.eyeIds = options.eyeIds ?? ['ParamEyeLOpen', 'ParamEyeROpen', 'Param3'];
      this.baseOpen = 0.8;
      this.factor = 1;
      this.state = 'idle';
      this.timerMs = rand(this.intervalMinMs, this.intervalMaxMs);
    }

    setBaseOpen(value) {
      this.baseOpen = Math.max(0, Math.min(1.2, value));
    }

    update(dtMs) {
      this.timerMs -= dtMs;

      if (this.state === 'idle') {
        this.factor = 1;
        if (this.timerMs <= 0) {
          this.state = 'closing';
          this.timerMs = this.closeMs;
        }
        return;
      }

      if (this.state === 'closing') {
        const t = 1 - Math.max(0, this.timerMs) / this.closeMs;
        this.factor = 1 - t;
        if (this.timerMs <= 0) {
          this.state = 'opening';
          this.timerMs = rand(this.openMinMs, this.openMaxMs);
        }
        return;
      }

      if (this.state === 'opening') {
        const duration = this.openMaxMs;
        const t = 1 - Math.max(0, this.timerMs) / duration;
        this.factor = Math.min(1, t);
        if (this.timerMs <= 0) {
          this.state = 'idle';
          this.timerMs = rand(this.intervalMinMs, this.intervalMaxMs);
        }
      }
    }

    apply(coreModel) {
      const open = this.baseOpen * this.factor;
      this.eyeIds.forEach((id) => {
        coreModel.setParameterValueById(id, open);
      });
    }

    forceBlink() {
      if (this.state === 'idle') {
        this.state = 'closing';
        this.timerMs = this.closeMs;
      }
    }
  }

  window.PetBlink = { BlinkStateMachine };
})();
