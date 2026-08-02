/* ==========================================================================
   patterns.js — the impressions shown in the print boxes.

   These are the FBI's own reference exemplars, cut from the plates in "The
   Science of Fingerprints" (a United States Government work, public
   domain). prints.js lists which figures survived verification; this file
   decides which one each box gets.

   Two things matter here.

   No card repeats a print. A real ten-print card has ten different
   impressions, so showing one exemplar per pattern — the same whorl in
   every whorl box — reads as obviously fake. Each pattern therefore has
   several verified exemplars and the box number picks between them, so
   a card of ten ulnar loops shows ten different loops. The choice is
   deterministic, so the same card always looks the same.

   Loops are handed. Every stored loop is a left slant; a right slant is
   the same impression mirrored, which is what the opposite hand leaves.

   Plain <img> elements rather than CSS masks: mask-image is CORS-checked
   and is blocked outright on a file:// page, which left every box empty.
   Images are not, so the page works double-clicked as well as served. The
   dark theme inverts them, turning ink-on-paper into a lit negative.
   ========================================================================== */
(function (global) {
    "use strict";

    var DIR = "assets/prints/";

    /* Which plate set each pattern draws from. Scarring shows a genuinely
       scarred impression rather than an unscarred one with marks drawn over
       it; figure 355, the obliterated one, is reserved for SR. */
    var SOURCE = {
        PLAIN_ARCH:     "plain-arch",
        TENTED_ARCH:    "tented-arch",
        ULNAR_LOOP:     "loop",
        RADIAL_LOOP:    "loop",
        PLAIN_WHORL:    "plain-whorl",
        CENTRAL_POCKET: "central-pocket",
        DOUBLE_LOOP:    "double-loop",
        ACCIDENTAL:     "accidental",
        SCARRED:        "scar",
        UNCLASSIFIABLE: "scar"
    };

    function plates(kind) {
        var all = (global.AFIS && global.AFIS.PRINTS) || {};
        return all[kind] || [];
    }

    /* Figure 355 is "entirely obliterated" — no pattern survives — so it is
       what a completely scarred finger shows. The partial scars are what an
       examiner might still fail to classify. */
    function figureFor(patternId, slot) {
        var kind = SOURCE[patternId];
        var list = plates(kind);
        if (!list.length) return null;

        if (patternId === "SCARRED") return 355;
        if (patternId === "UNCLASSIFIABLE") {
            var partial = list.filter(function (f) { return f !== 355; });
            return partial[slot % partial.length];
        }
        return list[slot % list.length];
    }

    function url(kind, figure) {
        var rel = DIR + kind + "-" + figure + ".png";
        try {
            return new URL(rel, document.baseURI).href;
        } catch (e) {
            return rel;
        }
    }

    /* Returns the inner HTML for one print box.
         opts.slot   the box number, so neighbouring fingers differ
         opts.slant  "left" or "right"; mirrors a loop plate
         opts.alt    accessible description */
    function render(patternId, opts) {
        opts = opts || {};
        var slot = opts.slot || 0;

        if (patternId === "AMPUTATED")  return annotation("amputated", "XX");
        if (patternId === "UNPRINTABLE") return annotation("unprinted", "UP");

        var kind = SOURCE[patternId];
        var fig = figureFor(patternId, slot);
        if (!kind || fig == null) return "";

        var mirror = (patternId === "ULNAR_LOOP" || patternId === "RADIAL_LOOP")
            && opts.slant === "right";

        return '<img class="print-ink" alt="" aria-hidden="true" draggable="false"' +
               (mirror ? ' data-mirror="true"' : "") +
               ' data-figure="' + fig + '"' +
               ' src="' + url(kind, fig) + '">';
    }

    function annotation(kind, label) {
        return '<span class="print-note" data-kind="' + kind + '">' +
               '<span class="print-note-label">' + label + "</span></span>";
    }

    function placeholder() {
        return '<span class="print-empty" aria-hidden="true"></span>';
    }

    /* The figure number behind a box, for the loupe caption and the
       attribution line. */
    function figureOf(patternId, slot) {
        return figureFor(patternId, slot);
    }

    /* Every impression, flattened — the practice mode draws from this. */
    function catalogue() {
        var out = [];
        Object.keys(SOURCE).forEach(function (id) {
            if (id === "UNCLASSIFIABLE") return;   // same plates as SCARRED
            var kind = SOURCE[id];
            plates(kind).forEach(function (fig) {
                if (id === "SCARRED" && fig !== 355) return;
                out.push({ patternId: id, kind: kind, figure: fig, src: url(kind, fig) });
            });
        });
        return out;
    }

    function preload() {
        Object.keys(SOURCE).forEach(function (id) {
            var kind = SOURCE[id];
            plates(kind).slice(0, 3).forEach(function (fig) {
                var img = new Image();
                img.src = url(kind, fig);
            });
        });
    }

    global.AFIS = global.AFIS || {};
    global.AFIS.diagram = render;
    global.AFIS.diagramPlaceholder = placeholder;
    global.AFIS.printFigure = figureOf;
    global.AFIS.printCatalogue = catalogue;
    global.AFIS.printUrl = url;
    global.AFIS.preloadPlates = preload;
})(typeof window !== "undefined" ? window : globalThis);
