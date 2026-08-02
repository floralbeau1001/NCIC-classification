/* ==========================================================================
   tests.js — rule tests for the classification engine.

   The anchor case is figure 352 of the FBI manual: a card whose ten ridge
   counts and printed classification are both reproduced in the source, so
   the whole Henry formula can be asserted end to end rather than one table
   at a time. The rest cover the edges — the lowercase d, the +50 radial
   offset, the slant mapping, the expanded major table, small-letter dashes
   and run compression, and the codes NCIC simply does not define.
   ========================================================================== */
(function () {
    "use strict";

    var A = window.AFIS;
    var results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name: name, pass: true });
        } catch (err) {
            results.push({ name: name, pass: false, message: err.message });
        }
    }

    function eq(actual, expected, what) {
        if (actual !== expected) {
            throw new Error((what ? what + ": " : "") +
                "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
        }
    }

    /* Build a sheet from compact tuples: [patternId, count, tracing]. */
    function card(rows) {
        return rows.map(function (r) {
            r = r || [];
            return {
                patternId: r[0] || null,
                count: r[1] != null ? r[1] : null,
                tracing: r[2] || null,
                finalCount: r[3] != null ? r[3] : null
            };
        });
    }

    var U = "ULNAR_LOOP", R = "RADIAL_LOOP", PA = "PLAIN_ARCH", TA = "TENTED_ARCH";
    var PW = "PLAIN_WHORL", CP = "CENTRAL_POCKET", DL = "DOUBLE_LOOP", AW = "ACCIDENTAL";

    /* =====================================================================
       Anchor case — FBI manual, figure 352.
       Printed classification:   24  L 1 R OOO 17
                                     L 1 R OOO
       Second subsecondary:      LLL over LMM
       Right thumb 24, left thumb 18, so the expanded right-thumb major
       table applies and both thumbs read L.
       ===================================================================== */
    var FIG352 = card([
        [U, 24], [R, 13], [U, 31], [U, 21], [U, 17],
        [U, 18], [R, 16], [U, 13], [U, 18], [U, 20]
    ]);

    test("fig. 352 — Henry numerator", function () {
        eq(A.henry(FIG352).numerator, "24 L 1 R OOO 17");
    });

    test("fig. 352 — Henry denominator", function () {
        eq(A.henry(FIG352).denominator, "L 1 R OOO");
    });

    test("fig. 352 — primary is 1/1, all loops", function () {
        eq(A.henry(FIG352).primary.text, "1/1");
    });

    test("fig. 352 — major division reads L over L", function () {
        var h = A.henry(FIG352);
        eq(h.major.num + "/" + h.major.den, "L/L");
    });

    test("fig. 352 — expanded major table is the one in force", function () {
        eq(A.henry(FIG352).major.table, A.MAJOR_EXPANDED);
    });

    test("fig. 352 — second subsecondary is LLL over LMM", function () {
        var h = A.henry(FIG352);
        eq(h.secondSubsecondary.num, "LLL", "numerator");
        eq(h.secondSubsecondary.den, "LMM", "denominator");
    });

    test("fig. 352 — key is the right thumb count", function () {
        eq(A.henry(FIG352).key.value, "24");
    });

    test("fig. 352 — final is the right little finger count", function () {
        var h = A.henry(FIG352);
        eq(h.final.num, "17", "numerator final");
        eq(h.final.den, "", "denominator final");
    });

    test("fig. 352 — NCIC adds 50 to the radial loops only", function () {
        eq(A.ncic(FIG352).code, "24 63 31 21 17 18 66 13 18 20");
    });

    test("fig. 352 — IAFIS slants mirror across the hands", function () {
        eq(A.afis(FIG352).code, "RS LS RS RS RS LS RS LS LS LS");
    });

    /* =====================================================================
       Second anchor — FBI manual, figure 353.
       Printed classification:   22  M 11 U OOO
                                     L  6 U OMI 13

       Worth having alongside 352 because it drives three paths that card
       does not. The left thumb counts 18, so the right thumb reads on the
       expanded table and lands on M rather than L. Neither little finger
       carries a loop on the right, so the final falls through to the left
       little finger and is written in the denominator. And the whorls sit
       in the subsecondary, where their tracings pass straight through.

         1 ulnar 22   2 ulnar 11   3 ulnar 19   4 whorl O   5 whorl O
         6 ulnar 18   7 ulnar 10   8 whorl M    9 whorl I  10 ulnar 13
       ===================================================================== */
    var FIG353 = card([
        [U, 22], [U, 11], [U, 19], [PW, null, "O"], [PW, null, "O"],
        [U, 18], [U, 10], [PW, null, "M"], [PW, null, "I"], [U, 13]
    ]);

    test("fig. 353 — Henry numerator", function () {
        eq(A.henry(FIG353).numerator, "22 M 11 U OOO");
    });

    test("fig. 353 — Henry denominator", function () {
        eq(A.henry(FIG353).denominator, "L 6 U OMI 13");
    });

    test("fig. 353 — primary counts whorls even over odd", function () {
        eq(A.henry(FIG353).primary.text, "11/6");
    });

    test("fig. 353 — expanded major table lands on M, not L", function () {
        var h = A.henry(FIG353);
        eq(h.major.num, "M", "right thumb 22 is 18-22 on the expanded table");
        eq(h.major.den, "L", "left thumb 18");
        eq(h.major.table, A.MAJOR_EXPANDED);
    });

    test("fig. 353 — whorl tracings pass into the subsecondary", function () {
        var h = A.henry(FIG353);
        eq(h.subsecondary.num, "OOO");
        eq(h.subsecondary.den, "OMI");
    });

    test("fig. 353 — final falls to the left little finger", function () {
        var h = A.henry(FIG353);
        eq(h.final.num, "", "right little is a whorl, so nothing here");
        eq(h.final.den, "13");
    });

    /* =====================================================================
       Third card — FBI manual, figure 350.
       Printed classification:   26  5 R OOO 12
                                     12 W MOI

       The transcription of this figure does not print a major division, so
       the assembled line cannot be compared directly; the divisions it does
       print are asserted individually instead.

         1 ulnar 26   2 radial 12  3 whorl O   4 ulnar 17  5 ulnar 12
         6 whorl I    7 whorl M    8 ulnar 18  9 whorl I  10 ulnar 15
       ===================================================================== */
    var FIG350 = card([
        [U, 26], [R, 12], [PW, null, "O"], [U, 17], [U, 12],
        [PW, null, "I"], [PW, null, "M"], [U, 18], [PW, null, "I"], [U, 15]
    ]);

    test("fig. 350 — primary is 5 over 12", function () {
        eq(A.henry(FIG350).primary.text, "5/12");
    });

    test("fig. 350 — secondary is a radial index over a whorl", function () {
        var h = A.henry(FIG350);
        eq(h.secondaryText.num, "R");
        eq(h.secondaryText.den, "W");
    });

    test("fig. 350 — subsecondary mixes loop counts with whorl tracings", function () {
        var h = A.henry(FIG350);
        eq(h.subsecondary.num, "OOO");
        eq(h.subsecondary.den, "MOI");
    });

    test("fig. 350 — key 26, final 12", function () {
        var h = A.henry(FIG350);
        eq(h.key.value, "26");
        eq(h.final.num, "12");
    });

    /* =====================================================================
       Fourth card — FBI manual, figure 349.
       Printed classification:   1 R
                                 1 aU

       An all-loop card with an arch in the left thumb, which is where the
       small letter goes: immediately left of the index capital, in the
       denominator because that is the hand it sits on.
       ===================================================================== */
    var FIG349 = card([
        [U, 14], [R, 12], [U, 11], [U, 13], [U, 9],
        [PA], [U, 10], [U, 12], [U, 11], [U, 13]
    ]);

    test("fig. 349 — an all-loop card is primary 1 over 1", function () {
        eq(A.henry(FIG349).primary.text, "1/1");
    });

    test("fig. 349 — the thumb arch sits left of the index capital", function () {
        var h = A.henry(FIG349);
        eq(h.secondaryText.num, "R", "numerator carries no small letter");
        eq(h.secondaryText.den, "aU", "arch in the left thumb, then the index");
    });

    /* =====================================================================
       NCIC coding
       ===================================================================== */

    test("double loop whorl uses a LOWERCASE d", function () {
        var s = card([[DL, null, "I"], [DL, null, "M"], [DL, null, "O"]].concat(new Array(7)));
        var r = A.ncic(s);
        eq(r.rows[0].code, "dI");
        eq(r.rows[1].code, "dM");
        eq(r.rows[2].code, "dO");
    });

    test("the other three whorls use uppercase prefixes", function () {
        var s = card([[PW, null, "I"], [CP, null, "M"], [AW, null, "O"]].concat(new Array(7)));
        var r = A.ncic(s);
        eq(r.rows[0].code, "PI");
        eq(r.rows[1].code, "CM");
        eq(r.rows[2].code, "XO");
    });

    test("ulnar counts below ten are zero padded", function () {
        eq(A.ncic(card([[U, 9]])).rows[0].code, "09");
    });

    test("radial counts sit in the 51-99 band", function () {
        eq(A.ncic(card([[R, 1]])).rows[0].code, "51", "lowest");
        eq(A.ncic(card([[R, 49]])).rows[0].code, "99", "highest");
    });

    test("arches, amputation and scarring are literal codes", function () {
        var r = A.ncic(card([[PA], [TA], ["AMPUTATED"], ["SCARRED"]]));
        eq(r.rows[0].code, "AA");
        eq(r.rows[1].code, "TT");
        eq(r.rows[2].code, "XX");
        eq(r.rows[3].code, "SR");
    });

    test("NCIC has no code for the AFIS-only UC and UP", function () {
        var r = A.ncic(card([["UNCLASSIFIABLE"], ["UNPRINTABLE"]]));
        eq(r.rows[0].code, null, "UC");
        eq(r.rows[1].code, null, "UP");
        eq(r.rows[0].status, "unrepresentable");
        eq(r.unrepresentable.length, 2, "both flagged");
    });

    test("a ridge count outside 1-49 is refused rather than coded", function () {
        eq(A.validCount(0), false, "zero");
        eq(A.validCount(50), false, "fifty");
        eq(A.validCount(1), true, "one");
        eq(A.validCount(49), true, "forty-nine");
        eq(A.ncic(card([[U, 0]])).rows[0].code, null, "no code emitted for zero");
    });

    /* =====================================================================
       AFIS pattern level
       ===================================================================== */

    test("slant mapping covers all four hand-and-loop combinations", function () {
        var s = card([[U, 10], null, null, null, null, [U, 10]]);
        s[6] = { patternId: R, count: 10, tracing: null, finalCount: null };
        s[1] = { patternId: R, count: 10, tracing: null, finalCount: null };
        var r = A.afis(s);
        eq(r.rows[0].code, "RS", "right hand ulnar");
        eq(r.rows[1].code, "LS", "right hand radial");
        eq(r.rows[5].code, "LS", "left hand ulnar");
        eq(r.rows[6].code, "RS", "left hand radial");
    });

    test("all arches collapse to AU and all whorls to WU", function () {
        var r = A.afis(card([[PA], [TA], [PW, null, "I"], [CP, null, "M"], [DL, null, "O"], [AW, null, "I"]]));
        eq(r.rows[0].code, "AU");
        eq(r.rows[1].code, "AU");
        ["WU", "WU", "WU", "WU"].forEach(function (want, k) {
            eq(r.rows[k + 2].code, want, "whorl " + k);
        });
    });

    /* =====================================================================
       Henry
       ===================================================================== */

    test("primary runs from 1/1 to 32/32", function () {
        var allLoops = card([[U,10],[U,10],[U,10],[U,10],[U,10],[U,10],[U,10],[U,10],[U,10],[U,10]]);
        eq(A.henry(allLoops).primary.text, "1/1", "all loops");

        var allWhorls = card(new Array(10).fill([PW, null, "M"]));
        eq(A.henry(allWhorls).primary.text, "32/32", "all whorls");
    });

    test("primary places even fingers over odd", function () {
        /* A whorl on finger 2 only: numerator 1+16, denominator 1. */
        var s = card([null, [PW, null, "M"]]);
        eq(A.henry(s).primary.text, "17/1");
        /* A whorl on finger 1 only: the value falls to the denominator. */
        eq(A.henry(card([[PW, null, "M"]])).primary.text, "1/17");
    });

    test("subsecondary cutoffs differ by finger position", function () {
        /* Index 1-9 = I; middle 1-10 = I; ring 1-13 = I. */
        var inner = card([null, [U, 9], [U, 10], [U, 13]]);
        eq(A.henry(inner).subsecondary.num, "III", "at the top of each inner band");

        var outer = card([null, [U, 10], [U, 11], [U, 14]]);
        eq(A.henry(outer).subsecondary.num, "OOO", "one past each");
    });

    test("whorl tracings pass straight into the subsecondary", function () {
        var s = card([null, [PW, null, "I"], [CP, null, "M"], [AW, null, "O"]]);
        eq(A.henry(s).subsecondary.num, "IMO");
    });

    test("major uses the standard thumb table when the left thumb is under 17", function () {
        var s = card([[U, 17], null, null, null, null, [U, 16]]);
        var h = A.henry(s);
        eq(h.major.den, "M", "left thumb 16");
        eq(h.major.num, "L", "right thumb 17 on the standard table");
        eq(h.major.table, A.MAJOR_STANDARD);
    });

    test("major switches to the expanded table when the left thumb is 17 or more", function () {
        var s = card([[U, 17], null, null, null, null, [U, 17]]);
        var h = A.henry(s);
        eq(h.major.den, "L", "left thumb 17");
        eq(h.major.num, "S", "right thumb 17 now falls in the 1-17 small band");
        eq(h.major.table, A.MAJOR_EXPANDED);
    });

    test("a whorl in the left thumb leaves the right thumb on the standard table", function () {
        var s = card([[U, 17], null, null, null, null, [PW, null, "O"]]);
        var h = A.henry(s);
        eq(h.major.den, "O", "tracing carries through");
        eq(h.major.num, "L", "17 is large on the standard table");
    });

    test("small letters sit in their true positions with dashes for the gaps", function () {
        /* a U a - t  over  R - a */
        var s = card([
            [PA], [U, 10], [PA], [U, 10], [TA],
            [U, 10], [R, 10], [U, 10], [PA], [U, 10]
        ]);
        var h = A.henry(s);
        eq(h.secondaryText.num, "aUa-t", "numerator");
        eq(h.secondaryText.den, "R-a", "denominator");
    });

    test("runs of the same small letter are compressed", function () {
        /* r U - 2a : radial thumb, then a gap, then two adjacent arches. */
        var s = card([[R, 10], [U, 10], [U, 10], [PA], [PA]]);
        eq(A.henry(s).secondaryText.num, "rU-2a");
    });

    test("a radial loop in an index finger is a capital, never a small letter", function () {
        var s = card([[U, 10], [R, 12]]);
        var h = A.henry(s);
        eq(h.secondary.num, "R", "capital in the secondary");
        eq(h.secondaryText.num, "R", "no stray small letter");
    });

    test("trailing gaps after the last small letter are not written", function () {
        /* An arch in the middle finger, plain loops after it. */
        var s = card([[U, 10], [U, 10], [PA], [U, 10], [U, 10]]);
        eq(A.henry(s).secondaryText.num, "Ua");
    });

    test("the key skips the little fingers", function () {
        /* No loop until finger 4; the right little finger is never the key. */
        var s = card([[PW, null, "M"], [PA], [TA], [U, 7], [U, 3]]);
        eq(A.henry(s).key.value, "7");
    });

    test("the final falls to the left little finger when the right has no loop", function () {
        var s = card([
            [U, 10], null, null, null, [PW, null, "M"],
            null, null, null, null, [U, 12]
        ]);
        var h = A.henry(s);
        eq(h.final.num, "", "nothing in the numerator");
        eq(h.final.den, "12", "left little finger supplies it");
    });

    test("a little-finger whorl can supply the final when neither little finger loops", function () {
        var s = card([
            [U, 10], null, null, null, [PW, null, "M", 14],
            null, null, null, null, [PW, null, "M"]
        ]);
        eq(A.henry(s).final.num, "14");
    });

    test("two arches in the little fingers means no final at all", function () {
        var s = card([[U, 10], null, null, null, [PA], null, null, null, null, [TA]]);
        var h = A.henry(s);
        eq(h.final.num, "");
        eq(h.final.den, "");
    });

    /* =====================================================================
       Whorl tracing rule
       ===================================================================== */

    test("tracing needs three or more intervening ridges to leave M", function () {
        eq(A.traceFromRidges("inside", 0), "M");
        eq(A.traceFromRidges("inside", 2), "M", "two is still meeting");
        eq(A.traceFromRidges("inside", 3), "I", "three inside is inner");
        eq(A.traceFromRidges("outside", 2), "M");
        eq(A.traceFromRidges("outside", 3), "O", "three outside is outer");
        eq(A.traceFromRidges("outside", 12), "O");
    });

    /* =====================================================================
       Completeness
       ===================================================================== */

    test("a whorl without a tracing is incomplete", function () {
        eq(A.isComplete({ patternId: PW, tracing: null }), false);
        eq(A.isComplete({ patternId: PW, tracing: "M" }), true);
    });

    test("a loop without a count is incomplete", function () {
        eq(A.isComplete({ patternId: U, count: null }), false);
        eq(A.isComplete({ patternId: U, count: 5 }), true);
    });

    test("an amputation needs nothing further", function () {
        eq(A.isComplete({ patternId: "AMPUTATED" }), true);
    });

    /* --- report ---------------------------------------------------------- */

    function report() {
        var host = document.getElementById("results");
        var passed = results.filter(function (r) { return r.pass; }).length;
        var total = results.length;

        var summary = document.getElementById("summary");
        summary.textContent = passed + " of " + total + " passing";
        summary.setAttribute("data-state", passed === total ? "pass" : "fail");

        results.forEach(function (r) {
            var row = document.createElement("li");
            row.className = "t " + (r.pass ? "t-pass" : "t-fail");
            var mark = document.createElement("span");
            mark.className = "t-mark";
            mark.textContent = r.pass ? "PASS" : "FAIL";
            var name = document.createElement("span");
            name.className = "t-name";
            name.textContent = r.name;
            row.appendChild(mark);
            row.appendChild(name);
            if (!r.pass) {
                var msg = document.createElement("span");
                msg.className = "t-msg";
                msg.textContent = r.message;
                row.appendChild(msg);
            }
            host.appendChild(row);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", report);
    } else {
        report();
    }
})();
