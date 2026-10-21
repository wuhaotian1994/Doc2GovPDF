import hashlib,json,math,statistics
from pathlib import Path
root=Path(__file__).resolve().parent.parent
folder=root/'build/qa/ceo-005'
before=[]
for name in ['baseline','baseline-other']:before+=json.loads((folder/(name+'.json')).read_text('utf-8'))['rows']
final=json.loads((folder/'final.json').read_text('utf-8'))
summary=[]
for profile in ['chrome','firefox','webkit']:
    for kind in ['fresh-context','cached-reopen','warm-short','warm-long']:
        item={'profile':profile,'kind':kind}
        for key,rows in [('before',before),('after',final['rows'])]:
            rows=[row for row in rows if row['profile']==profile and row['kind']==kind]
            values=sorted(row.get('visibleAfterInputMS',row.get('visibleFromNavigationMS')) for row in rows)
            ready=sorted(row.get('readyAfterInputMS',row.get('readyFromNavigationMS')) for row in rows)
            item[key]={'n':len(rows),'visibleMedianMS':round(statistics.median(values),1),'visibleP95MS':round(values[math.ceil(len(values)*.95)-1],1),'visibleMaxMS':round(max(values),1),'readyMedianMS':round(statistics.median(ready),1),'readyP95MS':round(ready[math.ceil(len(ready)*.95)-1],1),'maxInputHandlerMS':round(max(row.get('inputHandlerMS',0) for row in rows),1)}
        summary.append(item)
result={'environment':final['environment'],'definition':final['definition'],'currentPage':1,'summary':summary,'baselineWriteJSSHA256':hashlib.sha256((root/'build/qa/ceo-005-baseline-web/write.js').read_bytes()).hexdigest(),'finalWriteJSSHA256':hashlib.sha256((root/'build/qa/ceo-005-web/write.js').read_bytes()).hexdigest()}
(folder/'final-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(summary))
