# Exploration BGM delivery assets

The two loop masters in this directory are generated from
`assets/source/audio/sovereign-of-the-sunrise-skies.m4a` by
`node tools/audio/build-bgm.mjs`.

The build creates a circular edit with a 4-second equal-power
tail-to-head crossfade, then joins that transition to the unchanged middle of
the source. The resulting file is safe to repeat with native media looping:
its end and beginning meet at the same source position. Ogg Vorbis is the
primary browser source; AAC/M4A is the compatibility fallback.

The expected Ogg loop duration is 108.469333 seconds; the AAC/M4A compatibility
loop is 108.469 seconds. Bit-exact encoder and muxer flags keep repeated builds
byte-stable on the same FFmpeg toolchain; the build command prints source and
output SHA-256 hashes for verification.

These are streamed media files. They must not be decoded into an in-memory
Web Audio buffer during normal gameplay.

Provenance: the source track was supplied directly by the project owner for
this game. No third-party download or stock-audio source was used in this
repository workflow.
