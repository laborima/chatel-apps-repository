"""Stage 1: generate the generic MPFB human (body, rig, face shape keys, eyes, teeth, clothes).
Run: blender -b --python build_base.py -- out.blend
"""
import bpy, sys, os
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

info = HumanService._create_default_human_info_dict()
info["name"] = "Avatar"
info["phenotype"].update(gender=1.0, age=0.62, muscle=0.5, weight=0.42, proportions=0.6, height=0.55)
info["phenotype"]["race"] = {"caucasian": 1.0, "asian": 0.0, "african": 0.0}
info["rig"] = "custom.talkinghead"
info["eyes"] = "high-poly/high-poly.mhclo"
info["eyebrows"] = "eyebrow012/eyebrow012.mhclo"
info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
info["teeth"] = "teeth_base/teeth_base.mhclo"
info["tongue"] = "tongue01/tongue01.mhclo"
info["hair"] = "short02/short02.mhclo"
info["clothes"] = ["male_casualsuit01/male_casualsuit01.mhclo", "shoes04/shoes04.mhclo"]
info["skin_mhmat"] = "skins/middleage_caucasian_male/middleage_caucasian_male.mhmat"
info["skin_material_type"] = "ENHANCED_SSS"
import json as _json, os as _os
_bt = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "body_targets.json")
info["targets"] = [{"target": k, "value": v} for k, v in (_json.load(open(_bt)).items() if _os.path.exists(_bt) else [])]
print("BODY TARGETS", info["targets"])

settings = HumanService.get_default_deserialization_settings()
settings["subdiv_levels"] = 0
basemesh = HumanService.deserialize_from_dict(info, settings)
print("BASEMESH", basemesh.name, len(basemesh.data.vertices))
for o in bpy.data.objects:
    print("OBJ", o.name, o.type, len(o.data.vertices) if o.type == "MESH" else "")
bpy.ops.wm.save_as_mainfile(filepath=out)
