(function () {
  class Spring1D {
    constructor(value = 0, stiffness = 180, damping = 22) {
      this.value = value;
      this.velocity = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }

    setTarget(target) {
      this.target = target;
    }

    step(target, dtSec) {
      const dt = Math.min(Math.max(dtSec, 0.001), 0.05);
      this.target = target;
      const displacement = this.value - target;
      const acceleration = -this.stiffness * displacement - this.damping * this.velocity;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
      return this.value;
    }

    snap(value) {
      this.value = value;
      this.velocity = 0;
      this.target = value;
    }
  }

  window.PetSpring = { Spring1D };
})();
