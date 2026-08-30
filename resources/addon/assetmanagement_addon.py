# AssetManagement Bridge —— Blender 插件（设计文档 §8 + 自动上材质）
# 职责：
#   1. 接收 AssetManagement 桌面应用的一键导入指令（Link 引用 / Append 复制进当前场景）
#   2. 自动上材质：模型无贴图时，按 PBR 命名惯例自动拼接 Principled BSDF 材质
#      - A 通道：应用在 /import 载荷里附带系列贴图清单（精确）
#      - B 通道：监听场景，任何新导入的无材质网格 → 按名字根从素材根目录搜贴图
# 安装：Blender → 编辑 → 偏好设置 → 插件 → 安装 → 选本文件 → 勾选启用
# 原理：插件内起本地 HTTP 服务（127.0.0.1:8491）；bpy 数据只能主线程读写，
#       所以 HTTP 线程只收单，主线程用 bpy.app.timers 定时取单执行（经典模式）
bl_info = {
    "name": "AssetManagement Bridge",
    "author": "xdfqgg",
    "version": (1, 1, 0),
    "blender": (5, 0, 0),
    "location": "顶部菜单栏",
    "description": "接收 AssetManagement 的一键导入指令（Link / Append），并为无贴图模型自动拼接 PBR 材质",
    "category": "Import-Export",
}

import bpy
import json
import os
import pathlib
import re
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8491
# HTTP 线程 → 主线程的指令队列
_pending = []  # {"path": str, "mode": str, "textures": list, "event": threading.Event, "error": [str]}

# 认证 token（审查 A9）：桌面应用首启生成并写入 %APPDATA%\assetmanagement\blender_token.txt
TOKEN_FILE = os.path.join(os.environ.get('APPDATA', ''), 'assetmanagement', 'blender_token.txt')
# 素材根目录清单（自动上材质 B 通道）：应用在根目录变化时写入
ROOTS_FILE = os.path.join(os.environ.get('APPDATA', ''), 'assetmanagement', 'roots.txt')
_token = None

IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.webp', '.bmp'}
ROLE_SUFFIXES = {
    'albedo': ('albedo', 'basecolor', 'diffuse', 'color'),
    'normal': ('normal', 'nrm', 'bump'),
    'roughness': ('roughness', 'rough'),
    'metallic': ('metallic', 'metalness', 'metal'),
    'ao': ('ao', 'ambientocclusion', 'occlusion'),
}


def load_token():
    global _token
    try:
        _token = pathlib.Path(TOKEN_FILE).read_text(encoding='utf-8').strip()
    except OSError:
        _token = None


def _load_roots():
    try:
        data = pathlib.Path(ROOTS_FILE).read_text(encoding='utf-8')
        return json.loads(data) if data.strip() else []
    except (OSError, json.JSONDecodeError):
        return []


def _normalize_base(base):
    """去分辨率后缀：Ground103_Albedo_2K → ground103_albedo；Ground103_Normal_2048 → ground103_normal"""
    bl = base.lower()
    bl = re.sub(r'(_|-)\d{3,4}$', '', bl)
    bl = re.sub(r'(_|-)\d+k$', '', bl)
    return bl


def _root_candidates(name_root):
    """名字根候选链（由长到短）：Ground103_2K-JPG → Ground103_2K → Ground103——
    兼容素材包「模型名带分辨率、贴图名不带」等命名变体"""
    cands = [name_root]
    for m in re.finditer(r'[_\-.]', name_root):
        cands.append(name_root[: m.start()])
    seen = set()
    out = []
    for c in cands:
        key = c.lower()
        if c and key not in seen:
            seen.add(key)
            out.append(c)
    return out


def _find_texture_set(name_root):
    """按名字根在素材根目录里搜 PBR 贴图集，返回 {role: filepath}"""
    result = {}
    roots = _load_roots()
    if not roots:
        return result
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith('.')]
            for fn in filenames:
                base, ext = os.path.splitext(fn)
                if ext.lower() not in IMAGE_EXTS:
                    continue
                bl = _normalize_base(base)
                for cand in _root_candidates(name_root):
                    cl = cand.lower()
                    for role, suffixes in ROLE_SUFFIXES.items():
                        if role in result:
                            continue
                        for s in suffixes:
                            if bl == cl + '_' + s or bl == cl + '-' + s:
                                result[role] = os.path.join(dirpath, fn)
                                break
        if len(result) >= 4:
            break
    return result


