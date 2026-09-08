"""Build a single-file, explicitly local demo. No server auth or Push is implied."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def build(destination=None):
 css=(ROOT/'web/styles.css').read_text(encoding='utf-8')
 head='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#14813b"><title>部活運営・操作デモ</title><style>'+css+'</style></head><body><div class="app" id="app"></div><div id="modal-root"></div><div id="toast-root" aria-live="polite"></div>'
 for name in ['transport.js','domain.js','base.js','app.js','workflow.js','calendar.js','experience.js','operations.js','court-domain.js','courts.js']:
  text=(ROOT/'web'/name).read_text(encoding='utf-8')
  if name in ['app.js','workflow.js','calendar.js','experience.js','operations.js','court-domain.js','courts.js']:text=text.replace("location.protocol==='file:'||url.searchParams.has('demo')",'true')
  head+='<script>'+text+'</script>'
 path=destination or ROOT/'club-demo.html';path.write_text(head+'</body></html>',encoding='utf-8');return path
if __name__=='__main__':print(build())
