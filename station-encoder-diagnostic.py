from pathlib import Path
import subprocess
import sys

station, adapter, evidence = map(Path, sys.argv[1:])
source = adapter.read_text(encoding='utf-8')
thread_setting = "'multi-thread': 4,"
assert source.count(thread_setting) == 1
fast_adapter = evidence / 'fast-adapter.py'
fast_adapter.write_text(source.replace(thread_setting, thread_setting + "\n        'complexity': 'low',"), encoding='utf-8')
probe = Path(__file__).with_name('station-encoder-probe.py')
profiles = (
    ('1080p-medium', adapter, 1920, 1080),
    ('1080p-low', fast_adapter, 1920, 1080),
    ('720p-low', fast_adapter, 1280, 720),
)
passed = []
for label, variant, width, height in profiles:
    result = subprocess.run([sys.executable, str(probe), str(station), str(variant), str(evidence / label),
                             str(width), str(height)], timeout=150)
    print(f'{label}: exit {result.returncode}', flush=True)
    if result.returncode == 0:
        passed.append(label)
if not passed:
    raise SystemExit('No encoder profile passed the sustained signal test')
