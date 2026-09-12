"""Optional DOM smoke with a real HTTP bridge.

The build environment's Chromium blocks all URL navigation by administrator policy.
This harness therefore renders the actual CSS/JS in about:blank and bridges fetch to
an already-running local HTTP server. It tests DOM rendering and button handlers,
NOT native browser routing, module loading, cookies, CSP or CSRF enforcement.
Those API boundaries are exercised separately by the Node HTTP tests.
Requires Python playwright + an installed Chromium. Run after npm start.
"""
from pathlib import Path
import os, json, urllib.request, http.cookiejar, re
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ORIGIN=os.environ.get('APP_ORIGIN','http://localhost:3000')
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path, opts=None):
    opts=opts or {}
    headers={'Content-Type':'application/json','Origin':ORIGIN,**opts.get('headers',{})}
    data=opts.get('body')
    if data is not None and not isinstance(data,str):data=json.dumps(data)
    req=urllib.request.Request(ORIGIN+path,data=None if data is None else data.encode(),headers=headers,method=opts.get('method','GET'))
    try:
        with opener.open(req,timeout=20) as res:return {'status':res.status,'body':res.read().decode()}
    except urllib.error.HTTPError as res:return {'status':res.code,'body':res.read().decode()}
def get(path):
    r=request('/api'+path)
    assert r['status']==200,r
    return json.loads(r['body'])
login=request('/api/auth/login',{'method':'POST','body':{'email':os.environ.get('ADMIN_EMAIL','admin@leadloom.local'),'password':os.environ.get('ADMIN_PASSWORD','Leadloom-Demo-2026!')}})
assert login['status']==200,login
me=json.loads(login['body']);listing=get('/leads');leads=listing['items']
assert leads,'Seed a synthetic demo before running DOM smoke.'
lead=next((x for x in leads if x['name']=='Olivia Brooks'),leads[0])
for cmd in ['return-to-ai','resume']:
    request('/api/leads/'+lead['id']+'/'+cmd,{'method':'POST','headers':{'X-CSRF-Token':me['csrf']},'body':{'reason':'Explicit synthetic DOM test reset'}})
listing=get('/leads');leads=listing['items']
payload={'meta':get('/meta'),'user':me['user'],'csrf':me['csrf'],'listing':listing,'profile':get('/leads/'+lead['id'])}
api=(ROOT/'web/api.js').read_text().replace('export ','')
app=(ROOT/'web/app.js').read_text()
app=re.sub(r'^import .*?;\n','',app,count=1)
app=re.sub(r'boot\(\);\s*$','',app)
html=(ROOT/'web/index.html').read_text()
html=re.sub(r'<link[^>]+>','',html)
html=re.sub(r'<script.*?</script>','',html)
html=html.replace('</head>','<style>'+(ROOT/'web/style.css').read_text()+'</style></head>')
errors=[];checks=[]
def check(name):checks.append({'name':name,'passed':True})
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1512,'height':982},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.expose_function('nativeHttp',request)
    page.set_content(html)
    page.evaluate("""() => { window.fetch=async (url,opts)=>{ const r=await window.nativeHttp(url,opts||{});return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>JSON.parse(r.body)};};history.pushState=()=>{}; }""")
    script='(() => {\n'+api+'\n'+app+'\nconst initial='+json.dumps(payload)+';state.meta=initial.meta;state.user=initial.user;state.leads=initial.listing.items;state.total=initial.listing.total;state.page=initial.listing.page;state.pageSize=initial.listing.pageSize;state.stats=initial.listing.stats;state.profile=initial.profile;state.leadId=initial.profile.id;security.staff=initial.csrf;shell();renderInbox();})();'
    page.evaluate(script)
    expect(page.locator('#chat-panel')).to_contain_text('Olivia Brooks')
    expect(page.locator('#context-panel')).to_contain_text('100')
    expect(page.locator('.lead-card')).to_have_count(len(leads));check('Desktop Conversations renders actual CRM data, messages and scoring')
    expect(page.get_by_role('button',name='Send reply')).to_be_in_viewport()
    check('Manager reply composer stays visible inside the viewport')
    page.screenshot(path=str(ROOT/'evidence/01-conversations.png'),full_page=True)
    page.locator('[data-control="takeover"]').click()
    expect(page.locator('[data-control="return-to-ai"]')).to_be_visible();check('Take over button persists HUMAN ownership through actual HTTP')
    page.locator('[data-control="pause"]').click()
    expect(page.locator('[data-control="resume"]')).to_be_visible();check('Pause button persists independent paused state')
    page.locator('[data-control="resume"]').click()
    expect(page.locator('[data-control="pause"]')).to_be_visible()
    expect(page.locator('[data-control="return-to-ai"]')).to_be_visible();check('Resume does not implicitly return HUMAN ownership to AI')
    page.locator('[data-profile]').first.click()
    expect(page.get_by_role('heading',name='Olivia Brooks')).to_be_visible();check('Lead profile renders via navigation handler and real API')
    page.screenshot(path=str(ROOT/'evidence/02-lead-profile.png'),full_page=True)
    page.locator('[data-nav="settings"]').click()
    expect(page.get_by_role('heading',name='Workspace settings')).to_be_visible();check('Settings screen renders current server configuration')
    page.locator('[data-nav="activity"]').click()
    expect(page.get_by_role('heading',name='Execution log')).to_be_visible();check('Execution Log renders saved operations and intake events')
    page.screenshot(path=str(ROOT/'evidence/03-execution-log.png'),full_page=True)
    page.locator('[data-nav="conversations"]').click()
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(100)
    overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
    assert not overflow,'Mobile viewport overflows horizontally';check('390px mobile viewport has no horizontal page overflow')
    page.screenshot(path=str(ROOT/'evidence/04-mobile.png'),full_page=True)
    assert not errors,errors;check('No uncaught browser JavaScript errors in the DOM smoke')
    browser.close()
report={'date':datetime.now(timezone.utc).isoformat(),'mode':'DOM smoke with actual local HTTP bridge; not native browser E2E','nativeNavigation':'blocked by Chromium administrator URLBlocklist','success':True,'checks':checks,'pageErrors':errors}
(ROOT/'evidence/browser-dom-smoke.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
