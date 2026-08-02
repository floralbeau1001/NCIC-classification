/* ==========================================================================
   patterns.js — the impressions shown in the print boxes.

   These are the FBI's own reference exemplars, cut from the plates in "The
   Science of Fingerprints" (a United States Government work, and so in the
   public domain). Each has been reduced to an alpha channel — ink opaque,
   paper transparent — and is painted through a CSS mask rather than shown
   as an image, so the impression takes the ink colour of whichever theme is
   running instead of being stuck as black on white.

   Figures used:
     plain arch      109      plain whorl            211
     tented arch     128      central pocket loop    238
     loop             74      double loop whorl      255
                              accidental whorl       276

   One loop plate serves both slants. Figure 74 recurves down and to the
   left — a left-slant loop — so a right slant is the same impression
   mirrored, which is exactly what the opposite hand would leave.

   The four unusable-impression states have no exemplar to show, because
   there is no pattern: those boxes are annotated the way a card would be.
   ========================================================================== */
(function (global) {
    "use strict";

    var DIR = "assets/patterns/";

    /* Prefer the inlined copies from plates.js. CSS mask-image is subject to
       CORS, so a mask referenced by path is blocked outright when the page is
       opened as a file:// document and every print box comes up empty; data
       URIs are exempt.

       Falling back to a path: a relative url() inside a custom property is
       resolved against the stylesheet that consumes it, not the document,
       which would look for assets/assets/patterns/. Resolving against the
       document base up front sidesteps that. */
    function plateUrl(file) {
        var inlined = global.AFIS && global.AFIS.PLATE_DATA;
        if (inlined && inlined[file]) return inlined[file];
        try {
            return new URL(DIR + file + ".png", document.baseURI).href;
        } catch (e) {
            return DIR + file + ".png";
        }
    }

    /* patternId -> [file, mirrorable] */
    var PLATES = {
        PLAIN_ARCH:     "plain-arch",
        TENTED_ARCH:    "tented-arch",
        ULNAR_LOOP:     "loop",
        RADIAL_LOOP:    "loop",
        PLAIN_WHORL:    "plain-whorl",
        CENTRAL_POCKET: "central-pocket",
        DOUBLE_LOOP:    "double-loop",
        ACCIDENTAL:     "accidental",
        /* Scarring is shown over a real impression: the ridges are there,
           the pattern is not recoverable. */
        SCARRED:        "double-loop",
        UNCLASSIFIABLE: "accidental"
    };

    function inkLayer(file, mirror, extraClass) {
        return '<span class="print-ink' + (extraClass ? " " + extraClass : "") + '"' +
               (mirror ? ' data-mirror="true"' : "") +
               ' style="--impression:url(&quot;' + plateUrl(file) + '&quot;)"></span>';
    }

    function annotation(kind, label) {
        return '<span class="print-note" data-kind="' + kind + '">' +
               '<span class="print-note-label">' + label + "</span></span>";
    }

    /* Returns the inner HTML for one print box. `opts.slant` is "left" or
       "right" and decides whether a loop plate is mirrored. */
    function render(patternId, opts) {
        opts = opts || {};
        var file = PLATES[patternId];
        var mirror = false;

        if (patternId === "ULNAR_LOOP" || patternId === "RADIAL_LOOP") {
            mirror = opts.slant === "right";
        }

        if (patternId === "AMPUTATED") {
            return annotation("amputated", "XX");
        }
        if (patternId === "UNPRINTABLE") {
            return annotation("unprinted", "UP");
        }
        if (!file) {
            return "";
        }

        var html = inkLayer(file, mirror, patternId === "SCARRED" ? "is-scarred" : "");

        if (patternId === "SCARRED") {
            html += '<span class="print-scar" aria-hidden="true">' +
                    '<i></i><i></i><i></i></span>';
        }
        if (patternId === "UNCLASSIFIABLE") {
            html += '<span class="print-smudge" aria-hidden="true"></span>' +
                    annotation("unclassifiable", "UC");
        }
        return html;
    }

    function placeholder() {
        return '<span class="print-empty" aria-hidden="true"></span>';
    }

    /* Warm the cache so the first pattern picked does not flash an empty
       box. A no-op when the plates are inlined — they are already here. */
    function preload() {
        if (global.AFIS && global.AFIS.PLATE_DATA) return;
        var seen = {};
        Object.keys(PLATES).forEach(function (k) {
            var f = PLATES[k];
            if (seen[f]) return;
            seen[f] = true;
            var img = new Image();
            img.src = plateUrl(f);
        });
    }

    global.AFIS = global.AFIS || {};
    global.AFIS.diagram = render;
    global.AFIS.diagramPlaceholder = placeholder;
    global.AFIS.preloadPlates = preload;
})(typeof window !== "undefined" ? window : globalThis);
