(function () {
  const PRESETS = {
    nod: [
      { t: 0, ParamAngleX: 0 },
      { t: 180, ParamAngleX: 12 },
      { t: 360, ParamAngleX: -4 },
      { t: 520, ParamAngleX: 0 }
    ],
    shake: [
      { t: 0, ParamAngleZ: 0 },
      { t: 120, ParamAngleZ: 8 },
      { t: 240, ParamAngleZ: -8 },
      { t: 360, ParamAngleZ: 6 },
      { t: 480, ParamAngleZ: -4 },
      { t: 620, ParamAngleZ: 0 }
    ],
    surprise: [
      { t: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamBrowLY: 0.4, ParamBrowRY: 0.4 },
      { t: 400, ParamEyeLOpen: 0.85, ParamEyeROpen: 0.85, ParamBrowLY: 0.1, ParamBrowRY: 0.1 },
      { t: 900, ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8, ParamBrowLY: 0, ParamBrowRY: 0 }
    ],
    shy: [
      { t: 0, ParamAngleZ: 0, ParamCheek: 0 },
      { t: 300, ParamAngleZ: -10, ParamCheek: 0.35, ParamEyeLOpen: 0.55, ParamEyeROpen: 0.55 },
      { t: 1200, ParamAngleZ: -4, ParamCheek: 0.2, ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75 },
      { t: 1800, ParamAngleZ: 0, ParamCheek: 0, ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8 }
    ]
  };

  class Choreographer {
    constructor(cooldownMs = 1200) {
      this.cooldownMs = cooldownMs;
      this.cooldownLeft = 0;
      this.active = null;
      this.elapsed = 0;
      this.params = {};
    }

    canPlay() {
      return !this.active && this.cooldownLeft <= 0;
    }

    play(name) {
      const track = PRESETS[name];
      if (!track || !this.canPlay()) return false;

      this.active = { name, track };
      this.elapsed = 0;
      this.params = {};
      return true;
    }

    update(dtMs) {
      if (this.cooldownLeft > 0) this.cooldownLeft -= dtMs;

      if (!this.active) return;

      this.elapsed += dtMs;
      const { track } = this.active;
      const last = track[track.length - 1];

      if (this.elapsed >= last.t) {
        this.active = null;
        this.cooldownLeft = this.cooldownMs;
        this.params = {};
        return;
      }

      let prev = track[0];
      let next = track[track.length - 1];

      for (let i = 1; i < track.length; i += 1) {
        if (this.elapsed <= track[i].t) {
          next = track[i];
          prev = track[i - 1];
          break;
        }
      }

      const span = Math.max(1, next.t - prev.t);
      const t = (this.elapsed - prev.t) / span;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      this.params = {};
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      keys.forEach((key) => {
        if (key === 't') return;
        const a = prev[key] ?? 0;
        const b = next[key] ?? 0;
        this.params[key] = a + (b - a) * eased;
      });
    }

    apply(coreModel) {
      Object.entries(this.params).forEach(([id, value]) => {
        coreModel.setParameterValueById(id, value);
      });
    }
  }

  window.PetChoreographer = { Choreographer, PRESETS };
})();
