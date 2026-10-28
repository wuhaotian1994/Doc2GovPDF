"""Inspect generated evidence and prove strict-server compatibility with fictitious copies."""
import hashlib,io,json,os,secrets,struct,urllib.request,urllib.error
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'build/qa/feedback-evidence';HTTP=urllib.request.build_opener(urllib.request.ProxyHandler({}));BASE=os.environ.get('FEEDBACK_TEST_HTTP_URL','http://127.0.0.1:4187');checks=[]
assert BASE.startswith('http://127.0.0.1:'), 'Only loopback fictional feedback service may be used'
def call(method,path,body=None,token=None,ctype='application/json',expected=200):
    headers={'Content-Type':ctype}
    if token:headers['Authorization']='Bearer '+token
    if body is not None and not isinstance(body,bytes):body=json.dumps(body,ensure_ascii=False).encode()
    try:r=HTTP.open(urllib.request.Request(BASE+path,body,headers,method=method),timeout=15)
    except urllib.error.HTTPError as e:r=e
    payload=r.read();assert r.status==expected,(r.status,payload.decode(errors='replace'))
    return json.loads(payload) if 'application/json' in r.headers.get('Content-Type','') else payload
cfg=call('GET','/api/feedback/config');assert cfg['enabled'] and cfg['development']
for profile in ('chrome','firefox','webkit'):
    png=(OUT/f'{profile}-screenshot.png').read_bytes();example=(OUT/f'{profile}-example.json').read_bytes();data=json.loads(example)
    im=Image.open(io.BytesIO(png)).convert('RGBA');assert im.size==(52,36)
    assert all(im.getpixel((x,y))==(32,43,60,255) for y in range(4,16) for x in range(4,20))
    assert im.getpixel((45,13))==(36,88,184,255)
    assert all(value==255 for value in im.tobytes()[3::4]) and b'HIDDEN_SOURCE_SENTINEL' not in png
    assert 'SECRET_' not in example.decode() and '13800138000' not in example.decode()
    assert data['blocks'][1]['rows']==[['项目','数量'],['虚构耗材','2'],['虚构签字','']]
    assert all(data['blocks'][0].get(k)==v for k,v in {'role':'heading2','align':'center','indent':'none','before':'half','after':'one'}.items()) and data['blocks'][1]['header'] is True
    chunks=[];p=8
    while p<len(png):
        length=struct.unpack('>I',png[p:p+4])[0];kind=png[p+4:p+8].decode();chunks.append(kind);p+=12+length
    assert not any(kind in chunks for kind in ('tEXt','zTXt','iTXt','eXIf'))
    token=secrets.token_urlsafe(32);payload={'clientRequestId':secrets.token_urlsafe(32),'accessToken':token,'description':'虚构证据组件兼容验证，不包含真实文稿','role':'虚构学校办公室'}
    boundary='evidence-'+secrets.token_hex(12);body=b''
    def part(name,value,filename=None):
        header=f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'+(f'; filename="{filename}"' if filename else '')+'\r\n\r\n'
        return header.encode()+value+b'\r\n'
    body+=part('payload',json.dumps(payload,ensure_ascii=False).encode());body+=part('files',png,'screenshot.png');body+=part('files',example,'example.json');body+=f'--{boundary}--\r\n'.encode()
    receipt=call('POST','/api/feedback/threads',body,ctype='multipart/form-data; boundary='+boundary,expected=201);path='/api/feedback/threads/'+receipt['id']
    try:
        stored=call('GET',path,token=token);assert len(stored['attachments'])==2
        for a in stored['attachments']:
            content=call('GET',path+'/attachments/'+a['id'],token=token)
            if a['mediaType']=='image/png':assert Image.open(io.BytesIO(content)).convert('RGBA').tobytes()==im.tobytes()
            else:assert content==data
    finally:call('DELETE',path,token=token)
    checks.append({'profile':profile,'passed':True,'dimensions':[52,36],'coveredPixels':192,'pngChunks':chunks,'pngSHA256':hashlib.sha256(png).hexdigest(),'exampleSHA256':hashlib.sha256(example).hexdigest(),'strictPostgresServerAcceptedBoth':True,'deletedAfterValidation':True})
(OUT/'verified.json').write_text(json.dumps({'passed':True,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':True,'profiles':3,'realArtifacts':6,'strictPostgresPairs':3,'report':'build/qa/feedback-evidence/verified.json'}))
