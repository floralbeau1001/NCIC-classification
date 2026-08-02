# Tenprint Bench 🫆

A fingerprint classification worksheet. Enter ten fingers once and get all three
classifications at the same time:

| System | What it produces |
| --- | --- |
| **NCIC FPC** | The twenty-character Fingerprint Classification field, two characters per finger |
| **IAFIS / AFIS** | The eight pattern-level codes — `AU` `WU` `RS` `LS` `SR` `XX` `UC` `UP` |
| **Henry, FBI-extended** | key · major · primary · secondary · subsecondary · final, as a fraction, plus the second subsecondary |

The print boxes show real FBI reference impressions, and a **Practice** tab
drills you on them: a genuine print, the hand it came from, name the pattern.
Clicking any box opens it in a loupe large enough to read the ridges.

No build step, no dependencies, no network. Open `index.html`.

`tests.html` runs the rule tests in the page — **50 of them**, including four
worked cards transcribed from the FBI manual. Figures 352 and 353 print both
the ten ridge counts and the resulting classification, so the entire Henry
formula is asserted end to end rather than one table at a time.

---

## The rules it implements

Every rule below is taken from a primary source. Where sources disagree — and
they do — the FBI's own manual wins, because NCIC and IAFIS are FBI systems.

### NCIC FPC

Twenty characters in a straight line, two per finger, beginning with the right
thumb as number 1 and running to number 10, the left thumb being number 6.

| Pattern | Code |
| --- | --- |
| Plain arch | `AA` |
| Tented arch | `TT` |
| Ulnar loop | ridge count, zero-padded — `01`–`49` |
| Radial loop | ridge count **+ 50** — `51`–`99` |
| Plain whorl | `PI` `PM` `PO` |
| Central pocket loop whorl | `CI` `CM` `CO` |
| Double loop whorl | `dI` `dM` `dO` — **lowercase d** |
| Accidental whorl | `XI` `XM` `XO` |
| Missing or amputated | `XX` |
| Completely scarred or mutilated | `SR` |

The lowercase `d` is not a transcription slip in the source table and the field
is not case-insensitive: an uppercase `D` is a different, undefined value. The
old version of this project emitted `DI`/`DM`/`DO`, which was wrong.

Because a radial loop is encoded as count + 50 and an ulnar loop as the count
itself, both bottom out at 1 and top out at 49 — there is no representation for
a count of 50 or more in either direction. The bench refuses counts outside
1–49 rather than emitting something the field cannot hold. The old version
capped at 40, which silently rejected legitimate counts of 41–49.

The NCIC table defines **no** code for an unclassifiable or an unprinted
finger; those exist only in AFIS. The bench leaves that position blank and
flags it instead of inventing a value.

### IAFIS / AFIS pattern level

| Code | Meaning |
| --- | --- |
| `AU` | Arch, unspecified — plain and tented alike |
| `WU` | Whorl, unspecified — all four whorl types |
| `RS` | Right slant loop |
| `LS` | Left slant loop |
| `SR` | Complete scar |
| `XX` | Amputation |
| `UC` | Unable to classify |
| `UP` | Unable to print — image not supplied |

Loops are recorded by slant rather than by ulnar/radial, because slant is
observable without knowing which hand the impression came from. Slant then
follows from the hand:

```
right hand + ulnar  -> RS        left hand + ulnar  -> LS
right hand + radial -> LS        left hand + radial -> RS
```

The bench derives this from the box number, so you never enter it. In a rolled
impression the ulnar side of a right-hand finger falls on the right of the
image, which is why the pairing inverts between hands.

### Whorl ridge tracing

Trace from the extreme left delta toward the right delta. If the traced ridge
passes **inside** (above) the right delta with **three or more** ridges
intervening, the tracing is **inner — I**. If it passes **outside** (below)
with three or more intervening, it is **outer — O**. Every other tracing is
**meeting — M**. There is a small calculator for this in the Code tables panel.

### Henry, as extended by the FBI

```
key  major  primary  secondary  subsecondary  final
---------------------------------------------------
     major  primary  secondary  subsecondary  final
```

