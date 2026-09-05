"""Validate the deliverable single HTML using direct injection under browser policy."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
shim='''<script>for(const n of ['localStorage','sessionStorage']){const data={};Object.defineProperty(window,n,{value:{getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]}});}</script>'''
text=(ROOT/'club-demo.html').read_text(encoding='utf-8').replace('<body>','<body>'+shim,1)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(text);page.wait_for_function('ctx.ready')
 ok=page.locator('[data-act="wf-demo"]').count()==1
 page.locator('[data-act="wf-demo"]').click();page.wait_for_timeout(80);page.locator('[data-act="wf-open-group"]').first.click();page.wait_for_timeout(80)
 ok=ok and page.locator('nav a').count()==5
 page.evaluate('location.hash="practice"');page.wait_for_timeout(80)
 ok=ok and page.locator('iframe').count()==0 and 'メニュー表作成' in page.locator('#app').inner_text()
 result={'name':'standalone HTML boots and opens native practice','pass':bool(ok and not errors),'errors':errors,'limits':'Direct injection; test-only Storage adapter, not native file navigation'}
 (ROOT/'qa/bundle-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(page.locator('#app').inner_text());print(result);b.close()
 if not result['pass']:raise SystemExit(1)
