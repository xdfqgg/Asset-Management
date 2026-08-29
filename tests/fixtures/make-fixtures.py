# 生成 .blend 预览提取的测试样本（一次性工具，可重复运行）
# 用法: blender -b -P tests/fixtures/make-fixtures.py
import bpy
import os

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(out_dir, exist_ok=True)

# 1) 未压缩版：默认立方体场景
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'cube.blend'))
print('[fixtures] saved cube.blend')

# 2) GZip 压缩版：Blender 偏好里的「文件压缩」选项
bpy.context.preferences.filepaths.use_file_compression = True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'cube-gzip.blend'))
print('[fixtures] saved cube-gzip.blend')
