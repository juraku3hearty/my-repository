"""Explicit audio streams and reproducible, local signal measurements."""
import subprocess
import numpy as np

ROLES = ('mic', 'camera', 'screen')


def pcm(path, index, start=0, duration=None, rate=48000):
    args = ['ffmpeg', '-v', 'error', '-nostdin', '-ss', str(start), '-i', str(path),
            '-map', f'0:{int(index)}', '-vn', '-ac', '1', '-ar', str(rate)]
    if duration is not None:
        args += ['-t', str(duration)]
    result = subprocess.run(args + ['-f', 'f32le', '-'], capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.decode(errors='replace')[-1000:])
    data = np.frombuffer(result.stdout, dtype='<f4')
    if not len(data) or not np.isfinite(data).all():
        raise ValueError('音声をデコードできません')
    return data


def rms_frames(data, rate, frame_s=.05):
    size = round(rate * frame_s)
    count = len(data) // size
    if not count:
        return np.array([], dtype=float)
    power = np.mean(data[:count * size].reshape(-1, size).astype(float) ** 2, axis=1)
    return 10 * np.log10(np.maximum(power, 1e-12))


def measure_stream(path, index, duration):
    # The same three windows and sample rate make candidate comparisons auditable.
    length = min(20., duration)
    starts = sorted(set(round(max(0., duration - length) * f, 6) for f in (0.1, .5, .9)))
    chunks = [pcm(path, index, start, length) for start in starts]
    data = np.concatenate(chunks)
    frames = rms_frames(data, 48000)
    # Quiet sampling windows must not hide a short spoken passage elsewhere.
    windows = [[t, t + length] for t in starts]
    if np.count_nonzero(frames > -40) * .05 < .5:
        data = pcm(path, index)
        frames = rms_frames(data, 48000)
        windows = [[0., len(data) / 48000]]
    size = 2048
    blocks = data[:len(data) // size * size].reshape(-1, size)
    if len(blocks):
        spectrum = np.abs(np.fft.rfft(blocks * np.hanning(size), axis=1)) ** 2
        freqs = np.fft.rfftfreq(size, 1 / 48000)
        high = float(spectrum[:, freqs >= 8000].sum() / max(float(spectrum.sum()), 1e-20))
    else:
        high = 0.
    active_s = float(np.count_nonzero(frames > -40) * .05)
    return {'sample_rate': 48000, 'sample_windows_s': windows,
            'active_ratio': float(np.mean(frames > -40)) if len(frames) else 0.,
            'active_s': active_s, 'has_voice': active_s >= .5,
            'rms_dbfs': float(10 * np.log10(max(float(np.mean(data.astype(float) ** 2)), 1e-12))),
            'noise_floor_dbfs': float(np.percentile(frames, 10)) if len(frames) else -120.,
            'high_frequency_ratio': high,
            'voice_measure': 'RMS > -40 dBFS for >= 0.5 s (activity proxy, not speech recognition)'}


def stream_index(item):
    value = item.get('audio_stream_index')
    if value is None:
        raise ValueError('使用できる1〜2ch音声がありません。probeを実行してください')
    return int(value)


def master_role(probe, settings):
    choice = probe.get('master_choice', {})
    if choice.get('ambiguous'):
        raise ValueError('主音声の差が小さいため選択を停止しました。利用者に確認し --master mic|camera|screen でprobeを実行してください')
    role = choice.get('role')
    if role not in ROLES or role not in probe:
        raise ValueError('主音声が未決定です。probeを実行してください')
    requested = settings['audio']['master']
    if requested != 'auto' and role != requested:
        raise ValueError('主音声の指定が変わりました。probeを実行してください')
    stream_index(probe[role])
    return role
