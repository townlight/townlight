# SPDX-License-Identifier: AGPL-3.0-only
"""Isolated real-service portal acceptance. Inputs are local source roots only."""
import argparse, ctypes, hashlib, hmac, io, json, os, secrets, shutil, socket, subprocess, sys, time, uuid, zipfile
from pathlib import Path
import httpx, psycopg2
from cryptography.fernet import Fernet

parser = argparse.ArgumentParser()
parser.add_argument('--task-root', type=Path, help='Optional legacy root for default local input paths')
parser.add_argument('--station-root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
for option in ('modules-root', 'native-runtime-root', 'services-python', 'media-python', 'portal-python', 'postgres-bin', 'media-source', 'ffmpeg', 'ffprobe', 'node', 'playwright', 'chromium'):
    parser.add_argument('--' + option, type=Path)
a = parser.parse_args()
task = a.task_root.resolve() if a.task_root else None
station, root = a.station_root.resolve(), a.output.resolve()
repo = Path(__file__).resolve().parents[1]
runtime = a.native_runtime_root.resolve() if a.native_runtime_root else repo/'desktop/runtime/python-services'
def local(value, legacy, label):
    if value: return value.resolve()
    if task: return (task/legacy).resolve()
    parser.error(f'--{label} is required without --task-root')
source = local(a.modules_root,'work/publication-2026-10-30','modules-root')
backend = source/'sunshine/backend'
python = local(a.services_python,'work/station-boundary/townlight/desktop/runtime/payload/python/python.exe','services-python')
media_python = local(a.media_python,'work/station-proof/runtime/python.exe','media-python')
portal_python = local(a.portal_python,'work/townlight-portal/.venv/Scripts/python.exe','portal-python')
pg = local(a.postgres_bin,'work/station-boundary/postgres/bin','postgres-bin')
media = local(a.media_source,'work/station-integrations-2026-10-30/beta-1/media-source','media-source')
ffmpeg = str(a.ffmpeg.resolve()) if a.ffmpeg else shutil.which('ffmpeg')
ffprobe = str(a.ffprobe.resolve()) if a.ffprobe else shutil.which('ffprobe')
node = str(a.node.resolve()) if a.node else shutil.which('node')
playwright = a.playwright.resolve() if a.playwright else Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
chromium = a.chromium.resolve() if a.chromium else Path.home()/'AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'
paths = [station, runtime, backend, *(source/p for p in ('core','meetings','access','notice'))]
for path in [python,media_python,portal_python,pg/'postgres.exe',media,playwright,chromium,*paths]:
    if not path.exists(): raise RuntimeError(f'Missing input: {path}')
if not all((ffmpeg,ffprobe,node)): raise RuntimeError('ffmpeg, ffprobe and node are required')
root.mkdir(parents=True, exist_ok=False)
children=[]; checks=[]; pg_process=None

def save(name, obj): (root/name).write_text(json.dumps(obj,indent=2,default=str),encoding='utf-8')
def identities():
    files=[Path(__file__),repo/'scripts/portal-e2e-browser.cjs',runtime/'townlight_runtime/services.py',runtime/'townlight_runtime/portal_publication.py',repo/'portal/website/townlight.py',repo/'portal/website/views.py',repo/'portal/website/wagtail_hooks.py',repo/'portal/serve.py',source/'meetings/townlight_meetings/public_archive.py',source/'meetings/townlight_meetings/meeting_lifecycle.py',backend/'townlight_records/requests/artifacts.py',backend/'townlight_records/requests/files.py',backend/'townlight_records/desktop_bridge/station.py',station/'townlight_station/api.py',station/'townlight_station/worker.py',media/'pyproject.toml']
    files += [p for p in (repo/'portal').rglob('*') if p.is_file() and p.suffix in ('.py','.html','.css','.js','.svg') and '__pycache__' not in p.parts]
    hashes={}
    for path in files:
        if path.is_file():
            with path.open('rb') as stream: hashes[str(path)]=hashlib.file_digest(stream,'sha256').hexdigest()
    commits={}
    for path in [repo,station,*(source/p for p in ('core','meetings','access','notice','sunshine')),media]:
        result=subprocess.run(['git','-C',str(path),'rev-parse','HEAD'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
        commits[str(path)]=result.stdout.strip() if result.returncode==0 else None
    save('input-manifest.json',{'sha256':hashes,'git_head':commits,'native_runtime_root':str(runtime),'services_python':str(python),'media_python':str(media_python),'portal_python':str(portal_python),'postgres_bin':str(pg),'ffmpeg':ffmpeg,'ffprobe':ffprobe,'node':node,'playwright':str(playwright),'chromium':str(chromium)})
def passed(name):
    checks.append(name); save('checks.json',checks); print('PASS '+name,flush=True)
def port():
    with socket.socket() as s: s.bind(('127.0.0.1',0)); return s.getsockname()[1]
def cmd(name,args,*,cwd=None,timeout=180):
    with (root/(name+'.log')).open('w',encoding='utf-8') as log:
        p=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout,creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode: raise RuntimeError(f'{name} failed ({p.returncode}); see {name}.log')
def boot(code):
    return [python,'-B','-c',f'import sys;sys.path[:0]={list(map(str,paths))!r};'+code]
def start(name,args,cwd=None):
    log=(root/(name+'.log')).open('w',encoding='utf-8')
    p=subprocess.Popen([str(x) for x in args],cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
    p.started=time.time(); children.append((name,p,log)); save('owned-jobs.json',[{'name':n,'pid':x.pid,'started':t,'expected':'service until cleanup','cancel':'terminate owned process','terminal':x.poll()} for n,x,_,t in [(n,x,l,getattr(x,'started',None)) for n,x,l in children]])
    return p
def stop(p):
    if p.poll() is None: p.terminate(); p.wait(timeout=20)
def ready(url,p,expected=200):
    for _ in range(150):
        if p.poll() is not None: raise RuntimeError(f'Service exited before readiness: {p.returncode}')
        try:
            if httpx.get(url,timeout=1,trust_env=False).status_code==expected:return
        except httpx.HTTPError: pass
        time.sleep(.2)
    raise RuntimeError('Readiness timed out '+url)
def request(client,method,path,headers=None,data=None,status=200):
    response=client.request(method,path,headers=headers,json=data)
    if response.status_code != status: raise RuntimeError(f'{method} {path}: expected {status}, got {response.status_code}: {response.text[:1000]}')
    return response

env={k:v for k,v in os.environ.items() if not k.startswith(('CIVIC','TOWNLIGHT','DATABASE','PG','OLLAMA'))}
env.update(PYTHONDONTWRITEBYTECODE='1',TESTING='1',JWT_SECRET=secrets.token_hex(32),ENCRYPTION_KEY=Fernet.generate_key().decode(),PORTAL_MODE='private',TOWNLIGHT_PRODUCT_PROFILE='meetings-beta',TOWNLIGHT_PROFILE_ROOT=str(root/'suite-profile'),TOWNLIGHT_DEBUG='1',TOWNLIGHT_DB=str(root/'portal.sqlite3'),TOWNLIGHT_RELEASE_ROOT=str(root/'portal-private'),TOWNLIGHT_DISPLAY_TIMEZONE='America/Denver')
password=secrets.token_hex(20); key=secrets.token_bytes(32)
users={role:{'email':role+'@example.invalid','role':role,'active':True,'display_name':'Synthetic '+role,'passcode_hash':secrets.token_hex(24)} for role in ('city-staff','clerk','records-staff')}
def login(role):
    account=users[role]; expiry=int(time.time())+3600
    message=f"{account['email']}\n{role}\n{expiry}\n{account['passcode_hash']}"
    proof=hmac.new(key,message.encode(),hashlib.sha256).hexdigest()
    (root/'suite-profile/config/local-session.json').write_text(json.dumps({**account,'expires_at_unix_seconds':expiry,'session_hash':proof}),encoding='utf-8')
    return {'X-Townlight-Session':proof}

try:
    identities()
    location_code=f"import townlight_runtime;from pathlib import Path;import json;p=Path(townlight_runtime.__file__).resolve();assert p.is_relative_to(Path({str(runtime)!r}).resolve()),str(p);Path({str(root/'imported-runtime.json')!r}).write_text(json.dumps({{'module_file':str(p)}}))"
    cmd('runtime-import',boot(location_code))
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong),('total',ctypes.c_ulonglong),('available',ctypes.c_ulonglong),('totalpage',ctypes.c_ulonglong),('availpage',ctypes.c_ulonglong),('totalvirtual',ctypes.c_ulonglong),('availvirtual',ctypes.c_ulonglong),('availvirtualextended',ctypes.c_ulonglong)]
    memory=MEMORYSTATUSEX(); memory.length=ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)): raise OSError('Memory probe failed')
    free=shutil.disk_usage(root).free
    save('resources.json',{'available_memory':memory.available,'free_disk':free,'started':time.time()})
    if memory.available < 2*1024**3 or free < 5*1024**3: raise RuntimeError('Insufficient resources for isolated acceptance')
    pgport,suiteport,stationport,portalport=port(),port(),port(),port()
    save('endpoints.json',{'postgres':pgport,'suite':suiteport,'station':stationport,'portal':portalport})
    pw=root/'pg-password.txt';pw.write_text(password,encoding='ascii')
    cmd('initdb',[pg/'initdb.exe','-D',root/'pgdata','-U','test_admin','-A','scram-sha-256','--pwfile',pw,'--encoding=UTF8','--locale=C']);pw.unlink()
    pg_process=start('postgres',[pg/'postgres.exe','-D',root/'pgdata','-h','127.0.0.1','-p',str(pgport),'-c','shared_buffers=64MB','-c','max_connections=40'])
    for _ in range(100):
        try: admin=psycopg2.connect(host='127.0.0.1',port=pgport,user='test_admin',password=password,dbname='postgres'); break
        except psycopg2.OperationalError:
            if pg_process.poll() is not None: raise
            time.sleep(.2)
    else: raise RuntimeError('PostgreSQL startup failed')
    admin.autocommit=True
    with admin.cursor() as cursor:
        cursor.execute('CREATE DATABASE townlight_suite');cursor.execute('CREATE ROLE station_app LOGIN PASSWORD %s',(password,));cursor.execute('CREATE DATABASE townlight_station OWNER station_app')
    admin.close()
    base=f'127.0.0.1:{pgport}'
    env.update(DATABASE_URL=f'postgresql+asyncpg://test_admin:{password}@{base}/townlight_suite',TOWNLIGHT_STATION_DATA_ROOT=str(root/'station-data'),TOWNLIGHT_STATION_DATABASE_URL=f'postgresql+psycopg2://station_app:{password}@{base}/townlight_station',TOWNLIGHT_STATION_SUITE_URL=f'http://127.0.0.1:{suiteport}',TOWNLIGHT_STATION_URL=f'http://127.0.0.1:{stationport}',TOWNLIGHT_STATION_MEDIA_SOURCE=str(media),TOWNLIGHT_STATION_MEDIA_PYTHON=str(media_python),TOWNLIGHT_STATION_MEDIA_RUNTIME=str(media_python.parent),TOWNLIGHT_STATION_FFPROBE=ffprobe,TOWNLIGHT_STATION_MAX_SECONDS='45',TOWNLIGHT_STATION_WIDTH='640',TOWNLIGHT_STATION_HEIGHT='360',TOWNLIGHT_STATION_BITRATE_KBPS='2000',TOWNLIGHT_NATIVE_ORIGIN=f'http://127.0.0.1:{suiteport}',TOWNLIGHT_NATIVE_PROOF_FILE=str(root/'publisher-proof.txt'))
    with psycopg2.connect(host='127.0.0.1',port=pgport,user='test_admin',password=password,dbname='townlight_suite') as conn:
        with conn.cursor() as c: c.execute('CREATE EXTENSION vector')
    cmd('records-migrations',boot("import runpy;sys.argv=['alembic','upgrade','head'];runpy.run_module('alembic',run_name='__main__')"),cwd=backend)
    migration=f"from alembic.config import Config;from alembic import command;import os;c=Config();c.set_main_option('script_location',{str(source/'meetings/townlight_meetings/migrations')!r});c.set_main_option('sqlalchemy.url',os.environ['DATABASE_URL'].replace('+asyncpg','+psycopg2'));command.upgrade(c,'head')"
    cmd('meetings-migrations',boot(migration))
    cmd('runtime-extension-migration',boot("from sqlalchemy import create_engine;from townlight_runtime.records_import_store import ensure_schema;from townlight_runtime.services import _sync_database_url;import os;e=create_engine(_sync_database_url(os.environ['DATABASE_URL']));ensure_schema(e);e.dispose()"))
    cmd('station-migrations',boot("import runpy;sys.argv=['townlight_station.cli','migrate'];runpy.run_module('townlight_station.cli',run_name='__main__')"))
    cmd('portal-migrate',[portal_python,'manage.py','migrate','--noinput'],cwd=repo/'portal')
    passed('real isolated PostgreSQL Records, Meetings, Station and portal migrations')
    config=root/'suite-profile/config';config.mkdir(parents=True)
    (root/'suite-profile/session-mac-secret.key').write_text(key.hex())
    (config/'first-admin.json').write_text(json.dumps({'email':'admin@example.invalid'}))
    (config/'staff-users.json').write_text(json.dumps(list(users.values())))
    with psycopg2.connect(host='127.0.0.1',port=pgport,user='test_admin',password=password,dbname='townlight_suite') as conn:
        with conn.cursor() as c:
            for role,user in users.items(): c.execute("INSERT INTO users (id,email,hashed_password,is_active,is_superuser,is_verified,role,full_name,must_change_password) VALUES (%s,%s,'!fixture',true,false,true,'staff',%s,false)",(str(uuid.uuid4()),user['email'],user['display_name']))
    suite_code=f"from townlight_runtime.services import create_runtime_app;import uvicorn;uvicorn.run(create_runtime_app(domain_enabled=True),host='127.0.0.1',port={suiteport},access_log=False)"
    suite_proc=start('suite-http',boot(suite_code)); ready(env['TOWNLIGHT_NATIVE_ORIGIN']+'/desktop/v1/station/context?capability=read',suite_proc,401)
    station_proc=start('station-http',boot(f"import runpy;sys.argv=['townlight_station.cli','serve','--port','{stationport}'];runpy.run_module('townlight_station.cli',run_name='__main__')"));ready(env['TOWNLIGHT_STATION_URL']+'/health',station_proc)
    # Continuation below performs only synthetic HTTP and local files.
    with httpx.Client(base_url=env['TOWNLIGHT_NATIVE_ORIGIN'],timeout=60,trust_env=False) as suite, httpx.Client(base_url=env['TOWNLIGHT_STATION_URL'],timeout=60,trust_env=False) as st:
        clerk=login('clerk')
        meeting=request(suite,'POST','/desktop/v1/meetings/meetings',clerk,{'title':'PRIVATE INTERNAL MEETING SENTINEL','scheduled_start':'2026-11-01T18:00:00-07:00','location':'Synthetic Chamber','meeting_type':'regular'},201).json()
        mid=meeting['id']
        agenda=request(suite,'POST','/desktop/v1/meetings/agenda-items',clerk,{'title':'Synthetic Public Agenda','department_name':'Public Works'},201).json()
        request(suite,'POST',f"/desktop/v1/meetings/agenda-items/{agenda['id']}/meeting",clerk,{'meeting_id':mid})
        packet=request(suite,'POST',f'/desktop/v1/meetings/meetings/{mid}/packet-snapshots',clerk,{'agenda_item_ids':[agenda['id']]},201).json()
        minutes=request(suite,'POST',f'/desktop/v1/meetings/meetings/{mid}/minutes/drafts',clerk,{'source_materials':[{'source_id':'synthetic-source','label':'Public meeting source','text':'Synthetic minutes text'}],'sentences':[{'text':'Synthetic minutes text','citations':['synthetic-source']}]},201).json()
        request(suite,'POST',f'/desktop/v1/meetings/meetings/{mid}/archive',clerk,{'visibility':'public','packet_id':packet['packet_id'],'minutes_id':minutes['id'],'plain_language_summary':'Synthetic public summary'},201)
        # The HTTP wrapper always copies the meeting title. The canonical repository
        # permits an independently approved public title, which this privacy case needs.
        fixture_code = f"from townlight_meetings.public_archive import PublicArchiveRepository;from townlight_runtime.meetings_bridge import database_url;import json;from pathlib import Path;s=PublicArchiveRepository(db_url=database_url());r=s.publish(meeting_id={mid!r},title='Synthetic Council Session',visibility='public',posted_agenda='Synthetic Public Agenda',posted_packet='Synthetic public packet',approved_minutes='Synthetic minutes text',plain_language_summary='Synthetic public summary',actor='acceptance');Path({str(root/'domain-archive-fixture.json')!r}).write_text(json.dumps(r.public_dict()));s.engine.dispose()"
        cmd('domain-archive-fixture',boot(fixture_code))
        archive=json.loads((root/'domain-archive-fixture.json').read_text())
        closed=request(suite,'POST',f'/desktop/v1/meetings/meetings/{mid}/archive',clerk,{'visibility':'closed_session'},201).json()
        passed('public archive, agenda, packet and minutes created via Meetings HTTP')
        ingest=root/'station-data/ingest';ingest.mkdir(parents=True,exist_ok=True)
        cmd('generate-media',[ffmpeg,'-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-f','mpegts',ingest/'synthetic.ts'])
        capture={'meeting_id':mid,'agenda_ids':[agenda['id']],'source_file':'synthetic.ts','idempotency_key':'portal-e2e'}
        rid=request(st,'POST','/v1/recordings',clerk,capture,202).json()['id']
        cmd('station-worker',boot("import runpy;sys.argv=['townlight_station.cli','worker','--once'];runpy.run_module('townlight_station.cli',run_name='__main__')"),timeout=120)
        record=request(st,'GET',f'/v1/recordings/{rid}',clerk).json()
        if record['status'] != 'complete': raise RuntimeError(f"Station did not complete: {record['status']}")
        recording=request(st,'GET',f'/v1/recordings/{rid}/content',clerk).content
        assert hashlib.sha256(recording).hexdigest()==record['details']['sha256']
        passed('actual Station worker processed synthetic video and returned hash-verified recording')
        records=login('records-staff')
        req=request(suite,'POST','/desktop/v1/requests',records,{'requester':'Private Synthetic Resident','summary':'Private Synthetic Request','deadline':'2026-11-20','deadlineBasis':'Staff reviewed'},201).json()['id']
        handoff=request(suite,'POST',f'/desktop/v1/requests/{req}/station-recordings',records,{'recording_id':rid,'expected_sha256':record['details']['sha256']}).json()
        attachment=handoff['request']['documents'][0]['attachment_id']
        managed=root/'suite-profile/Data/files/records/releases';managed.mkdir(parents=True,exist_ok=True)
        station_ts=root/'station-completed.ts';station_ts.write_bytes(recording)
        mp4=managed/'synthetic-approved.mp4'
        cmd('approved-mp4',[ffmpeg,'-hide_banner','-loglevel','error','-i',station_ts,'-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',mp4])
        digest=hashlib.sha256(mp4.read_bytes()).hexdigest()
        receipt={'original_path':'synthetic approved copy','stored_path':str(mp4),'file_name':mp4.name,'sha256':digest,'size_bytes':mp4.stat().st_size}
        request(suite,'POST',f'/desktop/v1/requests/{req}/documents/{attachment}/release-copy',records,{'status':'redacted copy','note':'Synthetic staff-reviewed release','file':receipt})
        with psycopg2.connect(host='127.0.0.1',port=pgport,user='test_admin',password=password,dbname='townlight_suite') as conn:
            with conn.cursor() as c:
                c.execute('SELECT id FROM request_release_copies WHERE attachment_id=%s',(attachment,));copyid=str(c.fetchone()[0])
        selection={'action':'publish','approve_publication':True,'archive_id':archive['id'],'meeting_id':mid,'recording_id':rid,'request_id':req,'release_copy_id':copyid,'expected_release_sha256':digest}
        publisher=login('city-staff'); bundle='/desktop/v1/portal/bundle'
        assert suite.post(bundle,json=selection).status_code==401
        assert suite.post(bundle,json=selection,headers=login('clerk')).status_code==403
        publisher=login('city-staff')
        assert suite.post(bundle,json={**selection,'approve_publication':False},headers=publisher).status_code==422
        assert suite.post(bundle,json=selection,headers=publisher).status_code==409
        passed('publication denies absent proof, wrong role, missing approval and unfulfilled request')
        records=login('records-staff')
        def action(name,payload): return request(suite,'POST',f'/desktop/v1/requests/{req}/actions',records,{'action':name,'payload':payload})
        action('add-records-exemption-decision',{'exemptionSource':'Synthetic recording','exemptionKind':'review','exemptionFinding':'Reviewed for release','exemptionDecision':'redact','exemptionBasis':'Staff review'})
        action('draft-records-response',{'responseDraft':'Synthetic approved response','citation':'Synthetic source'})
        action('approve-records-response',{'approvalNote':'Synthetic human approval'})
        exports=root/'suite-profile/Data/exports/records';exports.mkdir(parents=True,exist_ok=True)
        for kind in ('response','release-package'):
            plan=request(suite,'POST',f'/desktop/v1/requests/{req}/artifacts',records,{'kind':kind}).json()
            data=plan['content'].encode();assert hashlib.sha256(data).hexdigest()==plan['sha256']
            out=exports/plan['file_name'];out.write_bytes(data)
            out.with_name(out.name+'.manifest.json').write_text(json.dumps({'export_file':out.name,'sha256':plan['sha256'],'size_bytes':len(data)}),encoding='utf-8')
            request(suite,'POST',f"/desktop/v1/requests/{req}/artifacts/{plan['artifact_id']}/complete",records,{'export_path':str(out)})
        action('fulfill-records-request',{})
        passed('Records HTTP handoff, approved release copy, current approval, verified response and package, and fulfillment')
        assert suite.get(f'/desktop/v1/portal/selections?request_id={req}',headers=login('clerk')).status_code==403
        publisher=login('city-staff');(root/'publisher-proof.txt').write_text(publisher['X-Townlight-Session'])
        choices=request(suite,'GET',f'/desktop/v1/portal/selections?request_id={req}',publisher).json()['selections']
        chosen=next(item for item in choices if item['selection']['archive_id']==archive['id'])
        assert chosen['title']=='Synthetic Council Session' and chosen['selection']['release_copy_id']==copyid
        assert chosen['selection']['approve_publication'] is False
        selection={**chosen['selection'],'approve_publication':True}
        passed('native publisher lookup returns eligible public choice without granting approval and denies wrong role')
        assert suite.post(bundle,json={**selection,'expected_release_sha256':'0'*64},headers=publisher).status_code==409
        assert suite.post(bundle,json={**selection,'archive_id':closed['id']},headers=publisher).status_code==409
        response=request(suite,'POST',bundle,publisher,selection)
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            assert set(z.namelist())=={'manifest.json','release.bin'}
            manifest=json.loads(z.read('manifest.json')); assert hashlib.sha256(z.read('release.bin')).hexdigest()==digest
            text=json.dumps(manifest)
            for secret in ('Private Synthetic Resident','Private Synthetic Request','PRIVATE INTERNAL MEETING SENTINEL',str(root),publisher['X-Townlight-Session']): assert secret not in text
        save('public-manifest.json',manifest)
        passed('bundle authenticates real public sources, rejects closed archive/wrong hash, contains only approved bytes')
        selection_path=root/'selection.json';selection_path.write_text(json.dumps(selection))
        cmd('portal-sync',[portal_python,'manage.py','sync_townlight',selection_path],cwd=repo/'portal',timeout=120)
        cmd('portal-sync-repeat',[portal_python,'manage.py','sync_townlight',selection_path],cwd=repo/'portal',timeout=120)
        portal_proc=start('portal-http',[portal_python,'manage.py','runserver',f'127.0.0.1:{portalport}','--noreload'],cwd=repo/'portal')
        portal_base=f'http://127.0.0.1:{portalport}'
        ready(portal_base+'/meetings/',portal_proc)
        import sqlite3
        with sqlite3.connect(env['TOWNLIGHT_DB']) as conn:
            rows=conn.execute("SELECT id FROM website_meeting WHERE vendor='townlight'").fetchall();assert len(rows)==1
        pk=rows[0][0]
        page=httpx.get(f'{portal_base}/meetings/{pk}/',trust_env=False);assert page.status_code==200
        for secret in ('Private Synthetic Resident','Private Synthetic Request','PRIVATE INTERNAL MEETING SENTINEL',str(root),publisher['X-Townlight-Session']): assert secret not in page.text
        released=httpx.get(f'{portal_base}/meetings/{pk}/release/',trust_env=False);assert released.status_code==200 and hashlib.sha256(released.content).hexdigest()==digest
        partial=httpx.get(f'{portal_base}/meetings/{pk}/release/',headers={'Range':'bytes=0-15'},trust_env=False);assert partial.status_code==206 and partial.content==mp4.read_bytes()[:16]
        passed('portal repeat sync is idempotent; public page and ranged release are hash-verified and exclude private content')
        cmd('portal-demo',[portal_python,'manage.py','setup_demo'],cwd=repo/'portal')
        cmd('portal-primegov',[portal_python,'manage.py','import_synthetic',repo/'portal/fixtures/meeting.json'],cwd=repo/'portal')
        exported=root/'portal-export'
        cmd('portal-export',[portal_python,'manage.py','export_public',exported],cwd=repo/'portal')
        exported_text=(exported/'content.json').read_text(encoding='utf-8')
        for secret in ('PRIVATE INTERNAL MEETING SENTINEL','Private Synthetic Resident','Private Synthetic Request',str(root),publisher['X-Townlight-Session']): assert secret not in exported_text
        with (exported/'releases'/f'{pk}.bin').open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest()==digest
        passed('public export contains approved release bytes and excludes private meeting title and request data')
        prodport=port()
        env.update(TOWNLIGHT_DEBUG='0',TOWNLIGHT_SECRET_KEY=secrets.token_hex(40),TOWNLIGHT_TRUST_TLS_PROXY='1')
        prod=start('portal-production',[portal_python,'serve.py','--port',str(prodport)],cwd=repo/'portal')
        env['TOWNLIGHT_DEBUG']='1';env.pop('TOWNLIGHT_TRUST_TLS_PROXY');env.pop('TOWNLIGHT_SECRET_KEY')
        prod_base=f'http://127.0.0.1:{prodport}'
        ready(prod_base+'/meetings/',prod,301)
        prod_response=httpx.get(f'{prod_base}/meetings/{pk}/release/',headers={'X-Forwarded-Proto':'https','Range':'bytes=0-15'},trust_env=False)
        assert prod_response.status_code==206 and prod_response.content==mp4.read_bytes()[:16]
        stop(prod)
        passed('production Waitress entry enforces HTTPS redirect and serves approved range behind configured loopback TLS proxy')
        # A failed sync cannot remove the prior publication.
        stop(suite_proc)
        failed=subprocess.run([str(portal_python),'manage.py','sync_townlight',str(selection_path)],cwd=repo/'portal',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
        assert failed.returncode != 0 and httpx.get(f'{portal_base}/meetings/{pk}/release/',trust_env=False).status_code==200
        suite_proc=start('suite-http-restarted',boot(suite_code));ready(env['TOWNLIGHT_NATIVE_ORIGIN']+'/desktop/v1/station/context?capability=read',suite_proc,401)
        passed('native service failure leaves existing public release available')
        # Browser acceptance uses the existing local Playwright and Chromium installations.
        admin_password=secrets.token_urlsafe(20)
        env['PORTAL_TEST_PASSWORD']=admin_password
        create_admin="import os;from django.contrib.auth import get_user_model;get_user_model().objects.create_superuser('publisher','publisher@example.invalid',os.environ['PORTAL_TEST_PASSWORD'])"
        cmd('portal-admin',[portal_python,'manage.py','shell','-c',create_admin],cwd=repo/'portal')
        with sqlite3.connect(env['TOWNLIGHT_DB']) as conn:
            service_pk=conn.execute("SELECT page_ptr_id FROM website_servicepage WHERE kind='records'").fetchone()[0]
        browser_env={'base':portal_base,'pk':pk,'service_pk':service_pk,'selection':selection,'password':admin_password}
        (root/'browser-input.json').write_text(json.dumps(browser_env),encoding='utf-8')
        cmd('browser',[node,repo/'scripts/portal-e2e-browser.cjs',playwright,root/'browser-input.json',root/'browser-result.json',chromium],timeout=90)
        (root/'browser-input.json').unlink()
        passed('headless browser verifies resident desktop/mobile/no-JS flows, editor content and authenticated publication with actual MP4 playback')
        withdrawal={**selection,'action':'withdraw'};selection_path.write_text(json.dumps(withdrawal))
        cmd('portal-withdraw',[portal_python,'manage.py','sync_townlight',selection_path],cwd=repo/'portal')
        assert httpx.get(f'{portal_base}/meetings/{pk}/',trust_env=False).status_code==404
        assert httpx.get(f'{portal_base}/meetings/{pk}/release/',trust_env=False).status_code==404
        for kind in ('agenda','packet','minutes'):
            assert httpx.get(f'{portal_base}/meetings/{pk}/documents/{kind}/',trust_env=False).status_code==404
        assert 'Synthetic Council Session' not in httpx.get(portal_base+'/',trust_env=False).text
        assert 'Synthetic Council Session' not in httpx.get(portal_base+'/search/?q=Synthetic',trust_env=False).text
        passed('explicit withdrawal hides meeting, documents, search, homepage feature and release routes')
        save('result.json',{'passed':True,'checks':checks,'meeting_id':mid,'archive_id':archive['id'],'recording_id':rid,'request_id':req,'release_copy_id':copyid,'original_sha256':record['details']['sha256'],'release_sha256':digest})
finally:
    for name,p,log in reversed(children):
        if name!='postgres': stop(p)
        log.flush()
    if pg_process and pg_process.poll() is None:
        cmd('postgres-stop',[pg/'pg_ctl.exe','-D',root/'pgdata','-m','fast','-w','stop'],timeout=30)
        pg_process.wait(timeout=10)
    save('owned-jobs.json',[{'name':n,'pid':p.pid,'terminal':p.poll()} for n,p,_ in children])
    for _,_,log in children:log.close()
    (root/'publisher-proof.txt').unlink(missing_ok=True)
    (root/'browser-input.json').unlink(missing_ok=True)
