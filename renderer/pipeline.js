(function () {
  /**
   * Ordered parameter pipeline — later stages override earlier ones.
   * idle → gaze → expression → choreographer → lipSync → persistent → workProps
   */
  class ParameterPipeline {
    constructor() {
      this.stages = [];
    }

    register(name, fn) {
      this.stages.push({ name, fn });
    }

    run(ctx) {
      this.stages.forEach(({ fn }) => fn(ctx));
    }
  }

  window.PetPipeline = { ParameterPipeline };
})();