**Primary.** A whorl on finger *n* contributes 16 16 8 8 4 4 2 2 1 1; anything
else contributes zero. The numerator sums the even-numbered fingers, the
denominator the odd-numbered, and 1 is added to each. Runs 1/1 to 32/32 — 1024
groupings.

**Secondary.** The index fingers as capitals: `A` arch, `T` tented arch, `R`
radial loop, `U` ulnar loop, `W` whorl. Right over left.

**Small letters.** An arch or tented arch in any finger, or a radial loop in
any finger *other than* the index fingers, is a small letter (`a`, `t`, `r`).
They are written in their true relative positions beside the index capital. A
dash marks a finger with no small letter that sits between the index and a
small letter, or between two small letters; trailing gaps are not written. Runs
of the same letter are compressed, so three adjacent arches read `3a`:

```
1 aUa-t      1 rU-2a
--------     --------
1  R-a       1 tU3a
```

**Subsecondary.** Fingers 2, 3, 4 over 7, 8, 9. Whorls carry their tracing
straight through; loop counts become `I` or `O` by position:

| Position | Inner | Outer |
| --- | --- | --- |
| Index | 1–9 | 10 and over |
| Middle | 1–10 | 11 and over |
| Ring | 1–13 | 14 and over |

**Second subsecondary.** The same six fingers split three ways for groups that
stay unwieldy when fully extended: index 1–5 `S`, 6–12 `M`, 13+ `L`; middle 1–8
`S`, 9–14 `M`, 15+ `L`; ring 1–10 `S`, 11–18 `M`, 19+ `L`.

**Major division.** The thumbs. Whorls carry their tracing. Loops use
1–11 `S`, 12–16 `M`, 17 and over `L` — except that when the **left** thumb is a
loop counting 17 or more, the right thumb switches to an expanded table of
1–17 `S`, 18–22 `M`, 23 and over `L`, which spreads large-count prints more
evenly across the file.

> The classification chart in the Project Gutenberg transcription prints the
> expanded band as `19-22 = M`, which would leave 18 unassigned. The prose
> table on the same page reads *18 to 22, inclusive*. The bench follows the
> prose, and the figure 352 test confirms it.

**Final.** The ridge count of the loop in the right little finger, at the far
right of the numerator. Failing that, a loop in the left little finger, written
in the denominator. Failing that, a whorl in a little finger may be counted —
left delta to core on the right hand, right delta to core on the left. Two
arches, and there is no final at all.

**Key.** The ridge count of the first loop reading from the right thumb, the
little fingers excluded because they are reserved for the final. Always at the
far left of the numerator.

---

## The worked examples

Four cards from the manual are encoded as tests. Two print both the ridge
counts and the finished classification, so the whole formula can be checked
end to end:

| Figure | What it pins down |
| --- | --- |
| **352** | Full formula. Both thumbs large, so the expanded major table lands on `L` |
| **353** | Full formula. Right thumb 22 lands on `M` on that same table, and with no loop in the right little finger the final falls through to the left |
| **350** | Primary, secondary, subsecondary, key and final; the source omits the major |
| **349** | An arch in the left thumb, placed as a small letter immediately left of the index capital |

`index.html?example=1` loads figure 352:

| Finger | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pattern | ulnar | radial | ulnar | ulnar | ulnar | ulnar | radial | ulnar | ulnar | ulnar |
| Count | 24 | 13 | 31 | 21 | 17 | 18 | 16 | 13 | 18 | 20 |

```
NCIC     24 63 31 21 17 18 66 13 18 20
IAFIS    RS LS RS RS RS LS RS LS LS LS

Henry    24 L 1 R OOO 17          second subsecondary  LLL
            L 1 R OOO                                  LMM
```

The Henry line is exactly what the manual prints. `?example=2` loads a
constructed card that exercises the parts figure 352 does not: whorl tracings,
the lowercase `d`, and the small-letter group.

---

## Layout

