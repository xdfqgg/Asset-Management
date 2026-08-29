# AssetManagement 缩略图渲染脚本（随应用分发）
# 用法: blender -b -P render_asset.py -- <输入文件> <输出png> [输出json]
#   - 支持 .fbx/.obj/.gltf/.glb 导入渲染，也支持 .blend 打开渲染（.blend 无内置预览时的回退方案）
#   - 一次调用拿两份数据：缩略图 PNG + 面数/顶点数 JSON（设计文档 §6「合并提取」）
import bpy
import json
import mathutils
import os
import sys


def frame_all_objects(camera):
    """计算场景包围盒并摆放相机，让模型完整居中"""
    bpy.context.view_layer.update()
    verts = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        for v in obj.data.vertices:
            verts.append(camera.matrix_world.inverted() @ obj.matrix_world @ v.co)
    if not verts:
        return
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    zs = [v.z for v in verts]
    center = mathutils.Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) or 1.0
    camera.location = center + mathutils.Vector((1.0, -1.0, 0.6)).normalized() * size * 3
    direction = center - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if len(argv) < 2:
        raise RuntimeError('用法: render_asset.py -- <输入文件> <输出png> [输出json]')
    # 转绝对路径：Blender 启动后可能改变工作目录（实测 CWD 漂移），相对路径不可靠
    src = os.path.abspath(argv[0])
    out_png = os.path.abspath(argv[1])
    out_json = os.path.abspath(argv[2]) if len(argv) > 2 else None

    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(src)[1].lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext == '.obj':
        bpy.ops.import_scene.obj(filepath=src)
    elif ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=src)
    else:
        raise RuntimeError(f'unsupported ext: {ext}')

    # 合并提取：顺手统计面数/顶点数
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    faces = sum(len(m.data.polygons) for m in meshes)
    verts = sum(len(m.data.vertices) for m in meshes)
    if out_json:
        with open(out_json, 'w', encoding='utf-8') as f:
            json.dump({'faces': faces, 'vertices': verts}, f)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    cam_data = bpy.data.cameras.new('AM_Cam')
    cam_obj = bpy.data.objects.new('AM_Cam', cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    frame_all_objects(cam_obj)

    world = bpy.data.worlds.new('AM_World')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[1].default_value = 0.6
    scene.world = world

    scene.render.filepath = out_png
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
