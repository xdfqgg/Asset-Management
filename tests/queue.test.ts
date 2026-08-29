import { it, expect } from 'vitest'
import { TaskQueue } from '../src/main/thumbs/queue'

it('并发上限生效且失败任务不影响后续', async () => {
  const q = new TaskQueue(2)
  let running = 0
  let maxRunning = 0
  const done: string[] = []
  q.onDone = (id, ok) => done.push(id + (ok ? ':ok' : ':fail'))

  for (let i = 0; i < 5; i++) {
    q.push(`t${i}`, async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 20))
      running--
      if (i === 2) throw new Error('boom')
    })
  }

  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (done.length === 5) {
        clearInterval(poll)
        resolve()
      }
    }, 10)
  })

  expect(maxRunning).toBeLessThanOrEqual(2)
  expect(done).toContain('t2:fail')
  expect(done.filter((d) => d.endsWith(':ok'))).toHaveLength(4)
})

it('setConcurrency 动态调整并发数', async () => {
  const q = new TaskQueue(1)
  let maxRunning = 0
  let running = 0
  const tasks: Promise<void>[] = []
  for (let i = 0; i < 4; i++) {
    tasks.push(
      new Promise<void>((resolve) => {
        q.push(`t${i}`, async () => {
          running++
          maxRunning = Math.max(maxRunning, running)
          await new Promise((r) => setTimeout(r, 15))
          running--
          resolve()
        })
      })
    )
  }
  q.setConcurrency(2)
  await Promise.all(tasks)
  expect(maxRunning).toBeLessThanOrEqual(2)
})
