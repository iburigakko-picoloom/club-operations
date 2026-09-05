from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
h={"__file__":str(ROOT/'tests/browser_checks.py')};s=(ROOT/'tests/browser_checks.py').read_text();exec(s[:s.index('with sync_playwright()')],h)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True);p=context.new_page();p.set_content(h['html']());p.wait_for_function('ctx.ready');p.evaluate('location.hash="car/plan1"');p.wait_for_timeout(60)
 src=p.locator('[data-person="m9"] .grip');dst=p.locator('[data-drop="passenger"][data-car-id="c2"]');a=src.bounding_box();z=dst.bounding_box();x,y=a['x']+a['width']/2,a['y']+a['height']/2;ex,ey=z['x']+z['width']/2,z['y']+z['height']/2
 c=context.new_cdp_session(p);c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for i in range(1,18):c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+(ex-x)*i/17,'y':y+(ey-y)*i/17}]});p.wait_for_timeout(10)
 c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});p.wait_for_timeout(80)
 ok=p.evaluate('plan("plan1").legs.outbound.find(c=>c.id==="c2").riders.includes("m9")');print('EMULATED_TOUCH_DRAG',ok);(ROOT/'qa/touch-result.json').write_text(json.dumps({'emulatedTouchDrag':ok,'physicalDeviceTested':False}));b.close()
 if not ok:raise AssertionError('Touch drag did not move rider')
