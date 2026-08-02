/* ==========================================================================
   prints.js — which reference impressions exist, by pattern.

   Generated. Each number is a figure from the plates in the FBI's "The
   Science of Fingerprints" (a United States Government work, and so in the
   public domain). The file is assets/prints/<pattern>-<figure>.png.

   Every figure sits inside a range the manual states outright — "Figures
   122 to 133 are examples of the tented arch", and so on — and was then
   corroborated independently rather than taken on trust. A ridge
   orientation field is built for each impression and the Poincare index
   taken around every point, which locates cores and deltas the way an AFIS
   extractor does. An arch must show no delta and a loop exactly one, or the
   figure is dropped. Each was then scored for legibility, so over-inked and
   scratched impressions lose to clean ones.

   The loops are all stored at a LEFT slant, measured rather than eyeballed:
   a loop's delta lies opposite its opening, so a delta to the right of the
   core means the ridges open left. Any figure whose delta sat too near the
   core to call confidently was rejected instead of guessed — figure 99 read
   one way before quantisation and the other way after, which is exactly the
   ambiguity that gate exists to catch. Mirroring one of these therefore
   yields a genuine right-slant loop, which is what the opposite hand
   leaves.
   ========================================================================== */
(function (global) {
    "use strict";
    global.AFIS = global.AFIS || {};

    global.AFIS.PRINTS = {
        "plain-arch":     [107, 110, 111, 112, 113, 115],
        "tented-arch":    [122, 124, 127, 128, 129, 130],
        "loop":           [72, 74, 78, 80, 81, 82, 83, 89, 92, 101],
        "plain-whorl":    [196, 197, 198, 205, 206, 209],
        "central-pocket": [216, 218, 224, 226, 228, 234],
        "double-loop":    [256, 257, 261, 264, 265, 266],
        "accidental":     [269, 272, 273, 274, 277],
        /* Figure 355 is the one the manual calls entirely obliterated, which
           is precisely what SR records. The rest are partial scars. */
        "scar":           [355, 356, 357, 358, 359]
    };
})(typeof window !== "undefined" ? window : globalThis);