def build_pbr_material(name, textures):
    """textures: {role: filepath}——Principled BSDF 接线（PBR 行业标准接法）：
    颜色贴图 → Base Color；法线贴图 → Normal Map 节点（色彩空间 Non-Color）→ Normal；
    粗糙度/金属度 → Roughness/Metallic（Non-Color）；AO 与颜色相乘"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if not bsdf:
        return mat

    def add_tex(filepath, label, color_space='sRGB', location=(0, 0)):
        img = bpy.data.images.load(filepath)
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = img
        node.label = label
        node.location = location
        if color_space == 'Non-Color':
            img.colorspace_settings.name = 'Non-Color'
        return node

    albedo_node = None
    if 'albedo' in textures:
        albedo_node = add_tex(textures['albedo'], 'Albedo', location=(-600, 200))
        nt.links.new(albedo_node.outputs['Color'], bsdf.inputs['Base Color'])
    if 'normal' in textures:
        nrm = add_tex(textures['normal'], 'Normal', color_space='Non-Color', location=(-600, 0))
        nmap = nt.nodes.new('ShaderNodeNormalMap')
        nmap.location = (-300, 0)
        nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    if 'roughness' in textures:
        rough = add_tex(textures['roughness'], 'Roughness', color_space='Non-Color', location=(-600, -200))
        nt.links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    if 'metallic' in textures:
        metal = add_tex(textures['metallic'], 'Metallic', color_space='Non-Color', location=(-600, -400))
        nt.links.new(metal.outputs['Color'], bsdf.inputs['Metallic'])
    if 'ao' in textures and albedo_node:
        ao = add_tex(textures['ao'], 'AO', color_space='Non-Color', location=(-600, -600))
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.location = (-300, 200)
        nt.links.new(albedo_node.outputs['Color'], mix.inputs['Color1'])
        nt.links.new(ao.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def apply_material_to_meshless(meshes, material):
    """只给「完全没有材质」的网格挂材质——有材质的模型不动（尊重原数据）"""
    for obj in meshes:
        if obj.material_slots and any(s.material for s in obj.material_slots):
            continue
        mesh = obj.data
        if mesh.materials:
            mesh.materials[0] = material
        else:
            mesh.materials.append(material)


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


def import_asset(path, mode, textures=None):
    textures = textures or []
    ext = os.path.splitext(path)[1].lower()
    scene = bpy.context.scene
    before = set(scene.objects)
    if ext == '.blend':
        # Link = 引用（数据留在原文件，工程小但依赖原文件）；Append = 复制进当前工程
        link = mode == 'link'
        with bpy.data.libraries.load(path, link=link) as (src, dst):
            dst.collections = list(src.collections)
            dst.objects = list(src.objects)
        instantiate_top_collections(dst.collections, scene)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        bpy.ops.import_scene.obj(filepath=path)
    elif ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f'不支持的格式: {ext}')

    # 自动上材质 A 通道：应用随指令附带的系列贴图（只处理本次导入的、无材质的网格）
    tex_by_role = {
        t['role']: t['path']
        for t in textures
        if t.get('role') in ROLE_SUFFIXES and os.path.isfile(t.get('path', ''))
    }
    if tex_by_role:
        new_meshes = [o for o in scene.objects if o not in before and o.type == 'MESH']
        if new_meshes:
            mat = build_pbr_material(os.path.splitext(os.path.basename(path))[0] + '_Material', tex_by_role)
            apply_material_to_meshless(new_meshes, mat)


# ---- 自动上材质 B 通道：监听场景，新导入的无材质网格自动搜贴图 ----

_known_objects = None


def on_depsgraph_update_post(scene, depsgraph):
    global _known_objects
    current = {o.name for o in scene.objects}
    if _known_objects is None:
        _known_objects = current
        return
    new_names = current - _known_objects
    _known_objects = current
    if not new_names:
        return
    meshless = []
    for n in new_names:
        obj = scene.objects.get(n)
        if not obj or obj.type != 'MESH':
            continue
        if obj.material_slots and any(s.material for s in obj.material_slots):
            continue
        meshless.append(obj)
    if not meshless:
        return
    roots = _load_roots()
    for obj in meshless:
        root = re.sub(r'\.\d{3}$', '', obj.name)  # 去 Blender 的 .001 等后缀
        tex = _find_texture_set(root)
        if not tex:
            # 诊断输出：检测到了新无材质物体，但检索范围内没找到贴图——方便排查
            print(f'[AssetManagement] 检测到无材质物体 {obj.name}（名字根 {root}），'
                  f'但在 {len(roots)} 个素材根目录中未找到贴图集')
            continue
        mat = build_pbr_material(root + '_Material', tex)
        apply_material_to_meshless([obj], mat)
        print(f'[AssetManagement] 自动上材质: {obj.name} ← {len(tex)} 张贴图')


# ---- 手动算子（用户需求核心）：选中模型 → Alt+Shift+T → 自动检索贴图并上材质 ----
# 等价于 Node Wrangler「选图自动组材质」的自动化版：省掉手动选图步骤

class AM_OT_smart_material(bpy.types.Operator):
    bl_idname = 'am.smart_material'
    bl_label = '智能上材质（自动检索贴图）'
    bl_description = '按物体名字根从素材根目录自动检索 PBR 贴图集，生成 Principled BSDF 材质并挂给无材质的选中物体'
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.mode == 'OBJECT' and bool(context.selected_objects)

    def execute(self, context):
        meshes = [o for o in context.selected_objects if o.type == 'MESH']
        if not meshes:
            self.report({'WARNING'}, '请先选中网格物体（物体模式）')
            return {'CANCELLED'}
        roots = _load_roots()
        if not roots:
            self.report({'WARNING'}, '素材根目录清单为空——请先在 AssetManagement 应用中添加素材根目录')
            return {'CANCELLED'}
        applied = 0
        skipped = []
        for obj in meshes:
            root = re.sub(r'\.\d{3}$', '', obj.name)
            tex = _find_texture_set(root)
            if not tex:
                skipped.append(root)
                continue
            mat = build_pbr_material(root + '_Material', tex)
            apply_material_to_meshless([obj], mat)
            applied += 1
            print(f'[AssetManagement] 智能上材质: {obj.name} ← {len(tex)} 张贴图')
        if applied:
            self.report({'INFO'}, f'已为 {applied} 个物体自动上材质')
        if skipped:
            self.report({'WARNING'}, f'未找到贴图集: {", ".join(skipped)}')
        return {'FINISHED'}


# ---- HTTP 服务与定时器 ----

def _timer():
    """主线程定时器：从队列取单执行（bpy 只能在主线程操作）"""
    while _pending:
        item = _pending.pop(0)
        try:
            import_asset(item['path'], item['mode'], item.get('textures'))
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
        # 认证（审查 A9）：任何本机进程都能访问本服务，必须校验共享 token
        provided = self.headers.get('X-AssetManagement-Token', '')
        if not _token or provided != _token:
            self._reply(401, {'ok': False, 'error': '未授权：请先启动 AssetManagement 桌面应用生成令牌'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length) or b'{}')
            path = str(data.get('path', ''))
            mode = str(data.get('mode', 'append'))
            textures = data.get('textures') or []
            if not path or mode not in ('link', 'append'):
                raise ValueError('参数错误：需要 path 与 mode(link|append)')
            item = {'path': path, 'mode': mode, 'textures': textures, 'event': threading.Event(), 'error': []}
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


_addon_keymaps = []


def register():
    load_token()
    threading.Thread(target=_start_server, daemon=True).start()
    bpy.app.timers.register(_timer)
    bpy.app.handlers.depsgraph_update_post.append(on_depsgraph_update_post)
    bpy.utils.register_class(AM_OT_smart_material)
    bpy.types.TOPBAR_MT_editor_menus.append(menu_draw)
    # 物体菜单入口
    def object_menu_draw(self, context):
        self.layout.separator()
        self.layout.operator(AM_OT_smart_material.bl_idname)
    bpy.types.VIEW3D_MT_object.append(object_menu_draw)
    # 快捷键 Alt+Shift+T（与 Node Wrangler 同名快捷键冲突时以先注册者生效）
    wm = bpy.context.window_manager
    if wm.keyconfigs.addon:
        km = wm.keyconfigs.addon.keymaps.new(name='Object Mode', space_type='EMPTY')
        kmi = km.keymap_items.new(AM_OT_smart_material.bl_idname, 'T', 'PRESS', alt=True, shift=True)
        _addon_keymaps.append((km, kmi))


def unregister():
    bpy.app.timers.unregister(_timer)
    if on_depsgraph_update_post in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(on_depsgraph_update_post)
    for km, kmi in _addon_keymaps:
        km.keymap_items.remove(kmi)
    _addon_keymaps.clear()
    bpy.utils.unregister_class(AM_OT_smart_material)
    bpy.types.TOPBAR_MT_editor_menus.remove(menu_draw)


if __name__ == '__main__':
    register()
