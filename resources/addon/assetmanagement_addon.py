# AssetManagement Bridge —— Blender 插件（设计文档 §8）
# 职责：接收 AssetManagement 桌面应用的一键导入指令（Link 引用 / Append 复制进当前场景）
# 安装：Blender → 编辑 → 偏好设置 → 插件 → 安装 → 选本文件 → 勾选启用
# 原理：插件内起本地 HTTP 服务（127.0.0.1:8491）；bpy 数据只能主线程读写，
#       所以 HTTP 线程只收单，主线程用 bpy.app.timers 定时取单执行（经典模式）
bl_info = {
    "name": "AssetManagement Bridge",
    "author": "xdfqgg",
    "version": (1, 0, 0),
    "blender": (5, 0, 0),
    "location": "顶部菜单栏",
    "description": "接收 AssetManagement 的一键导入指令（Link / Append）",
    "category": "Import-Export",
}

import bpy
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8491
# HTTP 线程 → 主线程的指令队列
_pending = []  # {"path": str, "mode": str, "event": threading.Event, "error": [str]}


def instantiate_top_collections(collections, scene):
    """把「顶层集合」（不被其他集合引用的集合）实例化进场景，放到 3D 光标处"""
    top = [c for c in collections if not any(c in other.children for other in collections)]
    created = []
    for col in top:
        obj = bpy.data.objects.new(col.name, None)
        obj.instance_type = 'COLLECTION'
        obj.instance_collection = col
        obj.location = scene.cursor.location
        scene.collection.objects.link(obj)
        created.append(obj)
    return created


def import_asset(path, mode):
    ext = os.path.splitext(path)[1].lower()
    scene = bpy.context.scene
    if ext == '.blend':
        # Link = 引用（数据留在原文件，工程小但依赖原文件）；Append = 复制进当前工程
        link = mode == 'link'
        with bpy.data.libraries.load(path, link=link) as (src, dst):
            dst.collections = list(src.collections)
            dst.objects = list(src.objects)
        instantiate_top_collections(dst.collections, scene)
        return
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        bpy.ops.import_scene.obj(filepath=path)
    elif ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f'不支持的格式: {ext}')


def _timer():
    """主线程定时器：从队列取单执行（bpy 只能在主线程操作）"""
    while _pending:
        item = _pending.pop(0)
        try:
            import_asset(item['path'], item['mode'])
        except Exception as e:  # noqa: BLE001 —— 错误回传给 HTTP 线程
            item['error'].append(str(e))
        item['event'].set()
    return 0.2


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self._reply(200, {'status': 'ok', 'port': PORT})
        else:
            self._reply(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        if self.path != '/import':
            self._reply(404, {'ok': False, 'error': 'not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length) or b'{}')
            path = str(data.get('path', ''))
            mode = str(data.get('mode', 'append'))
            if not path or mode not in ('link', 'append'):
                raise ValueError('参数错误：需要 path 与 mode(link|append)')
            item = {'path': path, 'mode': mode, 'event': threading.Event(), 'error': []}
            _pending.append(item)
            # 等主线程定时器执行完（最多 15 秒），把真实结果回给桌面应用
            if item['event'].wait(15):
                if item['error']:
                    self._reply(500, {'ok': False, 'error': item['error'][0]})
                else:
                    self._reply(200, {'ok': True})
            else:
                self._reply(504, {'ok': False, 'error': '导入超时'})
        except Exception as e:  # noqa: BLE001
            self._reply(400, {'ok': False, 'error': str(e)})


def _start_server():
    try:
        HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
    except OSError as e:
        print(f'[AssetManagement] 端口 {PORT} 启动失败: {e}')


def menu_draw(self, context):
    self.layout.label(text=f'AssetManagement 桥接: 127.0.0.1:{PORT}')


def register():
    threading.Thread(target=_start_server, daemon=True).start()
    bpy.app.timers.register(_timer)
    bpy.types.TOPBAR_MT_editor_menus.append(menu_draw)


def unregister():
    bpy.app.timers.unregister(_timer)
    bpy.types.TOPBAR_MT_editor_menus.remove(menu_draw)


if __name__ == '__main__':
    register()
