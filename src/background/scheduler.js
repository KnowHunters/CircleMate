// Serialize state commits while allowing explicit user work to pass background pagination.
export class Scheduler {
  constructor() { this.jobs = []; this.running = false; }
  add(run, priority = 0) {
    return new Promise((resolve, reject) => {
      this.jobs.push({ run, priority, resolve, reject }); this.jobs.sort((a, b) => b.priority - a.priority);
      void this.drain();
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try { while (this.jobs.length) { const job = this.jobs.shift(); try { job.resolve(await job.run()); } catch (error) { job.reject(error); } } }
    finally { this.running = false; }
  }
}
