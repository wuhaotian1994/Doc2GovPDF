// A private worker for the form writer. Existing Word-editor drafts remain separate.
export class WriterEngine {
  constructor(fonts = () => ({})) {
    this.fonts = fonts;
    this.sequence = 0;
    this.pending = new Map();
    this.chain = Promise.resolve();
  }
  call(method, ...args) {
    const task = this.chain.then(async () => { await this.start(); return this.send(method, args); });
    this.chain = task.catch(() => {});
    return task;
  }
  start() {
    if (this.boot) return this.boot;
    this.boot = new Promise((resolve, reject) => {
      let worker;
      try { worker = this.worker = new Worker('./engine-worker.js'); }
      catch (error) { reject(error); queueMicrotask(() => this.reset(error)); return; }
      this.rejectBoot = reject;
      this.timer = setTimeout(() => this.reset(Error('排版引擎加载超时，请点击刷新预览重试。')), 120000);
      worker.onerror = () => this.reset(Error('排版暂时中断，填写内容仍保留。请点击刷新预览重试。'));
      worker.onmessage = async ({data}) => {
        if (worker !== this.worker) return;
        if (data.fatal) { this.reset(Error('排版引擎加载失败，请检查网络后刷新预览。')); return; }
        if (data.ready) {
          try {
            const fonts = await this.fonts();
            for (const [role, value] of Object.entries(fonts)) await this.send('RegisterFont', [role, value]);
            clearTimeout(this.timer); this.rejectBoot = null; resolve();
          } catch (error) { this.reset(error); }
          return;
        }
        const request = this.pending.get(data.id);
        if (request) { this.pending.delete(data.id); clearTimeout(request.timer); data.error ? request.reject(Error(data.error)) : request.resolve(data.value); }
      };
    });
    return this.boot;
  }
  send(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.reset(Error('排版处理超时，内容仍保留。请重试或缩短正文。')), 120000);
      this.pending.set(id, {resolve, reject, timer});
      try { this.worker.postMessage({id, request:{method, args}}); }
      catch (error) { this.reset(error); }
    });
  }
  reset(error = Error('字体已更新，请重新预览。')) {
    this.worker?.terminate(); this.worker = null; this.boot = null;
    clearTimeout(this.timer); this.rejectBoot?.(error); this.rejectBoot = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
