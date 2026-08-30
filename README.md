# AssetManagement

Blender / UE 资产管理桌面软件：把散落在本地文件夹的素材集中管理——自动扫描入库、缩略图预览、大类分类（与 Blender 资产目录互通）、标签与系列标签、搜索、元信息查看、一键导入 Blender。

技术栈：Electron + React + TypeScript + electron-vite + SQLite（better-sqlite3）+ Tailwind/shadcn/ui + zustand。

## 功能

- **自动入库**：添加素材根目录后自动全量扫描；之后实时监听（chokidar），新文件 3 秒内出现
- **缩略图**：`.blend` 提取内置预览图（支持 Blender 5.x 整文件 zstd 压缩格式）；图片秒缩；FBX/OBJ 后台调用 Blender 无界面渲染（顺带统计面数/顶点数）；材质文件借用包内预览图
- **分类互通**：读写 `blender_assets.cats.txt`，在应用里建的大类 Blender 资产浏览器直接可见
- **系列标签**：按 PBR 命名惯例自动识别「机甲.fbx + 机甲_Albedo.png」为一族，分组视图把材质包整合成一张卡片
- **一键导入 Blender**：配合 Blender 插件（本仓库 `resources/addon/`），Link 引用 / Append 复制进当前场景

## 开发

```bash
npm install                # npm 12 需先放行安装脚本（见 package.json allowScripts）
npm run rebuild:node       # 跑测试前：原生模块切 Node ABI
npm test                   # 单元/组件/集成测试（vitest）
npm run typecheck
npm run rebuild:electron   # 跑应用前：原生模块切 Electron ABI
npm run dev                # 开发模式（热更新）
npm run smoke              # 冒烟测试（需先 npm run build）
npm run dist:win           # 打包 Windows 安装包（dist/）
```

> **ABI 双轨制**：better-sqlite3 是原生模块，Node（测试）和 Electron（应用）各需一套二进制，用 `rebuild:node` / `rebuild:electron` 切换；切换前需关闭运行中的应用（Windows 会锁定已加载的 .node 文件）。

## 使用

1. 设置（首页右上 ⚙）→ 添加素材根目录
2. 填 Blender 路径（如 `D:/SteamLibrary/steamapps/common/Blender/blender.exe`）
3. Blender 里安装插件：编辑 → 偏好设置 → 插件 → 安装 → `resources/addon/assetmanagement_addon.py` → 启用
4. 详情面板点「Link 引用」/「Append 复制」→ 资产出现在 Blender 当前场景

## 目录结构

```
src/main/      主进程（Node）：db 数据层 / scan 扫描监听 / meta 元信息 / thumbs 缩略图管线 / catalogs Blender 目录 / blender 插件客户端 / ipc
src/preload/   contextBridge 桥（window.am 白名单 API）
src/renderer/  React 界面：Home 首页 / Grid 网格（分组视图）/ DetailDrawer 详情 / Settings 设置
src/shared/    共享类型
resources/     随应用分发的资源：render_asset.py（渲染脚本）/ addon（Blender 插件）
tests/         vitest 测试（含 .blend 格式解析 fixture）
e2e/           Playwright 冒烟测试
```
