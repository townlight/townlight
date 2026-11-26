# SPDX-License-Identifier: AGPL-3.0-only
import json, os, pathlib, socket, subprocess, time
import recorder_input as ri


def run_product(cfg, payload, clip, root, seconds=90):
    folder = pathlib.Path(root)
    folder.mkdir(parents=True, exist_ok=True)
    output = folder / 'attempt.ts'
    logpath = folder / 'attempt.log'
    payload = pathlib.Path(payload)
    child = sender = wlog = slog = start = None
    err = perr = None
    rows, cleanup = [], []
    ncpu = os.cpu_count() or 1
    try:
        sk = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sk.bind(('127.0.0.1', 0)); port = sk.getsockname()[1]
        finally:
            sk.close()
        wlog = open(logpath, 'w', buffering=1)
        slog = open(folder / 'sender.log', 'w', buffering=1)
        sender = ri.start_sender(payload / 'station' / 'bin' / 'ffmpeg.exe', clip, port, slog)
        child = subprocess.Popen(
            [cfg.media_python, '-B',
             str(payload / 'python' / 'Lib' / 'site-packages' / 'townlight_station' / 'media_job.py'),
             cfg.media_source, str(folder), str(output),
             json.dumps(cfg.encoding_profile()),
             json.dumps({'id': 'diagnostic', 'label': 'Synthetic diagnostic',
                         'kind': 'udp-mpegts', 'address': '127.0.0.1', 'port': port})],
            env=cfg.worker_environment(), stdin=subprocess.DEVNULL,
            stdout=wlog, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        pw = ps = None; last = start = time.monotonic()
        while True:
            if sender.poll() is not None:
                err = 'sender_exited'; break
            if child.poll() is not None:
                break
            now = time.monotonic(); el = now - start
            w = ri.cpu_seconds(child); sc = ri.cpu_seconds(sender)
            row = {'elapsed': round(el, 3),
                   'bytes_written': output.stat().st_size if output.exists() else 0,
                   'worker_cpu_seconds': w, 'sender_cpu_seconds': sc}
            if pw is not None and ps is not None and w is not None and sc is not None and now > last:
                dt = now - last
                wpct = (w - pw) / dt * 100.0 / ncpu
                spct = (sc - ps) / dt * 100.0 / ncpu
                row['worker_cpu_pct'] = round(wpct, 3)
                row['sender_cpu_pct'] = round(spct, 3)
                row['worker_cpu_pct_one_core'] = round(wpct * ncpu, 3)
                row['sender_cpu_pct_one_core'] = round(spct * ncpu, 3)
            rows.append(row); pw, ps, last = w, sc, now
            if el >= seconds:
                output.with_suffix('.stop').touch()
                try: child.wait(timeout=15)
                except subprocess.TimeoutExpired: pass
                break
            time.sleep(1)
    except Exception as exc:
        err = type(exc).__name__
    finally:
        try:
            if child is not None and child.poll() is None:
                output.with_suffix('.stop').touch()
                try: child.wait(timeout=15)
                except subprocess.TimeoutExpired: pass
        except Exception as exc:
            cleanup.append(type(exc).__name__)
        for p in (child, sender):
            try: ri.stop(p)
            except Exception as exc: cleanup.append(type(exc).__name__)
        for f in (wlog, slog):
            if f is not None:
                try: f.close()
                except Exception as exc: cleanup.append(type(exc).__name__)
    text = ''
    try: text = logpath.read_text(encoding='utf-8', errors='replace')
    except Exception: pass
    probe = None
    if output.exists():
        try: probe = ri.probe(cfg.ffprobe, output)
        except Exception as exc: perr = type(exc).__name__
    return {
        'worker_pid': child.pid if child else None,
        'sender_pid': sender.pid if sender else None,
        'worker_returncode': child.poll() if child else None,
        'sender_returncode': sender.poll() if sender else None,
        'elapsed': round(time.monotonic() - start, 3) if start else 0,
        'rows': rows,
        'cleanup_errors': cleanup,
        'owned_children_terminal': (child is None or child.poll() is not None)
                                   and (sender is None or sender.poll() is not None),
        'probe': probe,
        'size_bytes': output.stat().st_size if output.exists() else 0,
        'log_flags': {'video_lag': 'video stream lagging audio' in text,
                      'clean_teardown': "'teardown_clean': True" in text,
                      'no_error': "'error': None" in text},
        'error_type': err,
        'probe_error_type': perr,
    }
