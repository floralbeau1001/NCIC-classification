/* ==========================================================================
   app.js — the bench.

   Owns a single array of ten finger entries. Every interaction mutates that
   array and calls recompute(); nothing else holds state. The classification
   itself lives in classify.js and is never touched here.
   ========================================================================== */
(function () {
    "use strict";

    var A = window.AFIS;
    var STORE_KEY = "tenprint-bench:v1";
    var THEME_KEY = "tenprint-bench:theme";

    var sheet = A.blankSheet();
    var subject = "";
    var reference = "";
    var exampleIndex = 0;

    var $ = function (id) { return document.getElementById(id); };

    /* ---------------------------------------------------------------------
       Worked examples. The first is transcribed from the classification
       chart in the FBI manual and is the same card the rule tests assert
       against — load it and the Henry line should read 24 L 1 R OOO 17 over
       L 1 R OOO. The second is constructed to exercise the parts the first
       does not: whorl tracings, the lowercase d, and the small-letter group.
       --------------------------------------------------------------------- */
    var EXAMPLES = [
        {
            label: "FBI manual, fig. 352",
            subject: "FBI manual — figure 352",
            reference: "Science of Fingerprints",
            entries: [
                ["ULNAR_LOOP", 24], ["RADIAL_LOOP", 13], ["ULNAR_LOOP", 31],
                ["ULNAR_LOOP", 21], ["ULNAR_LOOP", 17], ["ULNAR_LOOP", 18],
                ["RADIAL_LOOP", 16], ["ULNAR_LOOP", 13], ["ULNAR_LOOP", 18],
                ["ULNAR_LOOP", 20]
            ]
        },
        {
            label: "Mixed card",
            subject: "Mixed demonstration card",
            reference: "constructed",
            entries: [
                ["PLAIN_WHORL", null, "O"], ["TENTED_ARCH"], ["ULNAR_LOOP", 9],
                ["DOUBLE_LOOP", null, "I"], ["PLAIN_ARCH"], ["RADIAL_LOOP", 14],
                ["ULNAR_LOOP", 8], ["CENTRAL_POCKET", null, "M"],
                ["ACCIDENTAL", null, "O"], ["ULNAR_LOOP", 11]
            ]
        }
    ];

    /* --- helpers --------------------------------------------------------- */

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    var toastTimer;
    function toast(message) {
        var t = $("toast");
        t.textContent = message;
        t.setAttribute("data-show", "true");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.setAttribute("data-show", "false"); }, 1800);
    }

    function copyText(text, what) {
        var done = function () { toast(what + " copied"); };
        var fail = function () { toast("Could not copy"); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fail);
        } else {
            var ta = el("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); } catch (e) { fail(); }
            ta.remove();
        }
    }

    /* The drawn slant must agree with the code the engine derives: an ulnar
       loop slants right on the right hand, left on the left, and a radial
       loop the other way about. */
    function slantFor(patternId, finger) {
        var right = finger.hand === "right";
        if (patternId === "ULNAR_LOOP")  return right ? "right" : "left";
        if (patternId === "RADIAL_LOOP") return right ? "left" : "right";
        return "right";
    }

    /* --- building the card ----------------------------------------------- */

    function buildCard() {
        ["right", "left"].forEach(function (hand) {
            var host = document.querySelector('[data-slots="' + hand + '"]');
            host.textContent = "";
            A.FINGERS.filter(function (f) { return f.hand === hand; })
                     .forEach(function (finger) { host.appendChild(buildFinger(finger)); });
        });
    }

    function buildFinger(finger) {
        var i = finger.n - 1;
        var cell = el("article", "finger");
        cell.setAttribute("data-finger", finger.n);

        var head = el("header", "finger-head");
        head.appendChild(el("span", "finger-no", String(finger.n)));
        head.appendChild(el("span", "finger-name", finger.short));
        cell.appendChild(head);

        var plate = el("div", "finger-plate");
        plate.appendChild(el("div", "plate-art"));
        var badge = el("span", "finger-code");
        plate.appendChild(badge);
        cell.appendChild(plate);

        var controls = el("div", "finger-controls");

        var select = el("select", "pattern-select");
        select.id = "pattern-" + finger.n;
        select.setAttribute("aria-label", "Pattern for finger " + finger.n + ", " + finger.name);
        var blank = el("option", null, "Select pattern…");
        blank.value = "";
        select.appendChild(blank);

        [["arch", "Arches"], ["loop", "Loops"], ["whorl", "Whorls"], ["special", "Not classifiable"]]
            .forEach(function (pair) {
                var group = document.createElement("optgroup");
                group.label = pair[1];
                A.PATTERNS.filter(function (p) { return p.group === pair[0]; })
                          .forEach(function (p) {
                              var opt = el("option", null, p.name);
                              opt.value = p.id;
                              group.appendChild(opt);
                          });
                select.appendChild(group);
            });

        select.addEventListener("change", function () {
            sheet[i].patternId = select.value || null;
            sheet[i].count = null;
            sheet[i].tracing = null;
            sheet[i].finalCount = null;
            renderExtras(cell, finger);
            recompute();
        });

        controls.appendChild(select);
        controls.appendChild(el("div", "finger-extras"));
        cell.appendChild(controls);

        return cell;
    }

    /* Rebuilds only the conditional inputs for one finger. Called on pattern
       change, never on keystroke, so focus is never stolen mid-typing. */
    function renderExtras(cell, finger) {
        var i = finger.n - 1;
        var host = cell.querySelector(".finger-extras");
        var p = A.pattern(sheet[i].patternId);
        host.textContent = "";
        if (!p) return;

        if (p.needs === "count") {
            host.appendChild(countInput(i, finger, "count",
                "Ridge count " + A.MIN_COUNT + "–" + A.MAX_COUNT,
                "Ridge count for finger " + finger.n));
        }

        if (p.needs === "tracing") {
            var group = el("div", "tracing");
            group.setAttribute("role", "group");
            group.setAttribute("aria-label", "Ridge tracing for finger " + finger.n);
            A.TRACINGS.forEach(function (t) {
                var b = el("button", null, t.value);
                b.type = "button";
                b.title = t.full;
                b.setAttribute("aria-pressed", sheet[i].tracing === t.value ? "true" : "false");
                b.addEventListener("click", function () {
                    sheet[i].tracing = sheet[i].tracing === t.value ? null : t.value;
                    Array.prototype.forEach.call(group.children, function (btn) {
                        btn.setAttribute("aria-pressed", btn.textContent === sheet[i].tracing ? "true" : "false");
                    });
                    recompute();
                });
                group.appendChild(b);
            });
            host.appendChild(group);

            /* A whorl in a little finger can supply the Henry final when
               neither little finger carries a loop, so offer the count. */
            if (finger.slot === "little") {
                host.appendChild(countInput(i, finger, "finalCount",
                    "Final count (optional)",
                    "Delta to core count for the Henry final, finger " + finger.n));
            }
        }
    }

    function countInput(i, finger, key, placeholder, label) {
        var input = el("input");
        input.type = "number";
        input.min = A.MIN_COUNT;
        input.max = A.MAX_COUNT;
        input.step = 1;
        input.inputMode = "numeric";
        input.placeholder = placeholder;
        input.setAttribute("aria-label", label);
        if (sheet[i][key] != null) input.value = sheet[i][key];

        input.addEventListener("input", function () {
            var v = parseInt(input.value, 10);
            sheet[i][key] = Number.isNaN(v) ? null : v;
            recompute();
        });
        /* Snap out-of-range entries once the value is committed, so a typed
           0 or a spinner run to the floor can never reach a code. */
        input.addEventListener("change", function () {
            if (input.value === "") { sheet[i][key] = null; recompute(); return; }
            var v = Math.round(Number(input.value));
            if (!Number.isFinite(v) || v < A.MIN_COUNT) v = A.MIN_COUNT;
            if (v > A.MAX_COUNT) v = A.MAX_COUNT;
            input.value = v;
            sheet[i][key] = v;
            recompute();
        });
        return input;
    }

    /* --- rendering ------------------------------------------------------- */

    function recompute() {
        var result = A.classifyAll(sheet);
        renderCells(result);
        renderRail(result);
        renderBreakdown(result);
        renderHenry(result.henry);
        renderStamp(result);
        save();
    }

    function renderCells(result) {
        A.FINGERS.forEach(function (finger, i) {
            var cell = document.querySelector('[data-finger="' + finger.n + '"]');
            if (!cell) return;

            var entry = sheet[i];
            var p = A.pattern(entry.patternId);
            var art = cell.querySelector(".plate-art");

            var want = entry.patternId ? entry.patternId + ":" + slantFor(entry.patternId, finger) : "";
            if (art.getAttribute("data-drawn") !== want) {
                art.innerHTML = p
                    ? A.diagram(entry.patternId, { slant: slantFor(entry.patternId, finger) })
                    : A.diagramPlaceholder();
                art.setAttribute("data-drawn", want);
            }

            var row = result.ncic.rows[i];
            var badge = cell.querySelector(".finger-code");
            badge.textContent = row.code || "··";
            badge.setAttribute("data-empty", row.code ? "false" : "true");

            var select = cell.querySelector(".pattern-select");
            if (select.value !== (entry.patternId || "")) select.value = entry.patternId || "";

            var status = !p ? "empty" : (A.isComplete(entry) ? "ok" : "incomplete");
            cell.setAttribute("data-status", status);

            var extras = cell.querySelector(".finger-extras");
            var hint = extras.querySelector(".hint");
            if (status === "incomplete") {
                if (!hint) {
                    hint = el("p", "hint", p.needs === "count" ? "Count required" : "Tracing required");
                    extras.appendChild(hint);
                } else {
                    hint.textContent = p.needs === "count" ? "Count required" : "Tracing required";
                }
            } else if (hint) {
                hint.remove();
            }
        });
    }

    function renderRail(result) {
        $("ncicCode").textContent = result.ncic.code;
        $("afisCode").textContent = result.afis.code;

        /* On an untouched card the Henry line would read "- 1 - ---", which
           is technically what an all-blank sheet computes to but reads as
           noise. Show nothing until there is something to show. */
        var h = result.henry;
        var blank = result.filled === 0;
        $("henryNum").textContent = blank ? "—" : (h.numerator || "—");
        $("henryDen").textContent = blank ? "—" : (h.denominator || "—");

        $("ncicNote").textContent = result.ncic.complete
            ? "20 characters · complete"
            : "20 characters · right thumb first";
        $("afisNote").textContent = result.afis.complete
            ? "Pattern level · complete"
            : "AU · WU · RS · LS · SR · XX · UC · UP";
        $("henryNote").textContent = "primary " + h.primary.text +
            (h.secondSubsecondary.num.replace(/-/g, "") || h.secondSubsecondary.den.replace(/-/g, "")
                ? " · 2nd sub " + h.secondSubsecondary.num + "/" + h.secondSubsecondary.den
                : "");

        var done = sheet.filter(A.isComplete).length;
        $("meterFill").style.width = (done * 10) + "%";
        $("meter").setAttribute("aria-valuenow", done);
        $("meterLabel").textContent = done;
    }

    function renderStamp(result) {
        var stamp = $("stamp");
        var span = stamp.querySelector("span");
        if (result.filled === 0) {
            stamp.setAttribute("data-state", "empty");
            span.textContent = "No entries";
        } else if (result.complete) {
            stamp.setAttribute("data-state", "complete");
            span.textContent = "Classified";
        } else if (result.filled === 10) {
            stamp.setAttribute("data-state", "incomplete");
            span.textContent = "Data missing";
        } else {
            stamp.setAttribute("data-state", "partial");
            span.textContent = result.filled + " of 10";
        }
    }

    function renderBreakdown(result) {
        var body = $("breakdownBody");
        body.textContent = "";

        A.FINGERS.forEach(function (finger, i) {
            var n = result.ncic.rows[i];
            var f = result.afis.rows[i];
            var tr = el("tr");

            tr.appendChild(el("td", "mono void", String(finger.n)));
            tr.appendChild(el("th", "fname", finger.name)).setAttribute("scope", "row");
            tr.appendChild(el("td", "detail", n.detail));

            var nc = el("td", "mono" + (n.code ? "" : " void"), n.code || "··");
            tr.appendChild(nc);
            var fc = el("td", "mono cool" + (f.code ? "" : " void"), f.code || "··");
            tr.appendChild(fc);

            body.appendChild(tr);
        });

        renderFlags(result);
    }

    function renderFlags(result) {
        var host = $("flags");
        host.textContent = "";

        function flag(kind, title, text) {
            var f = el("div", "flag");
            f.setAttribute("data-kind", kind);
            f.appendChild(el("strong", null, title));
            f.appendChild(el("span", null, text));
            host.appendChild(f);
        }

        result.ncic.unrepresentable.forEach(function (row) {
            flag("warn", "Finger " + row.finger.n + ":",
                 row.finger.name + " is recorded with an AFIS-only code. The NCIC FPC table " +
                 "defines no equivalent, so that position is left blank rather than guessed.");
        });

        var missing = sheet
            .map(function (e, i) { return A.pattern(e.patternId) && !A.isComplete(e) ? A.FINGERS[i] : null; })
            .filter(Boolean);
        if (missing.length) {
            flag("warn", "Incomplete:",
                 missing.map(function (f) { return f.name; }).join(", ") +
                 " " + (missing.length === 1 ? "needs" : "need") +
                 " a ridge count or a whorl tracing before the codes are valid.");
        }

        result.henry.notes.forEach(function (note) {
            flag("info", "Henry:", note);
        });
        if (result.henry.key.source)   flag("info", "Key:", result.henry.key.source);
        if (result.henry.final.source) flag("info", "Final:", result.henry.final.source);

        if (result.complete) {
            flag("ok", "Complete.", "All ten fingers carry a pattern and every value they " +
                 "require. The three formulas above are fully determined.");
        }
    }

    function renderHenry(h) {
        var host = $("henryGrid");
        host.textContent = "";

        function cell(title, num, den, prose) {
            var c = el("div", "hcell");
            c.appendChild(el("h4", null, title));
            var v = el("div", "value");
            v.appendChild(document.createTextNode(num || "—"));
            if (den != null) {
                v.appendChild(el("span", "over", "/"));
                v.appendChild(document.createTextNode(den || "—"));
            }
            c.appendChild(v);
            if (prose) c.appendChild(el("p", null, prose));
            host.appendChild(c);
        }

        cell("Primary", String(h.primary.num), String(h.primary.den),
             "Whorls only: 16 16 8 8 4 4 2 2 1 1, even fingers over odd, plus one each. " +
             "Runs 1/1 to 32/32.");

        cell("Secondary", h.secondaryText.num, h.secondaryText.den,
             "Index fingers in capitals, with the small-letter group in its true relative " +
             "position. A dash marks a gap between small letters.");

        cell("Subsecondary", h.subsecondary.num, h.subsecondary.den,
             "Fingers 2, 3, 4 over 7, 8, 9. Loop counts become I or O by position; " +
             "whorls carry their tracing straight through.");

        cell("Second subsecondary", h.secondSubsecondary.num, h.secondSubsecondary.den,
             "The same six fingers split three ways, S / M / L, for groups that stay " +
             "unwieldy when fully extended.");

        cell("Major division", h.major.num, h.major.den,
             "The thumbs. " + h.major.table.label + ".");

        cell("Final", h.final.num || "—", h.final.den || "—",
             h.final.source || "Ridge count of the loop in a little finger.");

        cell("Key", h.key.value, null,
             h.key.source || "First loop from the right thumb, little fingers excluded.");

        var full = el("div", "hcell");
        full.style.gridColumn = "1 / -1";
        full.appendChild(el("h4", null, "Full formula"));
        var v = el("div", "value");
        v.style.display = "grid";
        v.style.justifyItems = "start";
        var top = el("span", null, h.numerator || "—");
        var bar = el("span");
        bar.style.cssText = "display:block;height:1px;background:var(--rule-strong);width:100%;margin:.2rem 0;";
        var bot = el("span", null, h.denominator || "—");
        v.appendChild(top); v.appendChild(bar); v.appendChild(bot);
        full.appendChild(v);
        host.appendChild(full);
    }

    /* --- report text ------------------------------------------------------ */

    function reportText() {
        var r = A.classifyAll(sheet);
        var lines = [];
        lines.push("TENPRINT CLASSIFICATION");
        lines.push("Subject:   " + (subject || "Unknown"));
        if (reference) lines.push("Reference: " + reference);
        lines.push("");
        lines.push("NCIC FPC:  " + r.ncic.code);
        lines.push("IAFIS:     " + r.afis.code);
        lines.push("Henry:     " + (r.henry.numerator || "—"));
        lines.push("           " + (r.henry.denominator || "—"));
        lines.push("");
        lines.push("Per finger");
        A.FINGERS.forEach(function (f, i) {
            lines.push(
                String(f.n).padStart(2, " ") + "  " +
                f.name.padEnd(14, " ") + "  " +
                (r.ncic.rows[i].code || "··") + "  " +
                (r.afis.rows[i].code || "··") + "  " +
                r.ncic.rows[i].detail
            );
        });
        if (!r.complete) lines.push("", "INCOMPLETE — not every finger is fully recorded.");
        return lines.join("\n");
    }

    /* --- PNG export -------------------------------------------------------
       Drawn straight onto a canvas rather than screenshotted through a
       library, so the page keeps no dependencies and still works offline.
       ---------------------------------------------------------------------- */
    function exportPng() {
        var r = A.classifyAll(sheet);
        var mono = 'ui-monospace, Consolas, "Courier New", monospace';
        var sans = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

        var W = 960, PAD = 44, ROW = 30;
        var headH = 250;
        var tableH = 34 + A.FINGERS.length * ROW;
        var H = headH + tableH + 70;

        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        var canvas = document.createElement("canvas");
        canvas.width = W * ratio;
        canvas.height = H * ratio;
        var c = canvas.getContext("2d");
        c.scale(ratio, ratio);
        c.textBaseline = "middle";

        var paper = "#faf6ec", ink = "#1c1a16", soft = "#5d564a", rule = "#cdc3ac", stamp = "#a8321e";

        c.fillStyle = paper; c.fillRect(0, 0, W, H);
        c.fillStyle = stamp; c.fillRect(PAD, 34, 56, 5);

        c.fillStyle = ink;
        c.font = "700 26px " + sans;
        c.fillText("TENPRINT CLASSIFICATION", PAD, 66);

        c.font = "13px " + sans;
        c.fillStyle = soft;
        c.fillText("Subject: " + (subject || "Unknown") +
                   (reference ? "    Reference: " + reference : ""), PAD, 92);
        c.textAlign = "right";
        c.fillText(new Date().toLocaleString(), W - PAD, 92);
        c.textAlign = "left";

        /* Three code blocks. */
        var y = 118;
        function block(label, value, sub) {
            c.fillStyle = soft;
            c.font = "600 10px " + sans;
            c.fillText(label.toUpperCase(), PAD, y + 10);
            c.fillStyle = ink;
            c.font = "700 19px " + mono;
            c.fillText(value, PAD + 128, y + 11);
            if (sub) {
                c.fillStyle = ink;
                c.font = "700 19px " + mono;
                c.fillText(sub, PAD + 128, y + 34);
            }
            c.strokeStyle = rule; c.lineWidth = 1;
            c.beginPath();
            c.moveTo(PAD, y + (sub ? 48 : 25));
            c.lineTo(W - PAD, y + (sub ? 48 : 25));
            c.stroke();
            y += sub ? 60 : 37;
        }
        block("NCIC FPC", r.ncic.code);
        block("IAFIS", r.afis.code);
        block("Henry", r.henry.numerator || "—", r.henry.denominator || "—");

        /* Table. */
        y = headH;
        var cols = [46, 150, 92, 82];
        var detailX = PAD + cols[0] + cols[1] + cols[2] + cols[3];

        c.fillStyle = soft;
        c.font = "600 10px " + sans;
        var hx = PAD;
        ["#", "FINGER", "NCIC", "IAFIS"].forEach(function (t, k) {
            c.fillText(t, hx, y + 12);
            hx += cols[k];
        });
        c.fillText("PATTERN RECORDED", detailX, y + 12);

        c.strokeStyle = ink; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(PAD, y + 24); c.lineTo(W - PAD, y + 24); c.stroke();
        y += 34;

        A.FINGERS.forEach(function (f, i) {
            var mid = y + ROW / 2;
            c.fillStyle = ink; c.font = "13px " + mono;
            c.fillText(String(f.n), PAD, mid);
            c.font = "13px " + sans;
            c.fillText(f.name, PAD + cols[0], mid);
            c.font = "700 14px " + mono;
            c.fillText(r.ncic.rows[i].code || "··", PAD + cols[0] + cols[1], mid);
            c.fillText(r.afis.rows[i].code || "··", PAD + cols[0] + cols[1] + cols[2], mid);
            c.fillStyle = soft; c.font = "12px " + sans;
            c.fillText(r.ncic.rows[i].detail, detailX, mid);

            c.strokeStyle = rule; c.lineWidth = 1;
            c.beginPath(); c.moveTo(PAD, y + ROW); c.lineTo(W - PAD, y + ROW); c.stroke();
            y += ROW;
        });

        c.fillStyle = soft;
        c.font = "11px " + sans;
        c.fillText("A classification narrows a search. It is not an identification.", PAD, y + 26);
        if (!r.complete) {
            c.fillStyle = stamp;
            c.font = "700 11px " + sans;
            c.textAlign = "right";
            c.fillText("INCOMPLETE CARD", W - PAD, y + 26);
            c.textAlign = "left";
        }

        var slug = (subject || "unknown").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
        save2disk(canvas, "tenprint-" + slug + ".png");
    }

    function save2disk(canvas, fileName) {
        var trigger = function (url, revoke) {
            var a = el("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        };
        if (canvas.toBlob) {
            canvas.toBlob(function (blob) { trigger(URL.createObjectURL(blob), true); }, "image/png");
        } else {
            trigger(canvas.toDataURL("image/png"), false);
        }
        toast("PNG downloaded");
    }

    /* --- persistence ------------------------------------------------------ */

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                sheet: sheet, subject: subject, reference: reference
            }));
        } catch (e) { /* private mode, quota — the bench works without it */ }
    }

    function restore() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (!data || !Array.isArray(data.sheet) || data.sheet.length !== 10) return;
            sheet = data.sheet.map(function (e) {
                return {
                    patternId: A.pattern(e && e.patternId) ? e.patternId : null,
                    count: Number.isInteger(e && e.count) ? e.count : null,
                    tracing: /^[IMO]$/.test(e && e.tracing) ? e.tracing : null,
                    finalCount: Number.isInteger(e && e.finalCount) ? e.finalCount : null
                };
            });
            subject = typeof data.subject === "string" ? data.subject : "";
            reference = typeof data.reference === "string" ? data.reference : "";
        } catch (e) { sheet = A.blankSheet(); }
    }

    function applySheet() {
        $("subjectName").value = subject;
        $("caseRef").value = reference;
        A.FINGERS.forEach(function (finger) {
            var cell = document.querySelector('[data-finger="' + finger.n + '"]');
            cell.querySelector(".pattern-select").value = sheet[finger.n - 1].patternId || "";
            renderExtras(cell, finger);
        });
        recompute();
    }

    /* --- actions ---------------------------------------------------------- */

    function loadExample() {
        var ex = EXAMPLES[exampleIndex % EXAMPLES.length];
        exampleIndex++;
        sheet = ex.entries.map(function (e) {
            return {
                patternId: e[0],
                count: e[1] != null ? e[1] : null,
                tracing: e[2] || null,
                finalCount: null
            };
        });
        subject = ex.subject;
        reference = ex.reference;
        applySheet();
        toast("Loaded: " + ex.label);
        $("loadExample").textContent = "Load " + EXAMPLES[exampleIndex % EXAMPLES.length].label;
    }

    function randomise() {
        var pool = A.PATTERNS.filter(function (p) { return p.group !== "special"; });
        sheet = A.FINGERS.map(function () {
            var p = pool[Math.floor(Math.random() * pool.length)];
            return {
                patternId: p.id,
                count: p.needs === "count"
                    ? A.MIN_COUNT + Math.floor(Math.random() * 28)
                    : null,
                tracing: p.needs === "tracing"
                    ? A.TRACINGS[Math.floor(Math.random() * 3)].value
                    : null,
                finalCount: null
            };
        });
        subject = "Random card";
        reference = "";
        applySheet();
        toast("Random card generated");
    }

    function clearAll() {
        sheet = A.blankSheet();
        subject = "";
        reference = "";
        applySheet();
        toast("Card cleared");
    }

    /* --- theme ------------------------------------------------------------ */

    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        var btn = $("themeToggle");
        btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
        btn.querySelector("[data-theme-label]").textContent = theme === "light" ? "Bench" : "Paper";
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
    }

    /* --- tabs -------------------------------------------------------------- */

    function wireTabs() {
        var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));

        function select(tab) {
            tabs.forEach(function (t) {
                var on = t === tab;
                t.setAttribute("aria-selected", on ? "true" : "false");
                t.tabIndex = on ? 0 : -1;
                $(t.getAttribute("aria-controls")).hidden = !on;
            });
        }

        /* Deep-linkable: #henry or #reference opens that panel directly. */
        function fromHash() {
            var want = window.location.hash.replace("#", "");
            if (!want) return;
            var match = tabs.filter(function (t) {
                return t.getAttribute("aria-controls") === "panel-" + want;
            })[0];
            if (match) select(match);
        }

        tabs.forEach(function (tab, i) {
            tab.addEventListener("click", function () { select(tab); });
            tab.addEventListener("keydown", function (e) {
                var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                var next = tabs[(i + d + tabs.length) % tabs.length];
                select(next);
                next.focus();
            });
        });

        window.addEventListener("hashchange", fromHash);
        fromHash();
    }

    /* --- init -------------------------------------------------------------- */

    /* ?example=1 (or 2) opens straight onto a worked card — handy for
       linking someone at a specific case. */
    function requestedExample() {
        var m = /[?&]example=(\d+)/.exec(window.location.search);
        if (!m) return -1;
        var n = parseInt(m[1], 10) - 1;
        return n >= 0 && n < EXAMPLES.length ? n : -1;
    }

    function init() {
        if (A.preloadPlates) A.preloadPlates();
        buildCard();
        restore();

        /* The inline head script has already picked the theme and set the
           attribute; this only syncs the toggle's label and state to it. */
        setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

        applySheet();

        $("subjectName").addEventListener("input", function (e) { subject = e.target.value; save(); });
        $("caseRef").addEventListener("input", function (e) { reference = e.target.value; save(); });

        $("themeToggle").addEventListener("click", function () {
            setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
        });

        $("loadExample").addEventListener("click", loadExample);
        $("randomise").addEventListener("click", randomise);
        $("clearAll").addEventListener("click", clearAll);
        $("printCard").addEventListener("click", function () { window.print(); });
        $("downloadPng").addEventListener("click", exportPng);
        $("copyReport").addEventListener("click", function () {
            copyText(reportText(), "Report");
        });

        document.querySelectorAll("[data-copy]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var r = A.classifyAll(sheet);
                var which = btn.getAttribute("data-copy");
                if (which === "ncic")  copyText(r.ncic.code, "NCIC code");
                if (which === "afis")  copyText(r.afis.code, "IAFIS codes");
                if (which === "henry") copyText(r.henry.numerator + "\n" + r.henry.denominator, "Henry formula");
            });
        });

        /* Ridge-tracing helper in the reference panel. */
        function tracer() {
            var side = $("tracerSide").value;
            var ridges = parseInt($("tracerRidges").value, 10);
            var out = A.traceFromRidges(side, Number.isNaN(ridges) ? -1 : ridges);
            $("tracerOut").textContent = out || "—";
        }
        $("tracerSide").addEventListener("change", tracer);
        $("tracerRidges").addEventListener("input", tracer);

        wireTabs();
        $("loadExample").textContent = "Load " + EXAMPLES[0].label;

        var wanted = requestedExample();
        if (wanted >= 0) {
            exampleIndex = wanted;
            loadExample();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