```
index.html            the bench
tests.html            rule tests, run in the page
assets/classify.js    the engine — pure functions, no DOM
assets/prints.js      which verified figures exist, by pattern (generated)
assets/patterns.js    which exemplar each box gets, and its handedness
assets/app.js         the UI, the loupe and the practice drill
assets/styles.css     two themes: Bench (dark) and Paper (light)
assets/prints/        the 50 reference impressions
```

Deep links: `?example=1` and `?example=2` open a worked card, `#henry`,
`#reference` and `#practice` open a panel, and `#box-4` opens the loupe on that
impression.

`classify.js` knows nothing about the page and the page contains no
classification logic, so the rules can be tested directly and read without
wading through DOM code.

### The impressions

The print boxes show the FBI's own reference exemplars, cut from the plates in
*The Science of Fingerprints* — a United States Government work, and so in the
public domain. There are **50 of them**, six to ten per pattern.

**No card repeats a print.** A real ten-print card carries ten different
impressions, so showing one exemplar per pattern — the same whorl in every
whorl box — reads as obviously fake. The box number picks between the
exemplars, so a card of ten ulnar loops shows ten different ulnar loops. The
choice is deterministic: the same card always looks the same.

**Every figure was verified, not assumed.** Each sits inside a range the manual
states outright ("Figures 122 to 133 are examples of the tented arch"), and was
then corroborated independently. A ridge-orientation field is built for each
impression and the Poincaré index taken around every point, which locates cores
and deltas the way an AFIS extractor does: a closed path through the
orientation field accumulates +180° around a core and −180° around a delta. An
arch must show no delta and a loop exactly one, or the figure is dropped. Each
survivor was then scored for legibility — over-inked bands, dropped-out paper,
scanner scratches — and the best kept.

Two limits worth stating plainly. The delta gate is loosened for whorl
subtypes: a whorl has two deltas, but they sit at opposite lower corners and
the plates are cropped tight, so the outer one often falls outside the image.
Demanding two rejected 20 of 24 central pocket loops, which is a fact about the
crop, not about the manual. And a handful of figures were dropped by eye for
partial rolls or blotches that read as false minutiae.

**Loops are handed correctly.** Every stored loop is a left slant, measured
rather than eyeballed: a loop's delta lies opposite its opening, so a delta to
the right of the core means the ridges open left. Mirroring one yields a
genuine right-slant loop, which is what the opposite hand leaves. Figure 99 was
rejected because its delta sat almost directly under its core — it read as left
slant before quantisation and right slant after, and a coin-flip is not a
measurement.

Scarring shows genuinely scarred impressions rather than clean ones with marks
drawn over them. Figure 355, the one the manual calls *entirely obliterated*,
is what `SR` displays; the partial scars stand in for `UC`.

The build that does all this is not in the repo — it is a one-off over the
Gutenberg plates — but every figure number is recorded in `assets/prints.js`,
so any claim here can be checked against the manual.

---

## Sources

- **FBI, *The Science of Fingerprints: Classification and Uses*** — the
  authority for the Henry tables, the classification chart, the small-letter
  rules and the ridge-tracing definition, and the source of the exemplar
  plates. [Project Gutenberg #19022](https://www.gutenberg.org/ebooks/19022)
- **NamUs / NAME, *Explanation of Fingerprint Classification Systems*** — the
  NCIC FPC code table and the AFIS pattern codes.
  [PDF](https://pnwdiai.org/wp-content/uploads/2021/07/NAMUS-Explanation-of-Fingerprint-Classification-Systems.pdf)
- **NIJ, *The Fingerprint Sourcebook*, ch. 5** — Hutchins, "Systems of Friction
  Ridge Classification". Corroborates the Henry primary values.
  [PDF](https://www.ojp.gov/pdffiles1/nij/225325.pdf)

Note that several widely-circulated study guides give an Indian/CBI variant of
the sub-secondary and major tables — a three-way `I`/`M`/`O` subsecondary and a
major division of "up to 12 / 13–19 / 20+". Those are a different national
system. This bench implements the FBI variant throughout, because NCIC and
IAFIS are FBI systems.

---

## A caveat worth keeping

A classification is a filing aid. It narrows a search; it never establishes
identity. Nothing here is an identification, and none of it is a substitute for
examination by a qualified examiner.
