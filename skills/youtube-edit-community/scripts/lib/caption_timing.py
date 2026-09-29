"""Character DP alignment to word clocks, constrained to each retained segment."""
import re
import unicodedata
import numpy as np
from .settings import read, write

def normalized(text):
    text = unicodedata.normalize('NFKC', text).lower()
    return ''.join(chr(ord(c)-96) if '\u30a1' <= c <= '\u30f6' else c
                   for c in text if c.isalnum() or '\u3040' <= c <= '\u30ff')

def align(a, b):
    """Needleman-Wunsch; vectorized rows, deterministic earlier-match ties."""
    m, n = len(a), len(b)
    if not m or not n: return [None]*m
    if (m+1)*(n+1)>100_000_000:
        raise ValueError('字幕の整列区間が長すぎます。segment単位に分けてください')
    score = np.empty((m+1,n+1), dtype=np.int32)
    score[0] = -np.arange(n+1);score[:,0] = -np.arange(m+1)
    bc = np.array(list(b));cols = np.arange(1,n+1)
    for i, char in enumerate(a, 1):
        base = np.maximum(score[i-1,:-1] + np.where(bc == char, 3, -2), score[i-1,1:]-1)
        score[i,1:] = np.maximum.accumulate(np.maximum(base+cols, score[i,0]))-cols
    mapping = [None]*m;i,j=m,n
    while i and j:
        # Prefer dropping later source words on ties to anchor repeated phrases early.
        if score[i,j] == score[i,j-1]-1: j-=1
        elif score[i,j] == score[i-1,j-1]+(3 if a[i-1]==b[j-1] else -2):
            mapping[i-1]=j-1;i-=1;j-=1
        else: i-=1
    return mapping

def retime(items, words, timeline):
    if isinstance(items, dict): items=items['items']
    rows=timeline['segments'];groups={r['id']:[] for r in rows}
    for item in items:
        c=dict(item)
        if 'segment' in c:
            rid=c['segment']
        else:
            matches=[r for r in rows if r['output_s']-1e-6<=c.get('start',-1)<r['output_e']]
            if len(matches)!=1: raise ValueError('校閲字幕に完成時刻 start または segment が必要です')
            rid=matches[0]['id']
        if rid not in groups:raise ValueError('字幕のsegmentが保持区間にありません')
        groups[rid].append(c)
    result=[];report=[]
    for row in rows:
        group=groups[row['id']]
        if not group:continue
        selected=[w for w in words if w['s']>=row['source_s']-1e-6 and w['e']<=row['source_e']+1e-6]
        source='';owners=[]
        for wi,w in enumerate(selected):
            chars=normalized(w['w']);source+=chars;owners.extend([wi]*len(chars))
        texts=[normalized(c['text']) for c in group]
        if any(not t for t in texts):raise ValueError('整列できない空字幕です')
        mapping=align(''.join(texts),source);cursor=0;anchored=[]
        for c,t in zip(group,texts):
            pairs=[(k,j) for k,j in enumerate(mapping[cursor:cursor+len(t)]) if j is not None]
            similarity=sum(t[k]==source[j] for k,j in pairs)/len(t)
            if not pairs or similarity<.4:raise ValueError('単語列との対応を確認してください: '+c['text'])
            first,last=owners[pairs[0][1]],owners[pairs[-1][1]]
            a=selected[first]['s'];b=selected[last]['e']
            anchored.append({'text':c['text'], 'start':row['output_s']+a-row['source_s'],
                             'end':row['output_s']+b-row['source_s'], 'segment':row['id'],
                             'speech_source_start':a,'speech_source_end':b})
            report.append({'text':c['text'],'similarity':round(similarity,4),'first_word':first,'last_word':last})
            cursor+=len(t)
        for i,c in enumerate(anchored):
            limit=anchored[i+1]['start'] if i+1<len(anchored) else row['output_e']
            gap=limit-c['end']
            if 0<gap<=4+1e-6:c['end']=limit
            # A short display may borrow silence, never the following speech or a cut.
            c['end']=min(limit,max(c['end'],c['start']+.6))
            if c['end']<=c['start']:
                raise ValueError('隣接字幕が同じ単語に重なります。分割を直してください: '+c['text'])
            for key in ('start','end'):c[key]=round(c[key],6)
            c['source_start']=round(row['source_s']+c['start']-row['output_s'],6)
            c['source_end']=round(row['source_s']+c['end']-row['output_s'],6)
        result.extend(anchored)
    return result,report

def import_reviewed(work, path):
    items,report=retime(read(path),read(work/'transcript.json'),read(work/'timeline.json'))
    write(work/'captions.json',items)
    write(work/'captions.alignment.json',{'method':'character_dp_word_edges','items':report})
    return items
