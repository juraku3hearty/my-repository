"""Other timestamp = master timestamp + offset; no hard-coded source offsets."""
import numpy as np
from scipy import signal
from scipy.io import wavfile
from .settings import read,write,ff
from .audio import master_role,stream_index

def waveform(work,role,source,index):
    target=work/f'sync_{role}.wav'
    ff(['-v','error','-i',source,'-map',f'0:{index}','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',target],work/f'logs/sync_{role}.log')
    rate,a=wavfile.read(target)
    return signal.resample_poly(a.astype(np.float32)/32768,1,4)

def correlate(master,other):
    rate=4000;length=len(master)/rate
    if min(len(master),len(other))/rate<4: raise ValueError('同期には4秒以上の共通音声が必要です')
    window=min(20,max(2,min(length,len(other)/rate)/3))
    count=5 if length>=120 else 3
    points=np.linspace(min(45,max(0,(length-window)*.05)),max(0,length-window-min(45,(length-window)*.05)),count)
    filt=signal.butter(3,[200,1700],btype='bandpass',fs=rate,output='sos');rows=[]
    for t in points:
        low=max(0,t-65);high=min(len(other)/rate,t+window+65)
        a=master[int(t*rate):int((t+window)*rate)];b=other[int(low*rate):int(high*rate)]
        if len(b)<len(a): continue
        aa=signal.sosfilt(filt,a);bb=signal.sosfilt(filt,b)
        c=signal.correlate(bb,aa,mode='valid',method='fft')
        energy=np.sqrt(np.maximum(signal.convolve(bb*bb,np.ones(len(aa)),mode='valid',method='fft'),1e-12)*max(float(np.sum(aa*aa)),1e-12))
        n=c/energy;i=int(np.argmax(abs(n)));offset=low+i/rate-t
        rows.append({'master_time_s':float(t),'other_time_s':float(t+offset),'offset_s':float(offset),'correlation':float(n[i]),'window_s':window})
    good=[r for r in rows if abs(r['correlation'])>=.3]
    offset=float(np.median([r['offset_s'] for r in good or rows]))
    drift=float(np.ptp([r['offset_s'] for r in good])) if len(good)>1 else None
    warnings=[]
    if len(good)<len(rows): warnings.append('相関<0.3: 要手動確認')
    if drift is not None and drift>.05: warnings.append('ドリフト>0.05s: 要手動確認')
    return {'offset_s':offset,'correlations':rows,'drift_s':drift,'warnings':warnings,'status':'review_required' if warnings else 'PASS'}

def sync(work,s):
    p=read(work/'probe.json');role=master_role(p,s);master=waveform(work,role,p[role]['path'],stream_index(p[role]))
    result={'master':role,'audio_stream_indices':{r:p[r]['audio_stream_index'] for r in ('mic','camera','screen') if r in p},'sample_rate':4000,'offset_definition':'other_time = master_time + offset','materials':{}}
    for name in ('camera','screen'):
        if name not in p: continue
        if name==role: item={'offset_s':0.0,'correlations':[],'drift_s':0.0,'status':'master','warnings':[]}
        elif not p[name]['audio']: item={'offset_s':None,'correlations':[],'drift_s':None,'status':'manual_required','warnings':['音声なし: sync.jsonへ手動オフセットを設定']}
        else: item=correlate(master,waveform(work,name,p[name]['path'],stream_index(p[name])))
        result['materials'][name]=item;result[f'{name}_minus_master_s']=item['offset_s']
        print(name,item['offset_s'],item['status'],item['warnings'],flush=True)
    write(work/'sync.json',result);return result
