"""One final ffmpeg invocation: scene composition, sparse PNGs and audio mux."""
from fractions import Fraction
import json,re
from PIL import Image,ImageDraw
from .settings import read,write,ff
from .overlays import validate_scenes,validate_render_inputs
from .captions import validate_captions
from .audio import master_role,stream_index

PRE_AUDIO='aformat=sample_rates=48000:channel_layouts=stereo,acompressor=threshold=0.04:ratio=4:attack=1:release=100'

def validate_master_audio(work,s):
    p=read(work/'probe.json');role=master_role(p,s)
    meta=read(work/'cut.meta.json') if (work/'cut.meta.json').exists() else {}
    source=meta.get('signature',{}).get('materials',{}).get(role,{})
    if meta.get('status')!='complete' or meta.get('signature',{}).get('master')!=role or source.get('path')!=p[role]['path'] or source.get('audio_stream_index')!=stream_index(p[role]):
        raise ValueError('主音声とmaster.wavの由来が一致しません。syncとcutを再実行してください')
    path=work/'master.wav'
    if not path.exists() or meta.get('outputs',{}).get('master.wav')!={'size':path.stat().st_size,'mtime_ns':path.stat().st_mtime_ns}:
        raise ValueError('master.wavが変更されています。cutを再実行してください')

def measure_audio(work,s):
    validate_master_audio(work,s)
    audio=s['audio']
    _,err=ff(['-v','info','-i',work/'master.wav','-map','0:0','-af',f'{PRE_AUDIO},loudnorm=I={audio["lufs"]}:TP={audio["true_peak"]-.2}:LRA=11:print_format=json','-f','null','-'],work/'logs/audio_measure.log')
    matches=re.findall(r'\{[^{}]*"input_i"[^{}]*\}',err,re.S)
    if not matches:raise ValueError('loudnorm measurement failed')
    data=json.loads(matches[-1]);write(work/'loudness.json',{'settings':audio,'prefilter':PRE_AUDIO,'measurement':data})
    return data

def srt_time(seconds):
    n=round(seconds*1000);h,n=divmod(n,3600000);m,n=divmod(n,60000);sec,ms=divmod(n,1000)
    return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'

