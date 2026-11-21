import contextlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

payload, adapter, out = (Path(arg).resolve() for arg in sys.argv[1:4])
out.mkdir(parents=True, exist_ok=False)
runtime = payload / 'media-runtime'
ffmpeg = payload / 'bin' / 'ffmpeg.exe'
ffprobe = payload / 'bin' / 'ffprobe.exe'
env = {key: os.environ[key] for key in ('SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','PROCESSOR_ARCHITECTURE') if key in os.environ}
for key in ('TEMP','TMP','APPDATA','LOCALAPPDATA','PROGRAMDATA','XDG_DATA_HOME','XDG_STATE_HOME'):
    (out / key).mkdir()
    env[key] = str(out / key)
env.update(PYTHONDONTWRITEBYTECODE='1', CIVICCAST_GSTREAMER_RUNTIME_ROOT=str(runtime),
           GST_REGISTRY=str(out/'gst-registry.bin'), GST_DEBUG='2')
with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as port_socket:
    port_socket.bind(('127.0.0.1',0))
    port = port_socket.getsockname()[1]
fixture = out.parent / 'synthetic-station-probe.ts'
if not fixture.exists():
    subprocess.run([str(ffmpeg), '-hide_banner','-loglevel','error','-f','lavfi',
       '-i','testsrc2=size=960x540:rate=30,noise=alls=20:allf=t+u',
       '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','18','-c:v','libopenh264','-g','30',
       '-b:v','6500k','-pix_fmt','yuv420p','-c:a','aac','-f','mpegts',str(fixture)],
       timeout=40,check=True, creationflags=subprocess.CREATE_NO_WINDOW)
ts = out / 'captured.ts'
width, height = map(int, sys.argv[4:6])
profile = dict(width=width,height=height,fps=30,bitrate_kbps=6000)
live = dict(kind='udp-mpegts',address='127.0.0.1',port=port)
with (out/'sender.log').open('wb') as sendlog, (out/'receiver.log').open('wb') as recvlog, contextlib.ExitStack() as stack:
    def own(args, log):
        child=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,env=env,creationflags=subprocess.CREATE_NO_WINDOW)
        def clean():
            if child.poll() is None:
                child.kill()
                child.wait(timeout=10)
        stack.callback(clean)
        return child
    sender=own([str(ffmpeg),'-hide_banner','-loglevel','warning','-re','-stream_loop','-1','-i',str(fixture),
        '-c','copy','-f','mpegts',f'udp://127.0.0.1:{port}?pkt_size=1316'],sendlog)
    receiver=own([str(runtime/'python.exe'),'-B',str(adapter),str(payload/'media-source'),str(out),str(ts),
                  json.dumps(profile),json.dumps(live)],recvlog)
    samples=[]
    for _ in range(23):
        time.sleep(3)
        samples.append(ts.stat().st_size if ts.exists() else 0)
        if receiver.poll() is not None or sender.poll() is not None:
            break
    ts.with_suffix('.stop').write_text('operator-stop',encoding='ascii')
    code = receiver.wait(timeout=20)
    if code != 0:
        print((out/'receiver.log').read_text(errors='replace').splitlines()[-8:])
        raise SystemExit(code)
info=json.loads(subprocess.check_output([str(ffprobe),'-v','error','-show_entries',
    'stream=codec_name,codec_type:format=duration,bit_rate,size:stream=avg_frame_rate','-of','json',str(ts)], timeout=20))
print(json.dumps({'samples':samples,'media':info},indent=2))
(out/'probe.json').write_text(json.dumps({'samples':samples,'media':info},indent=2),encoding='utf-8')

