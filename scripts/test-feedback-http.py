"""Actual loopback feedbackd/PostgreSQL contract smoke test. Fictitious data only."""
import hashlib, io, json, os, secrets, urllib.request, urllib.error
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'build/qa/feedback-backend';target.mkdir(parents=True,exist_ok=True)
report=target/'http-contract.json'
report.unlink(missing_ok=True)
BASE=os.environ.get('FEEDBACK_TEST_HTTP_URL','http://127.0.0.1:4187')
if not BASE.startswith('http://127.0.0.1:'):
    raise SystemExit('Only loopback development service may be tested')
HTTP=urllib.request.build_opener(urllib.request.ProxyHandler({}))
ADMIN=(ROOT/'tmp/feedback-development/admin-token.txt').read_text().strip()
checks=[]
def request(method,path,payload=None,token=None,files=None,status=200):
    headers={}
    body=None
    if files is not None:
        boundary='feedback-'+secrets.token_hex(16);chunks=[]
        def part(name,data,filename=None):
            head=f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            if filename:head+=f'; filename="{filename}"'
            chunks.append((head+'\r\n\r\n').encode()+data+b'\r\n')
        part('payload',json.dumps(payload,ensure_ascii=False).encode())
        for name,data in files:part('files',data,name)
        body=b''.join(chunks)+f'--{boundary}--\r\n'.encode()
        headers['Content-Type']='multipart/form-data; boundary='+boundary
    elif payload is not None:
        body=json.dumps(payload,ensure_ascii=False).encode();headers['Content-Type']='application/json'
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(BASE+path,data=body,headers=headers,method=method)
    try:r=HTTP.open(req,timeout=15)
    except urllib.error.HTTPError as e:r=e
    b=r.read()
    assert r.status==status,(method,path,r.status,status,b.decode(errors='replace'))
    assert r.headers.get('Cache-Control')=='no-store'
    return json.loads(b) if 'application/json' in r.headers.get('Content-Type','') else b

cfg=request('GET','/api/feedback/config')
assert cfg['enabled'] and cfg['development'] and not cfg['notificationsEnabled']
checks.append('explicit fictional-development configuration')
im=Image.new('RGB',(32,20),'white');im.putpixel((1,1),(0,0,0));out=io.BytesIO();im.save(out,format='PNG')
example=json.dumps({'version':1,'kind':'doc2govpdf-feedback-example','blocks':[{'type':'table','rows':[['项目','数量'],['虚构耗材','2']]}]},ensure_ascii=False).encode()
for role,desc,files in [
 ('政务经办','虚构岗位体验：希望减少重复录入，不提供真实身份资料',None),
 ('学校办公室','虚构岗位体验：回执保留填写栏',[('example.json',example)]),
 ('医院行政','虚构岗位体验：截图反映排版位置',[('crop.png',out.getvalue())])]:
    sent={'clientRequestId':secrets.token_urlsafe(32),'accessToken':secrets.token_urlsafe(32),'description':desc,'role':role,'goal':'说明工作目标并获得处理结果'}
    receipt=request('POST','/api/feedback/threads',sent,files=files,status=201);assert receipt['accessToken']==sent['accessToken']
    again=request('POST','/api/feedback/threads',sent,files=files);assert again['id']==receipt['id']
    path='/api/feedback/threads/'+receipt['id'];token=receipt['accessToken']
    request('GET',path,status=404)
    feedback=request('GET',path,token=token);assert feedback['description']==desc
    for attachment in feedback['attachments']:
        address=path+'/attachments/'+attachment['id'];request('GET',address,status=404);assert request('GET',address,token=token)
        request('DELETE',address,token=token);request('GET',address,token=token,status=404)
    msg={'clientRequestId':secrets.token_urlsafe(32),'description':'虚构补充：当前稿不上传，只有所选副本'}
    request('POST',path+'/messages',msg,token=token,status=201);request('POST',path+'/messages',msg,token=token)
    adminpath='/api/feedback/admin/threads/'+receipt['id']
    request('POST',adminpath+'/messages',{'clientRequestId':secrets.token_urlsafe(32),'description':'虚构处理回复：已复现，示例问题已修正'},token=ADMIN,status=201)
    request('PATCH',adminpath,{'status':'resolved','owner':'模拟处理岗','fixVersion':'feedback-contract-test','relatedId':''},token=ADMIN)
    feedback=request('GET',path,token=token);assert feedback['status']=='resolved' and len(feedback['messages'])==2 and feedback['fixVersion']=='feedback-contract-test'
    request('DELETE',path,token=token);request('GET',path,token=token,status=404)
    request('POST','/api/feedback/threads',sent,files=files,status=410)
    checks.append(role+': create/retry/private receipt/supplement/reply/status/version/attachment authorization+delete/full delete/no recreation')

assert not request('GET','/api/feedback/admin/threads',token=ADMIN)['threads']
logs=''.join(p.read_text(errors='replace') for p in (ROOT/'tmp/feedback-development').glob('service-*.log'))
assert ADMIN not in logs and '虚构岗位体验' not in logs and sent['accessToken'] not in logs
checks.append('service logs contain neither test body nor private credentials')
target=ROOT/'build/qa/feedback-backend';target.mkdir(parents=True,exist_ok=True)
report.write_text(json.dumps({'passed':True,'testedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ('internal/feedback','cmd/feedbackd') for p in (ROOT/d).rglob('*.go')},'scope':'actual loopback feedbackd + PostgreSQL; API role contracts, not browser UI','checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':True,'checks':len(checks),'report':'build/qa/feedback-backend/http-contract.json'}))
