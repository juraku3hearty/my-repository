from pathlib import Path
from .settings import read,write
from .probe import probe
from .transcribe import transcribe
from .sync import sync
from .cutter import cut
from .captions import captions
from .caption_timing import import_reviewed
from .overlays import render
from .mux import finalize,measure_audio
from .qc import qc
from .audio import master_role

def execute(args,out,work,s):
    c=args.command
    if c in ('preview','full'):
        inputs={k:getattr(args,k) for k in ['camera','screen','mic']}
        old=read(work/'probe.json') if (work/'probe.json').exists() else None
        current=probe(work,inputs,s,args.force)
        transcribe(work,s,args.force,args.model)
        if args.force or old!=current or not (work/'sync.json').exists() or read(work/'sync.json')['master']!=master_role(current,s):sync(work,s)
        if c=='preview':
            if not args.range or not 30<=args.range[1]-args.range[0]<=45:raise ValueError('preview --range s e は30〜45秒を指定してください')
            keep=[{'s':args.range[0],'e':args.range[1],'note':'指定の試作範囲'}]
        else:
            keep=read(args.keep or work/'keep_segments.json')
        if not args.scenes and not (work/'scenes.json').exists():raise ValueError('--scenes が必要です。発話に沿った完成時刻のシーン表を作ってください')
        cut(work,s,keep,exact=c=='preview',reuse=c=='full',force=args.force)
        if not args.captions:captions(work,s)
    if args.scenes:write(work/'scenes.json',read(args.scenes))
    if args.captions:import_reviewed(work,args.captions)
    if c in ('render','preview','full'):
        measure_audio(work,s)
        render(work,s)
    if c in ('finalize','preview','full'):finalize(work,s)
    if c in ('qc','preview','full'):
        result=qc(work,s)
        if result['status']!='PASS':raise RuntimeError('QC FAIL: '+str(work/'qc.json'))