def finalize(work,s):
    validate_master_audio(work,s)
    validate_render_inputs(work,s)
    tl=read(work/'timeline.json');scenes=read(work/'scenes.json');caps=read(work/'captions.json');overlays=read(work/'overlays.json');p=read(work/'probe.json')
    validate_scenes(scenes,tl,s,p);errors=validate_captions(caps,tl,s)
    if errors:raise ValueError('\n'.join(errors[:20]))
    image_rows=[]
    if any(r['view']=='image' for r in scenes):
        from .glass import validate_images,background_scenes,compose_images
        image_rows=validate_images(work,s)
        scenes=background_scenes(scenes,image_rows)
    d=tl['duration_s'];fps=tl['fps'];w=s['output']['width'];h=s['output']['height'];sx=w/1920;sy=h/1080
    listing=work/'overlays.ffconcat';lines=['ffconcat version 1.0']
    for item in overlays:
        file=(work/item['file']).resolve()
        lines.extend(["file '"+str(file).replace("'","'\\''")+"'",'option framerate '+fps,f'duration {item["t_end"]-item["t_start"]:.9f}'])
    lines.extend(["file '"+str((work/overlays[-1]['file']).resolve()).replace("'","'\\''")+"'",'option framerate '+fps]);listing.write_text('\n'.join(lines)+'\n')
    args=['-v','warning'];idx={}
    for key,file in [('talk',work/'talk.mp4'),('screen',work/'screen.mp4'),('audio',work/'master.wav')]:
        if (key=='talk' and 'camera' not in p) or (key=='screen' and 'screen' not in p):continue
        idx[key]=len(idx);args+=['-i',file]
    idx['overlays']=len(idx);args+=['-f','concat','-safe','0','-i',listing]
    face_scenes=[r for r in scenes if r.get('face')];g=[]
    if 'talk' in idx:
        if face_scenes:g.append(f'[{idx["talk"]}:v]setpts=PTS-STARTPTS,split=2[talk][face_src]')
        else:g.append(f'[{idx["talk"]}:v]setpts=PTS-STARTPTS[talk]')
        base='talk'
    else:
        g.append(f'color=c=0x101829:s={w}x{h}:r={fps}:d={d}[blank]');base='blank'
    screen_scenes=[r for r in scenes if r['view']=='screen']
    if screen_scenes:
        left=round(44*sx);top=round((max(170,s['heading']['top_px']+s['heading']['px']*1.4+48) if 'camera' not in p and s['heading']['enabled'] else 70)*sy);bottom=round(195*sy);iw=w-2*left;ih=h-top-bottom
        iw-=iw%2;ih-=ih%2
        g.append(f'[{idx["screen"]}:v]setpts=PTS-STARTPTS,scale={iw}:{ih}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:{top}:color=0x101829,setsar=1[screen_bg]')
        enabled='+'.join(f'gte(t,{r["start"]:.9f})*lt(t,{r["end"]:.9f})' for r in screen_scenes)
        g.append(f'[{base}][screen_bg]overlay=0:0:enable=\'{enabled}\':eof_action=pass[scene_base]');base='scene_base'
    if face_scenes:
        face=s['face'];size=round((face['small_px'] if s['pip']['size']=='small' else face['diameter_px'])*sx);size-=size%2
        # Crop from the normalized talk stream; a scale > 1 zooms in.
        crop=min(w,h)/face['crop_scale'];crop=min(crop,w,h);crop=int(crop)//2*2
        cx,cy=face['crop_center'];x=max(0,min(w-crop,round(cx*w-crop/2)));y=max(0,min(h-crop,round(cy*h-crop/2)))
        mask=Image.new('L',(size,size));ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255);mask.save(work/'circle-mask.png')
        idx['mask']=len(idx);args+=['-loop','1','-framerate',fps,'-i',work/'circle-mask.png']
        g.append(f'[face_src]crop={crop}:{crop}:{x}:{y},scale={size}:{size},format=rgba[face_crop]')
        g.append(f'[face_crop][{idx["mask"]}:v]alphamerge,split={len(face_scenes)}'+''.join(f'[face{i}]' for i in range(len(face_scenes))))
        px=round(face['margin_x_px']*sx) if s['pip']['position']=='left' else w-round(face['margin_x_px']*sx)-size
        py=h-round(face['bottom_px']*sy)-size
        for i,r in enumerate(face_scenes):
            fade=min(.25,(r['end']-r['start'])/2)
            g.append(f'[face{i}]fade=t=in:st={r["start"]:.9f}:d={fade}:alpha=1,fade=t=out:st={r["end"]-fade:.9f}:d={fade}:alpha=1[faded{i}]')
            dest=f'withface{i}';g.append(f'[{base}][faded{i}]overlay={px}:{py}:enable=\'gte(t,{r["start"]:.9f})*lt(t,{r["end"]:.9f})\':eof_action=pass[{dest}]');base=dest
    if image_rows:base=compose_images(work,s,image_rows,args,idx,g,base)
    # Concatenation holds each sparse PNG for its manifest duration. The enable
    # expression limits the PNG stream to its interval coverage, without N inputs.
    g.append(f'[{idx["overlays"]}:v]setpts=PTS-STARTPTS,format=rgba[overlay_png]')
    g.append(f'[{base}][overlay_png]overlay=0:0:enable=\'between(t,0,{d:.9f})\':eof_action=repeat,format=yuv420p[v]')
    audio=s['audio'];samples=round(d*48000)
    measured=read(work/'loudness.json')
    if measured['settings']!=audio:raise ValueError('音声設定が変わりました。renderを再実行してください')
    m=measured['measurement']
    measured_args=f':measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}:linear=true'
    # master.wav contains only the stream chosen by probe and extracted by cut.
    g.append(f'[{idx["audio"]}:0]asetpts=PTS-STARTPTS,{PRE_AUDIO},loudnorm=I={audio["lufs"]}:TP={audio["true_peak"]-.2}:LRA=11{measured_args},aresample=48000,apad,atrim=end_sample={samples}[a]')
    graph=work/'finalize.ffgraph';graph.write_text(';\n'.join(g))
    args+=['-filter_complex_threads','2','-filter_complex_script',graph,'-map','[v]','-map','[a]','-t',f'{d:.9f}','-r',fps,'-c:v','h264_videotoolbox','-b:v',s['output'].get('video_bitrate','8M'),'-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-movflags','+faststart',work/'final.mp4']
    ff(args,work/'logs/finalize.log')
    (work/'final.srt').write_text('\n\n'.join(f'{i+1}\n{srt_time(c["start"])} --> {srt_time(c["end"])}\n{c["text"]}' for i,c in enumerate(caps))+'\n',encoding='utf-8')
    return work/'final.mp4'
