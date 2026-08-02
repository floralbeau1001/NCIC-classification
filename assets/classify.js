/* ==========================================================================
   classify.js — the classification engine.

   Pure functions, no DOM. Every rule below is traceable to a primary source;
   the citation tags in comments map to the reference list in README.md:

     [SOF]   FBI, "The Science of Fingerprints: Classification and Uses"
             (Project Gutenberg #19022) — chapters on the classification
             formula and its extensions. The authority for the Henry/FBI
             tables and the whorl-tracing rule.
     [NAMUS] NamUs / NAME, "Explanation of Fingerprint Classification
             Systems" — the authority for the NCIC FPC code table and the
             AFIS pattern codes.
     [NIJ5]  NIJ Fingerprint Sourcebook, ch. 5, Hutchins, "Systems of
             Friction Ridge Classification" — Henry primary values.

   Loaded as a classic script so the pages keep working from file://.
   ========================================================================== */
(function (global) {
    "use strict";

    /* ---------------------------------------------------------------------
       Finger positions. Numbered 1-10 beginning with the right thumb; the
       left thumb is number 6. This ordering is shared by all three systems.
       [NAMUS]
       --------------------------------------------------------------------- */
    var FINGERS = [
        { n: 1,  hand: "right", short: "R Thumb",  name: "Right Thumb",  slot: "thumb"  },
        { n: 2,  hand: "right", short: "R Index",  name: "Right Index",  slot: "index"  },
        { n: 3,  hand: "right", short: "R Middle", name: "Right Middle", slot: "middle" },
        { n: 4,  hand: "right", short: "R Ring",   name: "Right Ring",   slot: "ring"   },
        { n: 5,  hand: "right", short: "R Little", name: "Right Little", slot: "little" },
        { n: 6,  hand: "left",  short: "L Thumb",  name: "Left Thumb",   slot: "thumb"  },
        { n: 7,  hand: "left",  short: "L Index",  name: "Left Index",   slot: "index"  },
        { n: 8,  hand: "left",  short: "L Middle", name: "Left Middle",  slot: "middle" },
        { n: 9,  hand: "left",  short: "L Ring",   name: "Left Ring",    slot: "ring"   },
        { n: 10, hand: "left",  short: "L Little", name: "Left Little",  slot: "little" }
    ];

    /* ---------------------------------------------------------------------
       The pattern catalogue — one row per selectable pattern, carrying that
       pattern's representation in all three systems at once. Keeping the
       three encodings side by side is what lets a single ten-finger entry
       drive NCIC, AFIS and Henry simultaneously.

       `needs` declares the extra datum the pattern requires:
         "count"   ridge count, delta to core
         "tracing" whorl ridge tracing, inner / meeting / outer

       `ncic` is a literal two-character code; `ncicPrefix` is a first
       character that the whorl tracing completes. A null `ncic` means the
       pattern has no NCIC FPC representation at all — true of the two AFIS
       administrative codes, which the NCIC table simply does not define.
       --------------------------------------------------------------------- */
    var PATTERNS = [
        {
            id: "PLAIN_ARCH", name: "Plain Arch", abbr: "PA", group: "arch",
            ncic: "AA", afis: "AU", henry: "A", small: "a", needs: null,
            note: "Ridges enter one side and flow out the other with a slight rise. No delta, no core, no ridge count."
        },
        {
            id: "TENTED_ARCH", name: "Tented Arch", abbr: "TA", group: "arch",
            ncic: "TT", afis: "AU", henry: "T", small: "t", needs: null,
            note: "An arch with a sharp upthrust or an angle; lacks one of the three loop requisites."
        },
        {
            id: "ULNAR_LOOP", name: "Ulnar Loop", abbr: "UL", group: "loop",
            ncic: null, afis: null, henry: "U", small: null, needs: "count",
            note: "Ridges flow toward the little finger — the side of the ulna. NCIC records the ridge count as-is."
        },
        {
            id: "RADIAL_LOOP", name: "Radial Loop", abbr: "RL", group: "loop",
            ncic: null, afis: null, henry: "R", small: "r", needs: "count",
            note: "Ridges flow toward the thumb — the side of the radius. NCIC adds 50 to the ridge count."
        },
        {
            id: "PLAIN_WHORL", name: "Plain Whorl", abbr: "PW", group: "whorl",
            ncicPrefix: "P", ncic: null, afis: "WU", henry: "W", small: null, needs: "tracing",
            note: "Two deltas and at least one ridge making a complete circuit."
        },
        {
            id: "CENTRAL_POCKET", name: "Central Pocket Loop Whorl", abbr: "CP", group: "whorl",
            ncicPrefix: "C", ncic: null, afis: "WU", henry: "W", small: null, needs: "tracing",
            note: "Two deltas, one or more ridges forming a complete circuit around a pocket-like core."
        },
        {
            id: "DOUBLE_LOOP", name: "Double Loop Whorl", abbr: "DL", group: "whorl",
            ncicPrefix: "d", ncic: null, afis: "WU", henry: "W", small: null, needs: "tracing",
            note: "Two separate loop formations with two separate shoulders and two deltas. NCIC uses a LOWERCASE d."
        },
        {
            id: "ACCIDENTAL", name: "Accidental Whorl", abbr: "AW", group: "whorl",
            ncicPrefix: "X", ncic: null, afis: "WU", henry: "W", small: null, needs: "tracing",
            note: "A combination of two different pattern types, or one conforming to no other definition."
        },
        {
            id: "SCARRED", name: "Completely Scarred", abbr: "SR", group: "special",
            ncic: "SR", afis: "SR", henry: null, small: null, needs: null,
            note: "Scarring or mutilation so complete that no pattern can be determined."
        },
        {
            id: "AMPUTATED", name: "Amputated / Missing", abbr: "XX", group: "special",
            ncic: "XX", afis: "XX", henry: null, small: null, needs: null,
            note: "Finger amputated or missing at birth."
        },
        {
            id: "UNCLASSIFIABLE", name: "Unable to Classify", abbr: "UC", group: "special",
            ncic: null, afis: "UC", henry: null, small: null, needs: null,
            note: "An AFIS-only code. The NCIC FPC table defines no equivalent."
        },
        {
            id: "UNPRINTABLE", name: "Unable to Print", abbr: "UP", group: "special",
            ncic: null, afis: "UP", henry: null, small: null, needs: null,
            note: "An AFIS-only code: the image was not supplied. The NCIC FPC table defines no equivalent."
        }
    ];

    var TRACINGS = [
        { value: "I", name: "Inner",   full: "Inner tracing" },
        { value: "M", name: "Meeting", full: "Meeting tracing" },
        { value: "O", name: "Outer",   full: "Outer tracing" }
    ];

    /* NCIC encodes an ulnar count as 01-49 and a radial count as count+50,
       i.e. 51-99. Both directions therefore bottom out at 1 and top out at
       49 — a loop always crosses at least one ridge, and a count of 50 has
       no representation in either range. [NAMUS] */
    var MIN_COUNT = 1;
    var MAX_COUNT = 49;

    var byId = {};
    PATTERNS.forEach(function (p) { byId[p.id] = p; });

    function pattern(id) { return byId[id] || null; }
    function isLoop(p)  { return !!p && p.group === "loop"; }
    function isWhorl(p) { return !!p && p.group === "whorl"; }
    function isArch(p)  { return !!p && p.group === "arch"; }

    function validCount(v) {
        return Number.isInteger(v) && v >= MIN_COUNT && v <= MAX_COUNT;
    }

    /* A finger entry is complete once its pattern is chosen and whatever
       extra datum that pattern demands has been supplied. */
    function isComplete(entry) {
        var p = pattern(entry && entry.patternId);
        if (!p) return false;
        if (p.needs === "count")   return validCount(entry.count);
        if (p.needs === "tracing") return entry.tracing === "I" || entry.tracing === "M" || entry.tracing === "O";
        return true;
    }

    function blankSheet() {
        return FINGERS.map(function () {
            return { patternId: null, count: null, tracing: null, finalCount: null };
        });
    }

    /* =====================================================================
       NCIC — Fingerprint Classification (FPC)

       Twenty characters, two per finger, right thumb first. [NAMUS]
         Plain arch                AA          Tented arch     TT
         Radial loop               count + 50 (51-99)
         Ulnar loop                count, zero-padded (01-49)
         Plain whorl               P + tracing        Central pocket  C + tracing
         Double loop whorl         d + tracing        Accidental      X + tracing
         Missing or amputated      XX          Completely scarred     SR

       Note the lowercase d for the double loop whorl. It is not a typo in
       the source table and it is not case-insensitive: an uppercase D is a
       different (undefined) value in the FPC field.
       ===================================================================== */
    function ncicSegment(entry) {
        var p = pattern(entry && entry.patternId);
        if (!p) return { code: null, detail: "Not classified", status: "empty" };

        if (p.needs === "count") {
            if (!validCount(entry.count)) {
                return { code: null, detail: p.name + " — ridge count required", status: "incomplete" };
            }
            var value = p.id === "RADIAL_LOOP" ? entry.count + 50 : entry.count;
            return {
                code: String(value).padStart(2, "0"),
                detail: p.name + ", ridge count " + entry.count +
                        (p.id === "RADIAL_LOOP" ? " (+50)" : ""),
                status: "ok"
            };
        }

        if (p.needs === "tracing") {
            if (!entry.tracing) {
                return { code: null, detail: p.name + " — ridge tracing required", status: "incomplete" };
            }
            return {
                code: p.ncicPrefix + entry.tracing,
                detail: p.name + ", " + tracingName(entry.tracing) + " tracing",
                status: "ok"
            };
        }

        if (!p.ncic) {
            return {
                code: null,
                detail: p.name + " — no NCIC FPC equivalent",
                status: "unrepresentable"
            };
        }
        return { code: p.ncic, detail: p.name, status: "ok" };
    }

    function tracingName(value) {
        var t = TRACINGS.filter(function (x) { return x.value === value; })[0];
        return t ? t.name : value;
    }

    function ncic(sheet) {
        var rows = sheet.map(function (entry, i) {
            var seg = ncicSegment(entry);
            return {
                finger: FINGERS[i],
                code: seg.code,
                detail: seg.detail,
                status: seg.status
            };
        });
        return {
            system: "NCIC",
            rows: rows,
            code: rows.map(function (r) { return r.code || "··"; }).join(" "),
            complete: rows.every(function (r) { return r.status === "ok"; }),
            /* Surfaced rather than silently coded: NCIC has no UC/UP. */
            unrepresentable: rows.filter(function (r) { return r.status === "unrepresentable"; })
        };
    }

    /* =====================================================================
       AFIS / IAFIS pattern-level classification

       The AFIS segment of IAFIS reduces every impression to one of eight
       two-letter codes: WU, AU, RS, LS, SR, XX plus the administrative UC
       and UP. All arches collapse to AU and all whorls to WU; loops are
       recorded by the direction the ridges slant rather than by ulnar or
       radial, because slant is observable without knowing the hand. [NAMUS]

       Slant follows from the hand. In a rolled impression the ulnar side of
       a right-hand finger falls on the right of the image, so a right-hand
       ulnar loop slants right; the pairing inverts on the left hand:

           right hand + ulnar  -> RS        left hand + ulnar  -> LS
           right hand + radial -> LS        left hand + radial -> RS
       ===================================================================== */
    function afisSegment(entry, finger) {
        var p = pattern(entry && entry.patternId);
        if (!p) return { code: null, detail: "Not classified", status: "empty" };

        if (p.group === "loop") {
            var rightHand = finger.hand === "right";
            var ulnar = p.id === "ULNAR_LOOP";
            var code = (ulnar === rightHand) ? "RS" : "LS";
            return {
                code: code,
                detail: p.name + " on the " + finger.hand + " hand — " +
                        (code === "RS" ? "right" : "left") + " slant",
                status: "ok"
            };
        }

        if (p.group === "arch")  return { code: "AU", detail: p.name + " — arch, unspecified", status: "ok" };
        if (p.group === "whorl") return { code: "WU", detail: p.name + " — whorl, unspecified", status: "ok" };
        return { code: p.afis, detail: p.name, status: "ok" };
    }

    function afis(sheet) {
        var rows = sheet.map(function (entry, i) {
            var seg = afisSegment(entry, FINGERS[i]);
            return { finger: FINGERS[i], code: seg.code, detail: seg.detail, status: seg.status };
        });
        return {
            system: "IAFIS",
            rows: rows,
            code: rows.map(function (r) { return r.code || "··"; }).join(" "),
            complete: rows.every(function (r) { return r.status === "ok"; }),
            unrepresentable: []
        };
    }

    /* =====================================================================
       Henry, as extended by the FBI

       Six divisions plus one extension, assembled into a fraction:

           key  major  primary  secondary  subsecondary  final
           ---------------------------------------------------
                major  primary  secondary  subsecondary  final

       All tables below are quoted from [SOF]; the primary values are
       corroborated by [NIJ5] table 5-5.
       ===================================================================== */

    /* Primary: a whorl on finger n contributes this value; anything else
       contributes zero. Numerator sums the even-numbered fingers, the
       denominator the odd-numbered, and 1 is added to each. Range 1/1 to
       32/32 — 1024 groupings. [NIJ5] */
    var PRIMARY_VALUE = [16, 16, 8, 8, 4, 4, 2, 2, 1, 1];

    /* Subsecondary: loop ridge counts translated to I (small) or O (large),
       by finger position. Only fingers 2,3,4,7,8,9 take part. [SOF] */
    var SUBSECONDARY = {
        index:  { inner: 9,  label: "1-9 = I, 10 and over = O"  },
        middle: { inner: 10, label: "1-10 = I, 11 and over = O" },
        ring:   { inner: 13, label: "1-13 = I, 14 and over = O" }
    };

    /* Second subsecondary: the same six fingers on a three-way S/M/L
       split, used to break up groups that stay unwieldy when fully
       extended. [SOF] */
    var SECOND_SUB = {
        index:  [5, 12],   /* 1-5 S, 6-12 M, 13+ L */
        middle: [8, 14],   /* 1-8 S, 9-14 M, 15+ L */
        ring:   [10, 18]   /* 1-10 S, 11-18 M, 19+ L */
    };

    /* Major division, loops in the thumbs. The left thumb always uses the
       standard table. The right thumb uses the standard table too — unless
       the left thumb counted 17 or more, in which case it switches to the
       expanded table, which spreads large-count prints more evenly across
       the file. [SOF] */
    var MAJOR_STANDARD = { s: 11, m: 16, label: "1-11 = S, 12-16 = M, 17 and over = L" };
    var MAJOR_EXPANDED = { s: 17, m: 22, label: "1-17 = S, 18-22 = M, 23 and over = L" };

    function bandSML(count, table) {
        if (count <= table.s) return "S";
        if (count <= table.m) return "M";
        return "L";
    }

    function henry(sheet) {
        var get = function (n) { return sheet[n - 1] || {}; };
        var pat = function (n) { return pattern(get(n).patternId); };

        var notes = [];

        /* ---- Primary ---- */
        var num = 1, den = 1;
        for (var n = 1; n <= 10; n++) {
            if (isWhorl(pat(n))) {
                if (n % 2 === 0) num += PRIMARY_VALUE[n - 1];
                else den += PRIMARY_VALUE[n - 1];
            }
        }
        var primary = { num: num, den: den, text: num + "/" + den };

        /* ---- Secondary: the index fingers, as capitals ---- */
        function capital(n) {
            var p = pat(n);
            return p && p.henry ? p.henry : "-";
        }
        var secondary = { num: capital(2), den: capital(7) };

        /* ---- Small-letter group ----
           An arch or tented arch in any finger, or a radial loop in any
           finger other than the index fingers, is a "small letter". They
           are written in their true relative positions beside the index
           capital. A dash marks a finger with no small letter that sits
           between the index and a small letter, or between two small
           letters — trailing gaps are simply not written. Runs of the same
           letter are compressed, so three adjacent arches read "3a". [SOF] */
        function smallLetter(n) {
            var p = pat(n);
            if (!p || !p.small) return null;
            if (p.id === "RADIAL_LOOP" && FINGERS[n - 1].slot === "index") return null;
            return p.small;
        }

        function compress(letters) {
            var out = "", i = 0;
            while (i < letters.length) {
                var ch = letters[i], run = 1;
                while (i + run < letters.length && letters[i + run] === ch) run++;
                out += (ch !== "-" && run > 1) ? run + ch : new Array(run + 1).join(ch);
                i += run;
            }
            return out;
        }

        /* Fingers after the index on one hand: middle, ring, little. */
        function trailingSmalls(first) {
            var seq = [smallLetter(first), smallLetter(first + 1), smallLetter(first + 2)];
            var last = -1;
            seq.forEach(function (v, i) { if (v) last = i; });
            if (last < 0) return "";
            return compress(seq.slice(0, last + 1).map(function (v) { return v || "-"; }));
        }

        var smalls = {
            num: { before: smallLetter(1) || "", after: trailingSmalls(3) },
            den: { before: smallLetter(6) || "", after: trailingSmalls(8) }
        };

        var secondaryText = {
            num: smalls.num.before + secondary.num + smalls.num.after,
            den: smalls.den.before + secondary.den + smalls.den.after
        };

        /* ---- Subsecondary ---- */
        function subFor(n) {
            var p = pat(n), e = get(n), slot = FINGERS[n - 1].slot;
            if (isWhorl(p)) return e.tracing || "?";
            if (isLoop(p)) {
                if (!validCount(e.count)) return "?";
                /* A radial loop outside the index fingers belongs to the
                   small-letter group and is dashed here instead. */
                if (p.id === "RADIAL_LOOP" && slot !== "index") return "-";
                return e.count <= SUBSECONDARY[slot].inner ? "I" : "O";
            }
            if (isArch(p)) return "-";
            return "-";
        }
        var subsecondary = {
            num: [subFor(2), subFor(3), subFor(4)].join(""),
            den: [subFor(7), subFor(8), subFor(9)].join("")
        };

        function secondSubFor(n) {
            var p = pat(n), e = get(n), slot = FINGERS[n - 1].slot;
            if (!isLoop(p) || !validCount(e.count)) return "-";
            if (p.id === "RADIAL_LOOP" && slot !== "index") return "-";
            var t = SECOND_SUB[slot];
            return e.count <= t[0] ? "S" : (e.count <= t[1] ? "M" : "L");
        }
        var secondSubsecondary = {
            num: [secondSubFor(2), secondSubFor(3), secondSubFor(4)].join(""),
            den: [secondSubFor(7), secondSubFor(8), secondSubFor(9)].join("")
        };

        /* ---- Major division ---- */
        var rt = pat(1), lt = pat(6), rte = get(1), lte = get(6);
        var majorDen, majorNum, majorTable = MAJOR_STANDARD;

        if (isWhorl(lt))      majorDen = lte.tracing || "?";
        else if (isLoop(lt))  majorDen = validCount(lte.count) ? bandSML(lte.count, MAJOR_STANDARD) : "?";
        else                  majorDen = "-";

        /* The expanded table applies only when the left thumb is itself a
           loop counting 17 or more. A whorl in the left thumb leaves the
           right thumb on the standard table. */
        if (isLoop(lt) && validCount(lte.count) && lte.count >= 17) {
            majorTable = MAJOR_EXPANDED;
            notes.push("Left thumb loop counted " + lte.count +
                       " (17 or more), so the right thumb uses the expanded major table: " +
                       MAJOR_EXPANDED.label + ".");
        }

        if (isWhorl(rt))      majorNum = rte.tracing || "?";
        else if (isLoop(rt))  majorNum = validCount(rte.count) ? bandSML(rte.count, majorTable) : "?";
        else                  majorNum = "-";

        var major = { num: majorNum, den: majorDen, table: majorTable };

        /* ---- Final ----
           The ridge count of the loop in the right little finger, written
           at the far right of the numerator. Failing that, a loop in the
           left little finger, written in the denominator. Failing that a
           whorl in a little finger may be counted. Two arches, and there is
           no final at all. [SOF] */
        var final_ = { num: "", den: "", source: null };
        var r5 = get(5), l10 = get(10), p5 = pat(5), p10 = pat(10);

        if (isLoop(p5) && validCount(r5.count)) {
            final_ = { num: String(r5.count), den: "", source: "Right little finger loop, ridge count " + r5.count + "." };
        } else if (isLoop(p10) && validCount(l10.count)) {
            final_ = { num: "", den: String(l10.count), source: "No loop in the right little finger, so the left little finger loop is used: ridge count " + l10.count + "." };
        } else if (isWhorl(p5) && validCount(r5.finalCount)) {
            final_ = { num: String(r5.finalCount), den: "", source: "No loop in either little finger; the right little whorl is counted left delta to core: " + r5.finalCount + "." };
        } else if (isWhorl(p10) && validCount(l10.finalCount)) {
            final_ = { num: "", den: String(l10.finalCount), source: "No loop in either little finger; the left little whorl is counted right delta to core: " + l10.finalCount + "." };
        } else if (isArch(p5) && isArch(p10)) {
            final_.source = "Both little fingers are arches, so no final is taken.";
        }

        /* ---- Key ----
           The ridge count of the first loop on the card reading from the
           right thumb, the little fingers excluded because they are
           reserved for the final. Always at the far left of the numerator. */
        var key = { value: "", source: null };
        var order = [1, 2, 3, 4, 6, 7, 8, 9];
        for (var k = 0; k < order.length; k++) {
            var fn = order[k];
            if (isLoop(pat(fn)) && validCount(get(fn).count)) {
                key = {
                    value: String(get(fn).count),
                    source: "First loop reading from the right thumb is finger " + fn +
                            " (" + FINGERS[fn - 1].name + "), ridge count " + get(fn).count + "."
                };
                break;
            }
        }
        if (!key.value) key.source = "No loop outside the little fingers, so there is no key.";

        /* ---- Assemble ---- */
        function line(parts) {
            return parts.filter(function (s) { return s !== "" && s !== null; }).join(" ");
        }
        var numerator = line([key.value, major.num, String(primary.num), secondaryText.num, subsecondary.num, final_.num]);
        var denominator = line([major.den, String(primary.den), secondaryText.den, subsecondary.den, final_.den]);

        return {
            system: "Henry",
            primary: primary,
            secondary: secondary,
            smalls: smalls,
            secondaryText: secondaryText,
            subsecondary: subsecondary,
            secondSubsecondary: secondSubsecondary,
            major: major,
            final: final_,
            key: key,
            numerator: numerator,
            denominator: denominator,
            notes: notes,
            complete: sheet.every(isComplete)
        };
    }

    /* =====================================================================
       Whorl ridge tracing helper

       Verbatim rule: a traced ridge passing INSIDE (above) the right delta
       with three or more intervening ridges is an inner — I. Passing
       OUTSIDE (below) with three or more intervening ridges, an outer — O.
       Every other tracing is a meeting — M. [SOF]
       ===================================================================== */
    function traceFromRidges(side, ridges) {
        if (!Number.isInteger(ridges) || ridges < 0) return null;
        if (ridges < 3) return "M";
        return side === "inside" ? "I" : (side === "outside" ? "O" : "M");
    }

    /* ---------------------------------------------------------------------
       Everything at once.
       --------------------------------------------------------------------- */
    function classifyAll(sheet) {
        return {
            ncic: ncic(sheet),
            afis: afis(sheet),
            henry: henry(sheet),
            filled: sheet.filter(function (e) { return !!pattern(e && e.patternId); }).length,
            complete: sheet.every(isComplete)
        };
    }

    global.AFIS = {
        FINGERS: FINGERS,
        PATTERNS: PATTERNS,
        TRACINGS: TRACINGS,
        MIN_COUNT: MIN_COUNT,
        MAX_COUNT: MAX_COUNT,
        SUBSECONDARY: SUBSECONDARY,
        SECOND_SUB: SECOND_SUB,
        MAJOR_STANDARD: MAJOR_STANDARD,
        MAJOR_EXPANDED: MAJOR_EXPANDED,
        PRIMARY_VALUE: PRIMARY_VALUE,
        pattern: pattern,
        isLoop: isLoop,
        isWhorl: isWhorl,
        isArch: isArch,
        validCount: validCount,
        isComplete: isComplete,
        blankSheet: blankSheet,
        tracingName: tracingName,
        traceFromRidges: traceFromRidges,
        ncic: ncic,
        afis: afis,
        henry: henry,
        classifyAll: classifyAll
    };
})(typeof window !== "undefined" ? window : globalThis);
