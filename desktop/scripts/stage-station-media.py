"""Stage one hash-pinned native media runtime and Station's unchanged donor sources."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import urllib.request
import zipfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def stage(payload, station, archive, contract, audio_wheel, ffmpeg_archive):
    if digest(archive) != contract['sha256']:
        raise ValueError('Station media runtime archive hash differs')
    output = payload/'station'
    runtime = output/'media-runtime'
    if runtime.exists():
        raise ValueError('Stage into an empty media-runtime directory; never overlay an unknown runtime')
    runtime.mkdir(parents=True)
    entries = {}
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            name = PurePosixPath(info.filename)
            if name.is_absolute() or '..' in name.parts or '\\' in info.filename or ':' in info.filename:
                raise ValueError('Unsafe media runtime archive member')
            if not name.parts or name.parts[0] != 'payload' or info.is_dir():
                continue
            relative = PurePosixPath(*name.parts[1:])
            # Never ship/start the donor application from this runtime. The selected
            # historical donor source is staged separately against Station's own lock.
            if relative.parts[0] in {'WHEELS', '__pycache__'} or '__pycache__' in relative.parts or relative.suffix == '.pyc':
                continue
            if relative.parts[:3] == ('Lib', 'site-packages', 'civiccast'):
                continue
            if relative.parts[:2] == ('Lib', 'site-packages') and len(relative.parts) > 2:
                package = relative.parts[2]
                allowed = {name.casefold() for name in contract['python_packages']}
                metadata = package.endswith('.dist-info') and package.split('-')[0].casefold() in allowed
                if package.casefold() not in allowed and not metadata and not package.endswith('.pth'):
                    continue
            target = runtime.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as source, target.open('xb') as destination:
                shutil.copyfileobj(source, destination)
            entries['media-runtime/'+relative.as_posix()] = digest(target)
    audio = contract['windows_audio_plugin']
    if digest(audio_wheel) != audio['sha256']:
        raise ValueError('Windows microphone plugin wheel hash differs')
    with zipfile.ZipFile(audio_wheel) as z:
        content = z.read(audio['member'])
        if hashlib.sha256(content).hexdigest() != audio['member_sha256']:
            raise ValueError('Windows microphone plugin hash differs')
        relative = 'dependencies/gstreamer/lib/gstreamer-1.0/gstwasapi2.dll'
        (runtime/relative).write_bytes(content)
        entries['media-runtime/'+relative] = audio['member_sha256']
        # Retain the dependency distributor's license notices alongside the DLL.
        for name in z.namelist():
            if '.dist-info/licenses/' in name and not name.endswith('/'):
                target = runtime/'audio-plugin-licenses'/Path(name).name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
                entries['media-runtime/'+target.relative_to(runtime).as_posix()] = digest(target)
    if digest(ffmpeg_archive) != contract['ffmpeg']['sha256']:
        raise ValueError('Pinned FFmpeg runtime archive hash differs')
    with zipfile.ZipFile(ffmpeg_archive) as z:
        for info in z.infolist():
            name = PurePosixPath(info.filename)
            if name.is_absolute() or '..' in name.parts or '\\' in info.filename or ':' in info.filename:
                raise ValueError('Unsafe FFmpeg member')
            if not name.parts or name.parts[0] != 'payload' or info.is_dir():
                continue
            relative = PurePosixPath(*name.parts[1:])
            target = output.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(info))
            entries[relative.as_posix()] = digest(target)
    license_file = output/'bin/FFMPEG-LICENSE.txt'
    shutil.copy2(output/'licenses/ffmpeg/LICENSE.txt', license_file)
    entries['bin/FFMPEG-LICENSE.txt'] = digest(license_file)
    lock = json.loads((station/'townlight_station/media-lock.json').read_text())
    for name, expected in lock['files'].items():
        source = station/'media-source'/name
        if digest(source) != expected:
            raise ValueError('Station pinned media source differs: '+name)
        target = output/'media-source'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        entries['media-source/'+name] = expected
    required = ('python.exe', 'dependencies/gstreamer/bin/gst-discoverer-1.0.exe',
                'dependencies/gstreamer/lib/girepository-1.0/Gst-1.0.typelib')
    if any(not (runtime/p).is_file() for p in required):
        raise ValueError('Native Station media closure is incomplete')
    receipt = {'native_input': contract, 'donor_source_commit': lock['source_commit'], 'files': entries}
    (output/'media-input-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--payload', type=Path, required=True)
    parser.add_argument('--station', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--contract', type=Path, default=Path(__file__).resolve().parents[2]/'config/station-media-input.json')
    args = parser.parse_args()
    contract = json.loads(args.contract.read_text())
    if not args.archive.exists():
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(contract['download_url'], args.archive)
    audio = contract['windows_audio_plugin']
    audio_wheel = args.archive.parent/audio['filename']
    if not audio_wheel.exists():
        urllib.request.urlretrieve(audio['url'], audio_wheel)
    ffmpeg_archive = args.archive.parent/contract['ffmpeg']['filename']
    if not ffmpeg_archive.exists():
        urllib.request.urlretrieve(contract['ffmpeg']['url'], ffmpeg_archive)
    result = stage(args.payload.resolve(), args.station.resolve(), args.archive.resolve(), contract, audio_wheel, ffmpeg_archive)
    print(json.dumps({'staged_files': len(result['files']), 'source_commit': result['donor_source_commit']}))
