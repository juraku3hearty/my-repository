from fractions import Fraction
from .settings import read,write,ff,fps_for
from .audio import master_role,stream_index,ROLES
from .fingerprints import file_hash,object_hash

def make_timeline(work,s,keep,exact=False):
    p=read(work/'probe.json');sync=read(work/'sync.json');fps=fps_for(p,s);rate=float(Fraction(fps));role=master_role(p,s);master=p[role]
    if sync['master']!=role: raise ValueError('主音声が変わりました。syncを再実行してください')
    if sync.get('audio_stream_indices')!={r:p[r]['audio_stream_index'] for r in ROLES if r in p}: raise ValueError('音声ストリームが変わりました。syncを再実行してください')
    words=read(work/'transcript.json');rows=[];frames=0;last=-1
    for i,row in enumerate(keep):
        a,b=float(row['s']),float(row['e'])
        if not 0<=a<b<=master['duration_s'] or a<last: raise ValueError('保持区間は昇順・重複なし・主音声の範囲内で指定してください')
        last=b
        # Preserve up to 80 ms around edits; exact preview boundaries stay fixed.
        lo=max(0,a-(0 if exact else .08));hi=min(master['duration_s'],b+(0 if exact else .08))
        if i: lo=max(lo,(float(keep[i-1]['e'])+a)/2)
        if i+1<len(keep): hi=min(hi,(b+float(keep[i+1]['s']))/2)
        n=round((hi-lo)*rate)
        if n<1: raise ValueError('保持区間が1フレーム未満です')
        duration=n/rate
        offsets={k:sync.get(f'{k}_minus_master_s') for k in ('camera','screen') if k in p}
        for k,offset in offsets.items():
            if offset is None: raise ValueError(f'{k}: 手動同期が必要です')
            if lo+offset<-.001 or lo+offset+duration>p[k]['duration_s']+.05: raise ValueError(f'{k}: 保持区間 {i} が同期後の素材外です')
        rows.append({'id':i,'requested_s':a,'requested_e':b,'source_s':lo,'source_e':lo+duration,'output_s':frames/rate,'output_e':(frames+n)/rate,'frames':n,'note':row.get('note',''),'offsets':offsets})
        frames+=n
    if not rows: raise ValueError('保持区間が空です')
    data={'fps':fps,'frames':frames,'duration_s':frames/rate,'boundary_protection_s':0 if exact else .08,'segments':rows}
    write(work/'keep_segments.json',keep);write(work/'timeline.json',data);return data

def cut_signature(work,s,keep,exact):
    p=read(work/'probe.json')
    return {'revision':5,'keep':object_hash(keep),'settings':object_hash(s),'sync':file_hash(work/'sync.json'),
            'exact':exact,'master':master_role(p,s),
            'materials':{r:{'path':p[r]['path'],'sha256':file_hash(p[r]['path']),
                            'audio_stream_index':p[r]['audio_stream_index']} for r in ROLES if r in p}}

def cut(work,s,keep,exact=False,reuse=False,force=False):
    signature=cut_signature(work,s,keep,exact);meta=work/'cut.meta.json'
    p=read(work/'probe.json')
    outputs=['master.wav']+[name+'.mp4' for role,name in [('camera','talk'),('screen','screen')] if role in p and p[role]['video']]
    old=read(meta) if meta.exists() else {}
    if reuse and not force and old.get('signature')==signature and (work/'timeline.json').exists() and old.get('timeline_sha256')==file_hash(work/'timeline.json'):
        if all((work/f).is_file() and (work/f).stat().st_size>0 and old.get('outputs',{}).get(f)=={'size':(work/f).stat().st_size,'mtime_ns':(work/f).stat().st_mtime_ns} for f in outputs):
            print('cut: 入力ハッシュ一致、既存中間ファイルを再利用',flush=True)
            write(work/'keep_segments.json',keep)
            write(work/'cut.reuse.json',{'reused':True,'signature':signature})
            return read(work/'timeline.json')
    write(meta,{'status':'running','signature':signature})
    write(work/'cut.reuse.json',{'reused':False,'signature':signature})
    timeline=make_timeline(work,s,keep,exact);p=read(work/'probe.json');fps=timeline['fps'];w=s['output']['width'];h=s['output']['height']
    parts=work/'parts';parts.mkdir(exist_ok=True)
    for role,name in [('camera','talk'),('screen','screen')]:
        if role not in p or not p[role]['video']: continue
        files=[]
        for r in timeline['segments']:
            dest=parts/f'{name}_{r["id"]:03d}.mp4';start=r['source_s']+r['offsets'][role]
            vf=f'setpts=PTS-STARTPTS,fps={fps},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x101829,setsar=1,format=yuv420p'
            ff(['-v','error','-ss',f'{start:.9f}','-i',p[role]['path'],'-an','-vf',vf,'-frames:v',str(r['frames']),'-r',fps,'-c:v','libx264','-preset','fast','-crf','16','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',dest],work/f'logs/cut_{name}_{r["id"]:03d}.log')
            files.append(dest);print(f'cut {name} {r["id"]+1}/{len(timeline["segments"])}',flush=True)
        listing=parts/f'{name}.ffconcat';listing.write_text('ffconcat version 1.0\n'+''.join("file '"+str(f.resolve()).replace("'","'\\''")+"'\n" for f in files))
        ff(['-v','error','-f','concat','-safe','0','-i',listing,'-c','copy',work/f'{name}.mp4'],work/f'logs/concat_{name}.log')
    master=master_role(p,s);source=p[master]['path'];index=stream_index(p[master]);graph=[];labels=[];n=len(timeline['segments'])
    graph.append(f'[0:{index}]asplit='+str(n)+''.join(f'[a{i}]' for i in range(n)))
    for i,r in enumerate(timeline['segments']):
        samples=round((r['output_e']-r['output_s'])*48000)
        graph.append(f'[a{i}]asetpts=PTS-STARTPTS,atrim=start={r["source_s"]:.9f}:end={r["source_e"]:.9f},asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=end_sample={samples}[b{i}]');labels.append(f'[b{i}]')
    total=round(timeline['duration_s']*48000)
    graph.append(''.join(labels)+f'concat=n={n}:v=0:a=1,apad,atrim=end_sample={total}[a]')
    ff(['-v','error','-i',source,'-filter_complex',';'.join(graph),'-map','[a]','-c:a','pcm_s24le','-ar','48000',work/'master.wav'],work/'logs/cut_master.log')
    write(meta,{'status':'complete','signature':signature,'source_audio_stream_index':index,'master_wav_audio_stream_index':0,
                'timeline_sha256':file_hash(work/'timeline.json'),
                'outputs':{f:{'size':(work/f).stat().st_size,'mtime_ns':(work/f).stat().st_mtime_ns} for f in outputs}})
    return timeline
