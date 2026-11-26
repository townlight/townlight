# SPDX-License-Identifier: AGPL-3.0-only
import argparse, json, os, platform, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import recorder_input as ri
from recorder_product import run_product
def now(): return datetime.now(timezone.utc).isoformat()
def save(root, r):
    t = root/'receipt.json.tmp'; t.write_text(json.dumps(r), encoding='utf-8'); os.replace(t, root/'receipt.json')
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--payload', type=Path, required=True)
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--seconds', type=int, choices=[90], default=90)
    a = ap.parse_args()
    if os.name != 'nt': raise SystemExit('Windows required')
    payload, root = a.payload.resolve(), a.root.resolve()
    if not a.payload.is_absolute() or not payload.exists(): raise SystemExit('payload invalid')
    if not a.root.is_absolute() or not root.is_dir() or any(root.iterdir()): raise SystemExit('root invalid')
    r = {'passed': False, 'fixture_noise_strength': 20, 'stage': 'setup', 'primary_error': None, 'cleanup_errors': [],
         'host': {'processor': platform.processor(), 'logical_cpus': os.cpu_count(), 'platform': platform.platform()},
         'started_at': now()}
    save(root, r)
    try:
        from townlight_station.boundary import Settings
        cfg = Settings(data=root/'data',
            database_url='postgresql+psycopg2://diagnostic@127.0.0.1/diagnostic_station',
            suite_url='http://127.0.0.1:15480',
            media_source=payload/'station/media-source',
            media_python=payload/'station/media-runtime/python.exe',
            media_runtime=payload/'station/media-runtime',
            ffprobe=payload/'station/bin/ffprobe.exe')
        cfg.validate()
        r['media_source_commit'] = cfg.verify_media()
        if r['media_source_commit'] != '379d7bc95d3d46402a7d8fccd494ac2b1cb94154': raise RuntimeError('media commit mismatch')
        r['encoding_profile'] = cfg.encoding_profile()
        (root/'data').mkdir()
        r['stage'] = 'generate'; save(root, r)
        ffmpeg = payload/'station/bin/ffmpeg.exe'
        clip = ri.generate(ffmpeg, root)
        r['stage'] = 'input'; save(root, r)
        r['input'] = ri.capture(ffmpeg, payload/'station/bin/ffprobe.exe', clip,
                                root/'input', a.seconds)
        save(root, r)
        input_streams = {s['codec']: s for s in r['input']['probe']['streams'].values()}
        for name in ('video', 'audio'):
            s = input_streams.get(name)
            if not s or s.get('pts_span', 0) <= 80 or s.get('backward_dts_count') != 0:
                raise RuntimeError('safe input timing')
            if s.get('max_dts_gap', 9) > 0.5:
                raise RuntimeError('safe input timing')
        if input_streams['video'].get('r_frame_rate') != '30/1':
            raise RuntimeError('safe input timing')
        r['stage'] = 'product'; save(root, r)
        r['product'] = run_product(cfg, payload, clip, root/'product', a.seconds)
        save(root, r)
        p = r['product']
        if p.get('worker_returncode') != 0 or p.get('owned_children_terminal') is not True:
            raise RuntimeError('product worker failed')
        if p.get('cleanup_errors') != [] or p.get('error_type') or p.get('probe_error_type'):
            raise RuntimeError('product error')
        f = p.get('log_flags', {})
        if f.get('clean_teardown') is not True or f.get('no_error') is not True:
            raise RuntimeError('product log flags')
        v = next((s for s in (p.get('probe') or {}).get('streams', {}).values() if s.get('codec') == 'video'), {})
        if (v.get('width'), v.get('height'), v.get('r_frame_rate')) != (1920, 1080, '30/1'):
            raise RuntimeError('output probe')
        if p.get('size_bytes', 0) <= 0 or p.get('elapsed', 0) < 85:
            raise RuntimeError('output incomplete')
        out_streams = {s.get('codec'): s for s in (p.get('probe') or {}).get('streams', {}).values() if s.get('codec') in ('video', 'audio')}
        if set(out_streams) != {'audio', 'video'}:
            raise RuntimeError('output cadence')
        positive = [row for row in (p.get('rows') or []) if row.get('bytes_written', 0) > 0]
        if len(positive) < 2:
            raise RuntimeError('output cadence')
        observed_output_wall_span = positive[-1].get('elapsed', 0) - positive[0].get('elapsed', 0)
        if observed_output_wall_span < 54:
            raise RuntimeError('output cadence')
        p['observed_output_wall_span'] = observed_output_wall_span
        minimum_media_span = max(54.0, observed_output_wall_span - 2.0)
        expected_fps = {'video': 30.0, 'audio': 46.875}
        for name in ('video', 'audio'):
            s = out_streams[name]
            if s.get('pts_span', 0) < minimum_media_span or s.get('backward_dts_count') != 0 or s.get('max_dts_gap', 9) > 0.1:
                raise RuntimeError('output cadence')
            expected_packets = s.get('pts_span', 0) * expected_fps[name]
            if expected_packets <= 0 or not (0.97 <= s.get('packet_count', 0) / expected_packets <= 1.03):
                raise RuntimeError('output cadence')
        if abs(out_streams['video'].get('pts_span', 0) - out_streams['audio'].get('pts_span', 0)) > 1.0:
            raise RuntimeError('output cadence')
        positive = [row for row in (p.get('rows') or []) if row.get('bytes_written', 0) > 0]
        if not positive:
            raise RuntimeError('output byte slope')
        steady = [row for row in positive if row.get('elapsed', 0) >= positive[0].get('elapsed', 0) + 10]
        if len(steady) < 2:
            raise RuntimeError('output byte slope')
        first, last = steady[0], steady[-1]
        dt = last.get('elapsed', 0) - first.get('elapsed', 0)
        steady_bytes_per_second = (last.get('bytes_written', 0) - first.get('bytes_written', 0)) / dt if dt > 0 else 0
        p['steady_bytes_per_second'] = steady_bytes_per_second
        p['steady_bytes_per_second_minimum'] = 500000
        if steady_bytes_per_second < 500000:
            raise RuntimeError('output byte slope')
        save(root, r)
        r['passed'] = True; r['stage'] = 'complete'
    except Exception as e:
        r['primary_error'] = {'stage': r['stage'], 'type': type(e).__name__,
            'predicate': str(e) if isinstance(e, RuntimeError) and str(e) in {'media commit mismatch', 'safe input timing', 'product worker failed', 'product error', 'product log flags', 'output probe', 'output incomplete', 'output cadence', 'output byte slope'} else None}
    finally:
        r['ended_at'] = now(); save(root, r)
        print(json.dumps({k: r[k] for k in ('passed', 'stage', 'primary_error')}))
    return 0 if r['passed'] else 1
if __name__ == '__main__': raise SystemExit(main())
