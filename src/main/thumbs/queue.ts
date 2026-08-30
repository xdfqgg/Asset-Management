/**
 * 协程式任务队列（设计文档 §3 并发模型）——双车道版本：
 * - 高优先级（high）：图片缩放、.blend 预览提取这类毫秒级任务，永远先跑，总并发 = concurrency
 * - 低优先级（low）：Blender 渲染这类分钟级任务，最多同时 maxLow 个，不占满车道
 * 这样几百张图片不会再排在几个渲染任务后面干等（用户反馈的性能问题）。
 * 低优先级任务会在高优先级任务不断涌入时饥饿——对缩略图场景可接受（图片理应优先）。
 */
type Priority = 'high' | 'low'

interface QueueItem {
  id: string
  run: () => Promise<void>
  priority: Priority
}

export class TaskQueue {
  private high: QueueItem[] = []
  private low: QueueItem[] = []
  private running = 0
  private lowRunning = 0
  private concurrency: number
  private runningIds = new Set<string>()
  maxLow: number

  onDone?: (id: string, ok: boolean) => void

  constructor(concurrency = 6, maxLow = 2) {
    this.concurrency = Math.max(1, concurrency)
    this.maxLow = Math.max(1, maxLow)
  }

  push(id: string, run: () => Promise<void>, priority: Priority = 'high'): void {
    // 同 id 去重（审查 A7）：排队中或运行中已有同 id 任务则跳过——防止 add+change 双事件并发双跑
    if (this.runningIds.has(id) || this.high.some((i) => i.id === id) || this.low.some((i) => i.id === id)) return
    ;(priority === 'low' ? this.low : this.high).push({ id, run, priority })
    void this.pump()
  }

  setLowConcurrency(n: number): void {
    this.maxLow = Math.max(1, n)
    void this.pump()
  }

  size(): number {
    return this.high.length + this.low.length + this.running
  }

  private async pump(): Promise<void> {
    while (this.running < this.concurrency) {
      const item = this.high.shift() ?? (this.lowRunning < this.maxLow ? this.low.shift() : undefined)
      if (!item) break
      this.running++
      this.runningIds.add(item.id)
      if (item.priority === 'low') this.lowRunning++
      try {
        await item.run()
        this.onDone?.(item.id, true)
      } catch {
        this.onDone?.(item.id, false)
      } finally {
        this.running--
        this.runningIds.delete(item.id)
        if (item.priority === 'low') this.lowRunning--
      }
    }
  }
}
