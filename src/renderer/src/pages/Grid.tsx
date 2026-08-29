import { useLibrary } from '../store/useLibrary'

// 网格页（Task 11 实现搜索/筛选/分页/缩略图，本文件先占位保证路由闭环）
export default function Grid(): JSX.Element {
  const view = useLibrary((s) => s.view)
  const setView = useLibrary((s) => s.setView)
  return (
    <div className="p-8">
      <button onClick={() => setView('home')} className="mb-4 rounded-md border px-3 py-1 hover:bg-accent">
        ← 返回
      </button>
      <p>大类：{view} —— 网格页将在 Task 11 实现</p>
    </div>
  )
}
