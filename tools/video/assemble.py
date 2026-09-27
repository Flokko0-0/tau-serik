# Шаг 3. Сборка ролика: запись экрана + озвучка по меткам сцен + звуки тревоги -> out/tau-serik-demo.mp4 и .srt
# Запуск: python tools/video/assemble.py        (нужны out/raw.webm, out/voice/*.wav, out/durations.json, out/marks.json)
import json, os, re, subprocess, sys
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
sys.path.insert(0, HERE)
from tts import SCENES  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
ORDER = [sid for sid, _ in SCENES]
LEAD = 350  # голос начинается чуть позже смены сцены
data = json.load(open(os.path.join(OUT, 'marks.json')))
MARKS = data.get('marks', data)
DURS = json.load(open(os.path.join(OUT, 'durations.json')))
end = MARKS['end'] / 1000
fade_out = end - 0.9
VIDEO = os.path.join(OUT, 'tau-serik-demo.mp4')

for i, sid in enumerate(ORDER):
    nxt = MARKS[ORDER[i + 1]] if i + 1 < len(ORDER) else MARKS['end']
    if MARKS[sid] + LEAD + DURS[sid] * 1000 > nxt:
        print(f'Внимание: голос сцены {sid} длиннее сцены, перезапишите видео (шаг 2)')

args = [FF, '-hide_banner', '-y', '-i', os.path.join(OUT, 'raw.webm')]
for sid in ORDER:
    args += ['-i', os.path.join(OUT, 'voice', sid + '.wav')]
beeps = "0.22*sin(2*PI*1760*t)*(lt(mod(t,1),0.1)+gt(mod(t,1),0.16)*lt(mod(t,1),0.26)+gt(mod(t,1),0.32)*lt(mod(t,1),0.42))"
siren = "0.16*sin(2*PI*1035*t-415*1.2*cos(2*PI*t/1.2))"
args += ['-f', 'lavfi', '-i', f"aevalsrc='{beeps}':s=48000:d=3.6", '-f', 'lavfi', '-i', f"aevalsrc='{siren}':s=48000:d=4.2"]
parts, labels = [], []
for i, sid in enumerate(ORDER, start=1):
    d = MARKS[sid] + LEAD
    parts.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={d}|{d}[v{i}]")
    labels.append(f"[v{i}]")
n = len(ORDER)
b = MARKS['check'] + 150
s = MARKS['sosSent'] + 1600
parts.append(f"[{n + 1}:a]aformat=channel_layouts=stereo,adelay={b}|{b}[bp]")
parts.append(f"[{n + 2}:a]afade=t=in:d=0.3,afade=t=out:st=3.4:d=0.8,aformat=channel_layouts=stereo,adelay={s}|{s}[sr]")
labels += ['[bp]', '[sr]']
parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,afade=t=out:st={fade_out:.2f}:d=0.9,apad[aout]")
parts.append(f"[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st={fade_out:.2f}:d=0.9[vout]")
args += ['-filter_complex', ';'.join(parts), '-map', '[vout]', '-map', '[aout]', '-t', f'{end:.2f}',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high',
         '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', VIDEO]
r = subprocess.run(args, capture_output=True, text=True)
if r.returncode:
    sys.exit(r.stderr[-3000:])


def ts(ms):
    h, ms = divmod(int(ms), 3600000)
    m, ms = divmod(ms, 60000)
    sec, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{sec:02},{ms:03}'


# Субтитры: реплики сцены делятся по предложениям, время пропорционально длине
subs, k = [], 1
for sid, text in SCENES:
    pieces = [p.strip() for p in re.split(r'(?<=[.?!:])\s+', text) if p.strip()]
    start = MARKS[sid] + LEAD
    total = DURS[sid] * 1000
    chars = sum(len(p) for p in pieces)
    for p in pieces:
        dur = total * len(p) / chars
        subs.append(f'{k}\n{ts(start)} --> {ts(start + dur - 60)}\n{p}\n')
        k += 1
        start += dur
open(os.path.join(OUT, 'tau-serik-demo.srt'), 'w', encoding='utf-8').write('\n'.join(subs))
print('Готово:', VIDEO, round(os.path.getsize(VIDEO) / 1e6, 1), 'МБ, длительность', round(end, 1), 'с')
