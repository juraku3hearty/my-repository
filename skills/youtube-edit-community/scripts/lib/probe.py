from pathlib import Path
import json
import math
from .settings import run, write, read
from .audio import ROLES, measure_stream, master_role


def inspect(path):
    stdout, _ = run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])
    raw = json.loads(stdout)
    video = next((x for x in raw['streams'] if x['codec_type'] == 'video'), None)
    duration = float(raw['format']['duration'])
    audios = [{'index': x['index'], 'sample_rate': int(x.get('sample_rate', 0)),
               'channels': x.get('channels', 0), 'bit_rate': int(x.get('bit_rate', 0)),
               'duration_s': float(x.get('duration', duration)), 'codec': x.get('codec_name')}
              for x in raw['streams'] if x['codec_type'] == 'audio']
    # inspect remains a cheap metadata-only helper for output QC.
    return {'path': str(Path(path).expanduser().resolve()), 'duration_s': duration,
            'video': ({'width': video['width'], 'height': video['height'],
                       'fps': video['avg_frame_rate'] if video.get('avg_frame_rate') != '0/0' else video['r_frame_rate'],
                       'duration_s': float(video.get('duration', duration)), 'codec': video['codec_name'],
                       'pix_fmt': video.get('pix_fmt')} if video else None),
            'audio': audios[0] if audios else None, 'audio_streams': audios}


def analyze(path):
    item = inspect(path)
    item['audio_stream_index'] = None
    item['audio'] = None
    for stream in item['audio_streams']:
        if stream['channels'] not in (1, 2):
            stream['excluded_reason'] = '1〜2ch以外の音声ストリーム'
            continue
        try:
            stream['metrics'] = measure_stream(path, stream['index'], stream['duration_s'])
        except (ValueError, RuntimeError) as error:
            stream['excluded_reason'] = 'デコード不可: ' + str(error)
            continue
        if not stream['metrics']['has_voice']:
            stream['excluded_reason'] = '有音が0.5秒未満'
        elif item['audio_stream_index'] is None:
            item['audio_stream_index'] = stream['index']
            item['audio'] = dict(stream)
    stat = Path(path).expanduser().stat()
    item['source_stat'] = {'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns}
    return item


def choose_master(data, settings):
    excluded = settings['audio'].get('exclude_master', [])
    candidates = {r: data[r]['audio']['metrics'] for r in ROLES
                  if r in data and data[r].get('audio_stream_index') is not None and r not in excluded}
    choice = {'role': None, 'ambiguous': False, 'excluded_roles': excluded, 'candidates': candidates}
    requested = settings['audio']['master']
    if requested != 'auto':
        if requested not in candidates:
            raise ValueError(f'{requested}: 指定音声は除外済み、または使用できる1〜2ch音声がありません')
        choice.update(role=requested, reason=f'利用者の明示指定: {requested}', method='explicit')
        return choice
    if not candidates:
        choice.update(reason='使用できる有音の1〜2ch音声がありません', method='unavailable')
        return choice
    if len(candidates) == 1:
        role = next(iter(candidates))
        choice.update(role=role, reason=f'有音の1〜2ch音声候補が1本: {role}', method='single')
        return choice
    # A usable separate recording is the user's default preference. A quieter
    # noise floor alone (e.g. noise-gated screen audio) cannot overrule it.
    def score(role):
        m = candidates[role]
        return m['rms_dbfs'] - m['noise_floor_dbfs'] + 10 * math.log10(max(m['high_frequency_ratio'], 1e-6))
    ordered = sorted(candidates, key=score, reverse=True)
    role = 'mic' if 'mic' in candidates else ordered[0]
    if role == 'mic':
        mic = candidates['mic']
        for other in ordered:
            if other == 'mic':
                continue
            m = candidates[other]
            # Override the preference only with a clear improvement in both
            # noise and high-frequency retention, without losing level/activity.
            if (m['noise_floor_dbfs'] <= mic['noise_floor_dbfs'] - 6
                    and m['high_frequency_ratio'] >= max(mic['high_frequency_ratio'] * 1.5, 1e-6)
                    and m['rms_dbfs'] >= mic['rms_dbfs'] - 3
                    and m['active_ratio'] >= mic['active_ratio'] * .8):
                role = other
                break
    comparisons = []
    for other in candidates:
        if other == role:
            continue
        a, b = candidates[role], candidates[other]
        noise = abs(a['noise_floor_dbfs'] - b['noise_floor_dbfs'])
        high = abs(a['high_frequency_ratio'] - b['high_frequency_ratio']) / max(a['high_frequency_ratio'], b['high_frequency_ratio'], 1e-12)
        comparisons.append({'other': other, 'noise_floor_difference_db': noise, 'high_ratio_relative_difference': high})
    choice['comparisons'] = comparisons
    if any(c['noise_floor_difference_db'] < 3 and c['high_ratio_relative_difference'] < .2 for c in comparisons):
        choice.update(ambiguous=True, reason='ノイズ床差<3dBかつ高域比の相対差<20%の候補があります。利用者の選択が必要です', method='ambiguous')
        return choice
    m = candidates[role]
    preference = '別録りを優先' if role == 'mic' else '有音・音量・ノイズ床・高域比から選択'
    choice.update(role=role, method='measured', reason=f'{role}: {preference}（有音率{m["active_ratio"]:.1%}、RMS {m["rms_dbfs"]:.1f}dBFS、ノイズ床 {m["noise_floor_dbfs"]:.1f}dBFS、高域比{m["high_frequency_ratio"]:.2%}）')
    return choice


def probe(work, inputs, s, force=False):
    old = read(work / 'probe.json') if (work / 'probe.json').exists() else {}
    paths = {role: path for role, path in inputs.items() if path}
    if not paths:
        paths = {role: old[role]['path'] for role in ROLES if role in old}
    if not paths:
        raise ValueError('素材を --camera / --screen / --mic で指定してください')
    data = {}
    for role, path in paths.items():
        path = Path(path).expanduser().resolve()
        stat = path.stat()
        cached = old.get(role, {})
        if not force and cached.get('path') == str(path) and 'audio_stream_index' in cached and cached.get('source_stat') == {'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns}:
            data[role] = cached
        else:
            data[role] = analyze(path)
    warnings = []
    for role, item in data.items():
        if item['audio'] is None:
            warnings.append(f'{role}: 使用できる音声なし。自動同期不可')
        if item['video'] and item['video']['height'] > item['video']['width']:
            warnings.append(f'{role}: 縦素材。余白付きで表示')
    if len({d['video']['fps'] for d in data.values() if d['video']}) > 1:
        warnings.append('fps不一致: 出力fpsへ変換')
    data['master_choice'] = choose_master(data, s)
    data['_warnings'] = warnings
    write(work / 'probe.json', data)
    for warning in warnings:
        print('WARN:', warning, flush=True)
    print('主音声:', data['master_choice']['reason'], flush=True)
    master_role(data, s)  # Save the ambiguous evidence before stopping the CLI.
    return data
