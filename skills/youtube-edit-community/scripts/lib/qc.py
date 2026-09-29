"""Measured technical checks; perceptual reviews are explicitly not_run."""
import hashlib,json,re,time
from fractions import Fraction
from .settings import read,write,run,ff
from .probe import inspect
from .captions import validate_captions
from .caption_check import check_captions
from .overlays import validate_render_inputs

def qc(work,s):
    start=time.monotonic();dest=work/'qc';dest.mkdir(exist_ok=True);video=work/'final.mp4';tl=read(work/'timeline.json');caps=read(work/'captions.json');scenes=read(work/'scenes.json');checks={};measure={}
    def check(name,ok,**info):checks[name]={'status':'PASS' if ok else 'FAIL',**info}
    info=inspect(video);v=info['video'];a=info['audio'];measure.update(info)
    check('streams',bool(v and a))
    if v and a:
        vd=v['duration_s'];ad=a['duration_s'];measure.update(video_duration_s=vd,audio_duration_s=ad,av_difference_s=abs(vd-ad),fps=float(Fraction(v['fps'])))
        check('duration',abs(vd-tl['duration_s'])<=.1,expected_s=tl['duration_s'],measured_s=vd,tolerance_s=.1)
        check('av_duration',abs(vd-ad)<.01,difference_s=abs(vd-ad),limit_s=.01)
        check('resolution',v['width']==s['output']['width'] and v['height']==s['output']['height'])
        check('fps',abs(float(Fraction(v['fps']))-float(Fraction(tl['fps'])))<.0001)
        check('audio_format',a['sample_rate']==48000 and a['channels']==2,channels=a['channels'],sample_rate=a['sample_rate'],measured_bitrate=a['bit_rate'],requested_bitrate=320000)
        check('codecs',v['codec']=='h264' and v['pix_fmt']=='yuv420p' and a['codec']=='aac')
    try:
        _,err=ff(['-v','info','-xerror','-i',video,'-vf','blackdetect=d=0.02:pix_th=0.05:pic_th=0.98','-af','ebur128=peak=true','-f','null','-'],dest/'decode-audio-black.log')
        check('full_decode',True)
        loud=re.findall(r'I:\s*(-?[\d.]+) LUFS',err);peaks=re.findall(r'Peak:\s*(-?[\d.]+) dBFS',err)
        lufs=float(loud[-1]) if loud else None;peak=float(peaks[-1]) if peaks else None
        measure.update(lufs=lufs,true_peak_dbfs=peak)
        check('loudness',lufs is not None and abs(lufs-s['audio']['lufs'])<=.5,target=s['audio']['lufs'],measured=lufs,tolerance_lu=.5)
        check('true_peak',peak is not None and peak<=s['audio']['true_peak']+.05,measured=peak,tolerance_db=.05)
        black=[{'start':float(a),'end':float(b),'duration_s':float(c)} for a,b,c in re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)',err)]
        check('black_frames',not black,intervals=black)
    except RuntimeError as e:
        check('full_decode',False,error=str(e))
        for name in ['loudness','true_peak','black_frames']:checks[name]={'status':'not_run','reason':'decode failed'}
    caption=check_captions(caps,tl,work.parent);checks['caption']=caption
    try:
        validate_render_inputs(work,s)
        check('render_input_consistency',True)
    except ValueError as error:
        check('render_input_consistency',False,error=str(error))
    errors=validate_captions(caps,tl,s);check('caption_layout_and_containment',not errors,count=len(caps),errors=errors)
    times={0,tl['duration_s']/2,max(0,tl['duration_s']-.2)}
    for r in scenes[1:]:times.update([max(0,r['start']-.2),min(tl['duration_s']-.05,r['start']+.2)])
    for r in tl['segments'][1:]:times.update([max(0,r['output_s']-.2),min(tl['duration_s']-.05,r['output_s']+.2)])
    frames=[]
    try:
        for i,t in enumerate(sorted(times)):
            file=dest/f'frame_{i:03d}_{t:.3f}.jpg'
            ff(['-v','error','-ss',f'{t:.6f}','-i',video,'-frames:v','1','-q:v','2',file],dest/f'frame_{i:03d}.log')
            if not file.is_file():raise RuntimeError('frame missing')
            frames.append({'time_s':t,'file':str(file.relative_to(work))})
        check('representative_frames',True,frames=frames)
    except RuntimeError as e:check('representative_frames',False,error=str(e))
    for name in ['listening','full_realtime_viewing','independent_lipsync','caption_wording_review']:
        checks[name]={'status':'not_run','reason':'人による原音・映像との照合が必要です'}
    h=hashlib.sha256()
    with video.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    measure['sha256']=h.hexdigest();measure['file']=str(video.resolve())
    required=['streams','duration','av_duration','resolution','fps','codecs','audio_format','full_decode','loudness','true_peak','black_frames','caption_layout_and_containment','caption','render_input_consistency','representative_frames']
    if any(r['view']=='image' for r in scenes):
        from .glass import validate_images
        try:
            rows=validate_images(work,s)
            check('image_assets',True,scenes=len(rows))
        except (ValueError,FileNotFoundError) as error:
            check('image_assets',False,error=str(error))
        checks['image_visual_review']={'status':'not_run','reason':'ガラス・配置・ズーム・向きは比較フレームを目視確認してください'}
        required.append('image_assets')
    result={'status':'PASS' if all(checks.get(k,{}).get('status')=='PASS' for k in required) else 'FAIL','scope':'technical checks; not_run reviews are not included in PASS','caption':caption,'checks':checks,'measurements':measure,'seconds':time.monotonic()-start}
    write(work/'qc.json',result);print('QC',result['status'],json.dumps({k:measure.get(k) for k in ['video_duration_s','av_difference_s','fps','lufs','true_peak_dbfs']},ensure_ascii=False),flush=True)
    return result
