"""Public form/chat/booking DOM smoke over real local HTTP, with simulated navigation.
See browser_render.py for the Chromium navigation-policy limitation.
"""
from pathlib import Path
import json, os, uuid, re, urllib.request, urllib.error, http.cookiejar
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];ORIGIN=os.environ.get('APP_ORIGIN','http://localhost:3000')
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def bridge(path,opts=None):
    opts=opts or {};body=opts.get('body');headers={'Content-Type':'application/json','Origin':ORIGIN,**opts.get('headers',{})}
    req=urllib.request.Request(ORIGIN+path,data=body.encode() if body is not None else None,headers=headers,method=opts.get('method','GET'))
    try:
        with opener.open(req,timeout=20) as r:return {'status':r.status,'body':r.read().decode()}
    except urllib.error.HTTPError as r:return {'status':r.code,'body':r.read().decode()}
api=(ROOT/'web/api.js').read_text().replace('export ','');app=re.sub(r'^import .*?;\n','',(ROOT/'web/app.js').read_text(),count=1)
html=(ROOT/'web/index.html').read_text();html=re.sub(r'<link[^>]+>|<script.*?</script>','',html);html=html.replace('</head>','<style>'+(ROOT/'web/style.css').read_text()+'</style></head>')
checks=[];errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':960});page.on('pageerror',lambda e:errors.append(str(e)));page.expose_function('nativeHttp',bridge);page.set_content(html)
    page.evaluate("""() => {window.fetch=async(url,opts)=>{const r=await nativeHttp(url,opts||{});return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>JSON.parse(r.body)}};}""")
    virtual="const location={pathname:'/enquire',hash:'',get href(){return this.pathname},set href(v){this.pathname=v;queueMicrotask(boot)}}; const history={pushState(){},replaceState(){}};"
    # about:blank has no secure-origin randomUUID; use real random bytes from the browser.
    page.evaluate("""() => {if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((x,i)=>([4,6,8,10].includes(i)?'-':'')+x.toString(16).padStart(2,'0')).join('')};}""")
    page.evaluate('(()=>{'+virtual+'\n'+api+'\n'+app+'})();')
    page.get_by_label('Your name').fill('Browser Booking Demo')
    page.get_by_label('Email address').fill('browser-'+uuid.uuid4().hex+'@example.test')
    page.get_by_label('What are you planning?').select_option('roofing')
    page.get_by_role('button',name='Start my conversation').click()
    expect(page.get_by_role('textbox',name='Your message')).to_be_visible(timeout=10000);checks.append('Form handler creates a private visitor session through the real HTTP API')
    page.get_by_role('textbox',name='Your message').fill('Roofing in Demo City A. Budget $25000. I own this home and want to start in 2 months.')
    page.get_by_role('button',name='Send message').click()
    expect(page.get_by_role('button',name='Choose a consultation time')).to_be_visible(timeout=15000);checks.append('Chat message is persisted and qualified by the running worker')
    page.get_by_role('button',name='Choose a consultation time').click()
    expect(page.locator('[data-book-slot]').first).to_be_visible();checks.append('Availability controls render server-issued slot offers')
    page.locator('[data-book-slot]').first.click()
    expect(page.get_by_text('Your consultation is confirmed',exact=True)).to_be_visible(timeout=15000);checks.append('Explicit slot click creates and confirms a mock calendar booking')
    expect(page.get_by_role('button',name='Send message')).to_be_in_viewport()
    page.screenshot(path=str(ROOT/'evidence/05-public-booking.png'),full_page=True)
    page.get_by_role('textbox',name='Your message').fill('STOP');page.get_by_role('button',name='Send message').click()
    expect(page.get_by_text('Automation is stopped. New messages will not restore consent.',exact=True)).to_be_visible(timeout=10000);checks.append('STOP immediately displays the persisted contact-level opt-out')
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1');checks.append('Public chat fits a 390px mobile viewport')
    assert not errors,errors;browser.close()
report={'date':datetime.now(timezone.utc).isoformat(),'mode':'DOM + real local HTTP bridge, navigation simulated; all providers mock','success':True,'checks':checks,'pageErrors':errors}
(ROOT/'evidence/browser-public-smoke.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
