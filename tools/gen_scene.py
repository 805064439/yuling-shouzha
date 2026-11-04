#!/usr/bin/env python3
# 生成 assets/scenes/Main.scene：基于 Cocos 默认 2D 场景模板，
# 将 Canvas 设计尺寸改为 750x1334（竖屏）。
# 注意：不再在场景里挂载 Game 组件——Cocos 构建期会对场景引用的 ccclass 组件做类收集，
# 而当前环境下该阶段 ccclass 尚未就绪，会导致组件被剥离/白屏。
# 游戏入口改为运行时引导（见 assets/scripts/Game.ts 的 run()）。
import json, uuid, os

TPL = r"D:/Download/Creator/3.8.8/resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene"
OUT_DIR = r"C:/Users/admin/WorkBuddy/2026-10-28-23-23-35/idle-game-cocos/assets/scenes"
os.makedirs(OUT_DIR, exist_ok=True)
OUT_SCENE = os.path.join(OUT_DIR, "Main.scene")
OUT_META = OUT_SCENE + ".meta"
SCENE_JSON = r"C:/Users/admin/WorkBuddy/2026-10-28-23-23-35/idle-game-cocos/settings/v2/packages/scene.json"

scene_uuid = str(uuid.uuid4())

with open(TPL, encoding='utf-8') as f:
    arr = json.load(f)

# arr[2] 是 Canvas 节点; arr[5] 是 Canvas 上的 UITransform
canvas_node = arr[2]
canvas_node['_lpos'] = {'__type__': 'cc.Vec3', 'x': 375, 'y': 667, 'z': 0}
uit = arr[5]
uit['_contentSize'] = {'__type__': 'cc.Size', 'width': 750, 'height': 1334}

# 场景名
arr[0]['_name'] = 'Main'
arr[1]['_name'] = 'Main'

with open(OUT_SCENE, 'w', encoding='utf-8') as f:
    json.dump(arr, f, ensure_ascii=False, indent=2)

# 写 .meta
meta = {
    'ver': '1.0.27',
    'importer': 'scene',
    'imported': True,
    'uuid': scene_uuid,
    'files': ['.json'],
    'subMetas': {},
    'userData': {},
}
with open(OUT_META, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

# 更新 scene.json 的 current-scene
sj = {'__version__': '1.0.0', 'current-scene': scene_uuid}
with open(SCENE_JSON, 'w', encoding='utf-8') as f:
    json.dump(sj, f, ensure_ascii=False, indent=2)

print('scene uuid =', scene_uuid)
print('scene bytes =', os.path.getsize(OUT_SCENE))
print('OK')
