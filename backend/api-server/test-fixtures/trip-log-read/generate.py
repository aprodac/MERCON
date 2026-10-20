"""Renders the mock customer-app screenshots (390x844) and expected.json. Run: python3 -I generate.py"""
import json, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent

def page(app, dark, stops, cut=False, title="Trip details"):
    bg, card, fg, mut = ("#12151c", "#1d222c", "#f2f4f8", "#8d95a6") if dark else ("#f3f5f9", "#ffffff", "#1a2233", "#6b7385")
    accent = {"iMile": "#e4002b", "JD Logistics": "#d6001c"}[app]
    rows = ""
    for s in stops:
        t = ""
        if s.get("arrive"): t += f'<div class="r"><span>Arrive time</span><b>{s["arrive"]}</b></div>'
        if s.get("depart"): t += f'<div class="r"><span>Depart time</span><b>{s["depart"]}</b></div>'
        if s.get("pending"): t += f'<div class="r"><span>Status</span><b>{s["pending"]}</b></div>'
        rows += f'<div class="card"><div class="n">{s["name"]}</div><div class="sub">{s.get("sub","")}</div>{t}</div>'
    return f"""<html><body style="margin:0;width:390px;height:844px;overflow:hidden;background:{bg};color:{fg};font-family:Inter,DejaVu Sans,sans-serif">
<style>.card{{background:{card};margin:12px 16px;padding:16px;border-radius:14px}}.n{{font-size:18px;font-weight:700}}.sub{{font-size:13px;color:{mut};margin:4px 0 10px}}
.r{{display:flex;justify-content:space-between;padding:7px 0;font-size:15px;border-top:1px solid {mut}33}}.r span{{color:{mut}}}</style>
<div style="display:flex;justify-content:space-between;padding:12px 22px 4px;font-size:13px;font-weight:600"><span>9:41</span><span>5G ▮▮▮</span></div>
<div style="background:{accent};color:#fff;padding:14px 16px;font-size:19px;font-weight:700">{app} &nbsp;·&nbsp; {title}</div>
<div style="padding:12px 16px 0;font-size:13px;color:{mut}">Linehaul · Vehicle TEST-0001</div>{rows}</body></html>"""

SHOTS = [
 ("01-imile-riyadh.png", page("iMile", False, [{"name":"Riyadh DC","sub":"Origin · Loading","arrive":"06:10:42","depart":"06:55:03"}]),
  {"app":"iMile","name":"Riyadh DC","arrive":"06:10:42","depart":"06:55:03","stop":"Riyadh","type":"Pickup","suggest":True,"send":"07:00","gps":[24.7136,46.6753]}),
 ("02-imile-taif.png", page("iMile", False, [{"name":"Taif Station","sub":"Transit hub","arrive":"12:04:51","depart":"12:40:10"}]),
  {"app":"iMile","name":"Taif Station","arrive":"12:04:51","depart":"12:40:10","stop":"Taif","type":"Dropoff","suggest":True,"send":"12:45","gps":[21.2703,40.4158]}),
 ("03-jdl-jeddah.png", page("JD Logistics", False, [{"name":"Jeddah Hub","sub":"Final delivery","arrive":"18:22","pending":"Unloading"}], title="Delivery"),
  {"app":"JD","name":"Jeddah Hub","arrive":"18:22:00","depart":None,"stop":"Jeddah","type":"Dropoff","suggest":True,"send":"18:30","gps":[21.5433,39.1728]}),
 ("04-imile-dark-cut.png", page("iMile", True, [{"name":"Riyadh DC","sub":"Origin · Loading","arrive":"06:10:42"},{"name":"Taif Station","sub":"Transit hub","arrive":"12:04:51"}]),
  {"app":"iMile","name":"Riyadh DC","arrive":"06:10:42","depart":None,"stop":"Riyadh","type":"Pickup","suggest":True,"send":"12:50","gps":[24.7136,46.6753],"note":"dark mode; screen cut off before depart time; resend of the Riyadh stop"}),
 ("05-imile-no-times.png", page("iMile", False, [{"name":"Taif Station","sub":"Transit hub","pending":"Not arrived yet"}]),
  {"app":"iMile","name":"Taif Station","arrive":None,"depart":None,"stop":None,"type":None,"suggest":False,"send":"12:55","gps":[21.2703,40.4158]}),
]
# Heights: the cut one is cropped at 420px to mimic a partial screenshot.
exp = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH') or None); pg = b.new_page(viewport={"width":390,"height":844})
    for fn, html, e in SHOTS:
        pg.set_content(html); clip = {"x":0,"y":0,"width":390,"height":844 if "cut" not in fn else 560}
        pg.screenshot(path=str(OUT/fn), clip=clip); exp[fn] = e
    b.close()
(OUT/"expected.json").write_text(json.dumps(exp, indent=2))
