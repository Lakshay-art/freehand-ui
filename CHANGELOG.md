# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). While the version is
`0.x`, minor releases may include breaking changes; they are always listed here.

## [Unreleased]

## [0.3.0]

- Arrows can set their own pen: `arrow.color`, `arrow.strokeWidth`, `arrow.roughness`, `arrow.opacity`.
- Notes can be styled: `note.color` (also the underline's), `note.fontSize`, `note.fontWeight`, and a fixed `note.tilt` in degrees.
- `note.highlight` paints chosen words in a colour and weight of their own, including a phrase that wraps onto the next line. Works in the React Native build too.
- `note.wordsPerLine` is now documented and typed (`0` breaks only at `\n`).
- New type `NoteHighlight`.
- A doodle inside an ancestor with `transform: scale()` is now drawn at the right size. It used to be measured in screen px and then scaled a second time.

## [0.2.0]

- React Native support via `@aznabee/freehand-ui/native`.
- Localised notes, arrow animation, and child selector mode.
