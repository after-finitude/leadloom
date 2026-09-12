"""Optional native-browser E2E. Requires an already-running local demo server.
Install locally: python -m pip install playwright; python -m playwright install chromium
Run: python tests/browser_e2e.py
This native-navigation test was not executed in the delivery environment because
administrator policy blocks Chromium URLs. DOM bridge checks are separate files.
"""
import os,uuid,json
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];base=os.getenv('APP_ORIGIN','http://localhost:3000')
errors=[]
with sync_playwright() as p:
    options={'headless':True}
    if os.getenv('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    customer=browser.new_context(viewport={'width':1280,'height':960});page=customer.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    name='Native E2E '+uuid.uuid4().hex[:8]
    page.goto(base+'/enquire')
    page.get_by_label('Your name').fill(name)
    page.get_by_label('Email address').fill(uuid.uuid4().hex+'@example.test')
    page.get_by_label('What are you planning?').select_option('roofing')
    page.get_by_role('button',name='Start my conversation').click()
    expect(page).to_have_url(base+'/chat')
    page.get_by_role('textbox',name='Your message').fill('Roofing in Demo City A. Budget $25000. I own this home and want to start in 2 months.')
    page.get_by_role('button',name='Send message').click()
    expect(page.get_by_role('button',name='Choose a consultation time')).to_be_visible(timeout=20000)
    page.get_by_role('button',name='Choose a consultation time').click()
    for code in ['stale_offer','slot_taken']:
        def reject_slot(route):
            route.fulfill(status=409,content_type='application/json',body=json.dumps({'error':code,'message':'Refresh the available times.'}))
        page.route('**/api/public/chat/appointments',reject_slot,times=1)
        page.locator('[data-book-slot]').first.click()
        expect(page.locator('[data-book-slot]')).to_have_count(0)
        expect(page.get_by_role('button',name='Choose a consultation time')).to_be_visible()
        page.get_by_role('button',name='Choose a consultation time').click()
    expect(page.locator('[data-book-slot]').first).to_be_visible()
    previous_offer=page.locator('[data-book-slot]').first.get_attribute('data-book-slot')
    page.get_by_role('button',name='Refresh available times').click()
    expect(page.locator('[data-book-slot]').first).not_to_have_attribute('data-book-slot',previous_offer)
    page.locator('[data-book-slot]').first.click()
    expect(page.get_by_text('Your consultation is confirmed',exact=True)).to_be_visible(timeout=20000)
    page.reload();expect(page.get_by_text('Your consultation is confirmed',exact=True)).to_be_visible()
    staff=browser.new_context();manager=staff.new_page();manager.on('pageerror',lambda e:errors.append(str(e)))
    manager.goto(base+'/login');manager.get_by_label('Email address').fill(os.getenv('ADMIN_EMAIL','admin@leadloom.local'))
    manager.get_by_label('Password').fill(os.getenv('ADMIN_PASSWORD','Leadloom-Demo-2026!'))
    manager.get_by_role('button',name='Sign in to workspace').click()
    manager.get_by_role('textbox',name='Search conversations').fill(name)
    expect(manager.locator('.lead-card')).to_have_count(1)
    manager.get_by_role('button').filter(has_text=name).first.click()
    expect(manager.locator('#chat-panel')).to_contain_text('Booked')
    page.get_by_role('textbox',name='Your message').fill('STOP');page.get_by_role('button',name='Send message').click()
    expect(page.get_by_text('Automation is stopped. New messages will not restore consent.',exact=True)).to_be_visible()
    assert not errors,errors;browser.close()
result={'date':datetime.now(timezone.utc).isoformat(),'mode':'native browser, all providers mock','success':True,'errors':errors}
(ROOT/'evidence/native-browser-e2e.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
