import { it, expect } from 'vitest'
import { TaskQueue } from '../src/main/thumbs/queue'

it('并发上限生效且失败任务不影响后续', async () => {
  const q = new TaskQueue(2, 2)
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

it('高优先级任务插队：空出的槽位先给高优先级', async () => {
  const q = new TaskQueue(1, 1)
  const order: string[] = []
  // low1 先占住唯一的槽；排队中来了两个 high 和一个 low2
  q.push('low1', async () => {
    order.push('low1')
    await new Promise((r) => setTimeout(r, 30))
  }, 'low')
  q.push('high1', async () => {
    order.push('high1')
  })
  q.push('high2', async () => {
    order.push('high2')
  })
  q.push('low2', async () => {
    order.push('low2')
  }, 'low')
  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (order.length === 4) {
        clearInterval(poll)
        resolve()
      }
    }, 10)
  })
  // low1 已在执行不可抢占；但空出的槽必须优先给 high，low2 最后
  expect(order).toEqual(['low1', 'high1', 'high2', 'low2'])
})

it('低优先级任务受 maxLow 限制，不占满全部并发', async () => {
  const q = new TaskQueue(4, 1) // 总并发 4，但低优先级最多同时 1 个
  let lowRunning = 0
  let maxLow = 0
  const done: string[] = []
  q.onDone = (id) => done.push(id)
  for (let i = 0; i < 3; i++) {
    q.push(`low${i}`, async () => {
      lowRunning++
      maxLow = Math.max(maxLow, lowRunning)
      await new Promise((r) => setTimeout(r, 30))
      lowRunning--
    }, 'low')
  }
  for (let i = 0; i < 3; i++) {
    q.push(`high${i}`, async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (done.length === 6) {
        clearInterval(poll)
        resolve()
      }
    }, 10)
  })
  expect(maxLow).toBe(1)
})

it('setLowConcurrency 动态调整慢车道并发', () => {
  const q = new TaskQueue(4, 1)
  q.setLowConcurrency(3)
  expect(q.maxLow).toBe(3)
  q.setLowConcurrency(0)
  expect(q.maxLow).toBe(1)
})
