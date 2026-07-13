import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = resolve(
  root,
  'assets/source/audio/sovereign-of-the-sunrise-skies.m4a',
)
const outputDirectory = resolve(root, 'public/assets/audio')
const outputBase = resolve(
  outputDirectory,
  'sovereign-of-the-sunrise-skies-loop',
)
const crossfadeSeconds = 4

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || 'unknown error'
    throw new Error(`${command} failed: ${detail}`)
  }
  return result.stdout
}

function probe(path) {
  return JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_name,sample_rate,channels',
      '-of',
      'json',
      path,
    ]),
  )
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const sourceProbe = probe(source)
const sourceDuration = Number(sourceProbe.format?.duration)
if (!Number.isFinite(sourceDuration) || sourceDuration <= crossfadeSeconds * 2) {
  throw new Error('Source must be longer than two crossfade windows.')
}

mkdirSync(outputDirectory, { recursive: true })
const tailStart = sourceDuration - crossfadeSeconds
const filter = [
  '[0:a]asplit=3[head-source][tail-source][middle-source]',
  `[head-source]atrim=start=0:end=${crossfadeSeconds},asetpts=PTS-STARTPTS[head]`,
  `[tail-source]atrim=start=${tailStart}:end=${sourceDuration},asetpts=PTS-STARTPTS[tail]`,
  `[tail][head]acrossfade=d=${crossfadeSeconds}:c1=qsin:c2=qsin[transition]`,
  `[middle-source]atrim=start=${crossfadeSeconds}:end=${tailStart},asetpts=PTS-STARTPTS[middle]`,
  '[transition][middle]concat=n=2:v=0:a=1[out]',
].join(';')

const commonArguments = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-i',
  source,
  '-filter_complex',
  filter,
  '-map',
  '[out]',
  '-map_metadata',
  '-1',
  '-fflags',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-metadata',
  'title=Sovereign of the Sunrise Skies - Exploration Loop',
]

const oggPath = `${outputBase}.ogg`
const m4aPath = `${outputBase}.m4a`
run('ffmpeg', [...commonArguments, '-c:a', 'libvorbis', '-q:a', '5', oggPath])
run('ffmpeg', [
  ...commonArguments,
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-movflags',
  '+faststart',
  m4aPath,
])

const expectedDuration = sourceDuration - crossfadeSeconds
const outputs = [
  { path: oggPath, codec: 'vorbis' },
  { path: m4aPath, codec: 'aac' },
].map((output) => {
  const media = probe(output.path)
  const stream = media.streams?.[0]
  const duration = Number(media.format?.duration)
  if (
    stream?.codec_name !== output.codec ||
    stream?.sample_rate !== '48000' ||
    stream?.channels !== 2 ||
    !Number.isFinite(duration) ||
    Math.abs(duration - expectedDuration) > 0.15
  ) {
    throw new Error(`Unexpected encoded output: ${JSON.stringify(media)}`)
  }
  return {
    file: output.path.slice(root.length + 1).replaceAll('\\', '/'),
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: stream.channels,
    durationSeconds: duration,
    sha256: sha256(output.path),
  }
})

console.log(
  JSON.stringify(
    {
      source: {
        file: source.slice(root.length + 1).replaceAll('\\', '/'),
        durationSeconds: sourceDuration,
        sha256: sha256(source),
      },
      loop: {
        crossfadeSeconds,
        expectedDurationSeconds: expectedDuration,
      },
      outputs,
    },
    null,
    2,
  ),
)
