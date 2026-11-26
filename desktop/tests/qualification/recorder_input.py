# SPDX-License-Identifier: AGPL-3.0-only

import ctypes
import hashlib
import json
import socket
import subprocess
import time
from ctypes import wintypes
from pathlib import Path

CREATE_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)


def stop(proc):
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


class _FT(ctypes.Structure):
    _fields_ = [('dwLowDateTime', wintypes.DWORD), ('dwHighDateTime', wintypes.DWORD)]


def _ft(v):
    return (v.dwHighDateTime << 32) | v.dwLowDateTime


def cpu_seconds(proc):
    if proc is None or proc.poll() is not None:
        return None
    try:
        k = ctypes.WinDLL('kernel32', use_last_error=True)
        fn = k.GetProcessTimes
        fn.argtypes = [ctypes.c_void_p, ctypes.POINTER(_FT), ctypes.POINTER(_FT), ctypes.POINTER(_FT), ctypes.POINTER(_FT)]
        fn.restype = wintypes.BOOL
        c, e, kt, ut = _FT(), _FT(), _FT(), _FT()
        h = ctypes.c_void_p(int(proc._handle))
        if not fn(h, ctypes.byref(c), ctypes.byref(e), ctypes.byref(kt), ctypes.byref(ut)):
            return None
        return (_ft(kt) + _ft(ut)) / 1e7
    except Exception:
        return None


def start_sender(ffmpeg, clip, port, log):
    args = [str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-re', '-stream_loop', '-1', '-i', str(clip), '-c', 'copy', '-f', 'mpegts', f'udp://127.0.0.1:{port}?pkt_size=1316']
    return subprocess.Popen(args, stderr=log, stdout=subprocess.DEVNULL, stdin=subprocess.DEVNULL, creationflags=CREATE_NO_WINDOW)


def generate(ffmpeg, root):
    root = Path(root)
    out = root / 'chamber.ts'
    with open(root / 'generate.log', 'wb') as err:
        subprocess.run([str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=30,noise=alls=10:allf=t+u', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '18', '-c:v', 'libopenh264', '-g', '30', '-b:v', '6500k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', str(out)], timeout=180, check=True, stdout=subprocess.DEVNULL, stderr=err)
    return out


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def probe(ffprobe, file):
    r = subprocess.run([str(ffprobe), '-v', 'error', '-show_streams', '-show_packets', '-show_format', '-show_entries', 'packet=stream_index,pts_time,dts_time,duration_time:stream=index,codec_type,width,height,r_frame_rate:format=duration,size', '-of', 'json', str(file)], capture_output=True, text=True, timeout=30, check=True)
    d = json.loads(r.stdout)
    pk = d.get('packets', [])
    out = {}
    for s in d.get('streams', []):
        idx = s.get('index')
        pts = []
        dts = []
        n = 0
        for p in pk:
            if p.get('stream_index') == idx:
                n += 1
                a = _f(p.get('pts_time'))
                b = _f(p.get('dts_time'))
                if a is not None:
                    pts.append(a)
                if b is not None:
                    dts.append(b)
        gaps = [dts[i + 1] - dts[i] for i in range(len(dts) - 1) if dts[i + 1] >= dts[i]]
        out[str(idx)] = {
            'codec': s.get('codec_type'), 'index': idx, 'width': s.get('width'), 'height': s.get('height'), 'r_frame_rate': s.get('r_frame_rate'), 'packet_count': n,
            'first_pts': pts[0] if pts else None, 'last_pts': pts[-1] if pts else None, 'pts_span': (pts[-1] - pts[0]) if len(pts) >= 2 else None,
            'backward_dts_count': sum(1 for i in range(len(dts) - 1) if dts[i + 1] < dts[i]), 'max_dts_gap': max(gaps) if gaps else None,
        }
    fmt = d.get('format', {})
    return {'streams': out, 'duration': _f(fmt.get('duration')), 'size': fmt.get('size')}


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def capture(ffmpeg, ffprobe, clip, root, seconds=90):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(('127.0.0.1', 0))
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
    rbuf = sock.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
    sock.settimeout(0.5)
    port = sock.getsockname()[1]
    log = open(root / 'sender.log', 'wb')
    sender = None
    first = None
    last = None
    per = []
    t0 = time.monotonic()
    try:
        sender = start_sender(ffmpeg, clip, port, log)
        with open(root / 'incoming.ts', 'wb') as out:
            deadline = t0 + seconds
            while time.monotonic() < deadline:
                try:
                    data, _ = sock.recvfrom(65535)
                except socket.timeout:
                    if sender.poll() is not None:
                        raise RuntimeError('sender exited')
                    continue
                now = time.monotonic()
                if first is None:
                    first = now
                last = now
                out.write(data)
                sec = int(now - t0)
                if not per or per[-1]['second'] != sec:
                    per.append({'second': sec, 'bytes': 0, 'datagrams': 0})
                per[-1]['bytes'] += len(data)
                per[-1]['datagrams'] += 1
        if sender.poll() is not None:
            raise RuntimeError('sender exited')
    finally:
        stop(sender)
        log.close()
        sock.close()
    return {'observations': per, 'sender_returncode': sender.returncode if sender else None, 'input_sha256': _sha256(clip), 'recv_buf': rbuf, 'first_arrival': first, 'last_arrival': last, 'probe': probe(ffprobe, root / 'incoming.ts')}
