/**
 * 协程式任务队列（设计文档 §3 并发模型）：
 * - Node 单线程事件循环 + async/await，任务在 await 处让出，无需线程
 * - 并发上限可调（对应「同时跑几个 Blender 渲染进程」的旋钮）
 * - 失败任务只回调 onDone(id, false)，不影响队列继续
 */
export class TaskQueue {
  private items: { id: string; run: () => Promise<void> }[] = []
  private running = 0
  private concurrency: number

  onDone?: (id: string, ok: boolean) => void

  constructor(concurrency = 2) {
    this.concurrency = concurrency
  }

  push(id: string, run: () => Promise<void>): void {
    this.items.push({ id, run })
    void this.pump()
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n)
    void this.pump()
  }

  size(): number {
    return this.items.length + this.running
  }

  private async pump(): Promise<void> {
    while (this.running < this.concurrency && this.items.length > 0) {
      const item = this.items.shift()!
      this.running++
      try {
        await item.run()
        this.onDone?.(item.id, true)
      } catch {
        this.onDone?.(item.id, false)
      } finally {
        this.running--
      }
    }
  }
}
