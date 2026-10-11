import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]; out = a[0]; sss = float(a[1]); sat = float(a[2]); val = float(a[3])
m = bpy.data.materials["Skin"]; nt = m.node_tree
p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); t = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
p.inputs["Subsurface Weight"].default_value = sss
hs = nt.nodes.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = sat; hs.inputs["Value"].default_value = val
nt.links.new(t.outputs["Color"], hs.inputs["Color"]); nt.links.new(hs.outputs["Color"], p.inputs["Base Color"])
bpy.ops.wm.save_as_mainfile(filepath=out)
