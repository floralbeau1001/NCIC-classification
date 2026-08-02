

const FINGER_NAMES = [
    "Right Thumb", "Right Index", "Right Middle", "Right Ring", "Right Little",
    "Left Thumb",  "Left Index",  "Left Middle",  "Left Ring",  "Left Little"
];

// "label" is what the dropdown shows; "short" is the compact form used in the
// breakdown table and the exported PNG.
const TRACINGS = [
    { value: "I", label: "Inner tracing (I)",   short: "Inner(I)" },
    { value: "M", label: "Meeting tracing (M)", short: "Meet(M)" },
    { value: "O", label: "Outer tracing (O)",   short: "Outer(O)" }
];

// A loop always crosses at least one ridge, so zero is never a valid count.
const MIN_RIDGE_COUNT = 1;
const MAX_RIDGE_COUNT = 40;

let activeConfig = null;

let lastResult = null;

function initFingerprintPage(config) {
    activeConfig = config;
    buildFingerInputs();
    document.getElementById("fingerprintForm")
        .addEventListener("submit", generateClassification);
    document.getElementById("downloadPngBtn")
        .addEventListener("click", downloadBreakdownPng);
}

function patternFor(value) {
    return activeConfig.patterns.find(p => p.value === value) || null;
}

/* ---------- Suspect identity ---------- */

function suspectName() {
    const field = document.getElementById("suspectName");
    const typed = field ? field.value.trim() : "";
    return typed || "Unknown";
}

/* ---------- Form construction ---------- */

function buildFingerInputs() {
    const needsExtras = activeConfig.patterns.some(p => p.extra);

    for (let i = 1; i <= 10; i++) {
        const select = document.getElementById("f" + i);
        select.classList.add("pattern-select");
        select.innerHTML =
            '<option value="" disabled selected>Select pattern…</option>' +
            activeConfig.patterns.map(p => `<option value="${p.value}">${p.label}</option>`).join("");

        if (!needsExtras) continue;

        const tracing = document.createElement("select");
        tracing.id = "f" + i + "-tracing";
        tracing.className = "extra-input hidden";
        tracing.innerHTML =
            '<option value="" disabled selected>Tracing…</option>' +
            TRACINGS.map(t => `<option value="${t.value}">${t.label}</option>`).join("");

        const ridges = document.createElement("input");
        ridges.type = "number";
        ridges.id = "f" + i + "-ridges";
        ridges.className = "extra-input hidden";
        ridges.min = MIN_RIDGE_COUNT;
        ridges.max = MAX_RIDGE_COUNT;
        ridges.step = 1;
        ridges.placeholder = "Ridge count (" + MIN_RIDGE_COUNT + "-" + MAX_RIDGE_COUNT + ")";

        select.parentElement.appendChild(tracing);
        select.parentElement.appendChild(ridges);

        select.addEventListener("change", () => syncExtraInputs(i));
        // Snap an out-of-range entry back once the value is committed, so a
        // typed 0 (or a spinner run to the bottom) can never reach the code.
        ridges.addEventListener("change", () => clampRidgeCount(ridges));
    }
}


function syncExtraInputs(i) {
    const pattern = patternFor(document.getElementById("f" + i).value);
    const needed = pattern ? pattern.extra : null;
    toggleInput(document.getElementById("f" + i + "-tracing"), needed === "tracing");
    toggleInput(document.getElementById("f" + i + "-ridges"), needed === "ridges");
}

function clampRidgeCount(input) {
    if (input.value === "") return;
    const count = Math.round(Number(input.value));
    if (!Number.isFinite(count) || count < MIN_RIDGE_COUNT) {
        input.value = MIN_RIDGE_COUNT;
    } else if (count > MAX_RIDGE_COUNT) {
        input.value = MAX_RIDGE_COUNT;
    } else {
        input.value = count;
    }
}

// Reports whether a ridge count is usable; the page-level segment rules and the
// clamp above both defer to this so the accepted range lives in one place.
function isValidRidgeCount(count) {
    return Number.isInteger(count) && count >= MIN_RIDGE_COUNT && count <= MAX_RIDGE_COUNT;
}

function toggleInput(el, show) {
    el.classList.toggle("hidden", !show);
    el.required = show;
    if (!show) el.value = "";
}

// Table-facing name for a tracing, e.g. "Meet(M)". The dropdown option keeps
// its longer wording.
function describeTracing(value) {
    const match = TRACINGS.find(t => t.value === value);
    return match ? match.short : value;
}

/* ---------- Generating the code ---------- */

function generateClassification(event) {
    event.preventDefault();

    const segments = [];
    const rows = [];

    for (let i = 1; i <= 10; i++) {
        const segment = activeConfig.segmentFor(i);
        if (!segment) {
            alert(activeConfig.incompleteMessage(i));
            return;
        }
        segments.push(segment.code);
        rows.push({
            finger: "#" + i,
            name: FINGER_NAMES[i - 1],
            detail: segment.detail,
            code: segment.code
        });
    }

    lastResult = {
        system: activeConfig.system,
        suspect: suspectName(),
        code: segments.join(" "),
        rows: rows
    };

    renderResults(lastResult);
}

function renderResults(result) {
    document.getElementById("codeOutput").textContent = result.code;

    const readout = document.getElementById("suspectReadout");
    readout.textContent = "";
    readout.appendChild(document.createTextNode("Suspect: "));
    const strong = document.createElement("strong");
    strong.textContent = result.suspect;
    readout.appendChild(strong);

    const body = document.getElementById("breakdownTableBody");
    body.textContent = "";
    result.rows.forEach(row => {
        const tr = document.createElement("tr");
        [row.finger, row.name, row.detail].forEach(text => {
            const td = document.createElement("td");
            td.textContent = text;
            tr.appendChild(td);
        });
        const codeCell = document.createElement("td");
        const code = document.createElement("strong");
        code.textContent = row.code;
        codeCell.appendChild(code);
        tr.appendChild(codeCell);
        body.appendChild(tr);
    });

    const card = document.getElementById("resultsCard");
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- PNG export ----------
 * Drawn straight onto a canvas rather than pulled in through a screenshot
 * library, so the pages stay dependency-free and work offline from file://.
 */

const PNG_WIDTH = 920;
const PNG_PAD = 36;
const PNG_COLS = [86, 160, 430, 172];   // sums to PNG_WIDTH - 2 * PNG_PAD
const PNG_LINE_HEIGHT = 19;
const PNG_ROW_MIN = 40;
const FONT_STACK = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const PNG_FONT_BODY = "13.5px " + FONT_STACK;
const PNG_FONT_HEAD = "600 12.5px " + FONT_STACK;
const PNG_FONT_CODE_CELL = "700 14px " + FONT_STACK;

function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function hexToRgba(hex, alpha) {
    let value = String(hex).trim().replace("#", "");
    if (value.length === 3) {
        value = value.split("").map(c => c + c).join("");
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return "rgba(196, 181, 253, " + alpha + ")";
    const num = parseInt(value, 16);
    return "rgba(" + ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255) + ", " + alpha + ")";
}

function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach(word => {
        const candidate = line ? line + " " + word : word;
        if (!line || ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    });
    if (line) lines.push(line);
    return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function downloadBreakdownPng() {
    if (!lastResult) {
        alert("Generate a classification code first — there is no breakdown to download yet.");
        return;
    }

    const result = lastResult;
    const accent = cssVar("--accent", "#C4B5FD");
    const ink = cssVar("--primary", "#111827");
    const stamp = new Date();

    const measure = document.createElement("canvas").getContext("2d");
    measure.font = PNG_FONT_BODY;
    const detailWidth = PNG_COLS[2] - 20;
    const wrapped = result.rows.map(row => wrapText(measure, row.detail, detailWidth));
    const rowHeights = wrapped.map(lines => Math.max(PNG_ROW_MIN, lines.length * PNG_LINE_HEIGHT + 20));

    const headerHeight = 148;                       // title, suspect line, code panel
    const tableHeadHeight = 38;
    const bodyHeight = rowHeights.reduce((sum, h) => sum + h, 0);
    const footerHeight = 46;
    const height = PNG_PAD + headerHeight + tableHeadHeight + bodyHeight + footerHeight;

    const ratio = Math.min(window.devicePixelRatio || 1, 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PNG_WIDTH * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.textBaseline = "middle";

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#eceff4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, PNG_WIDTH, height);

    const wash = ctx.createRadialGradient(90, -40, 0, 90, -40, 620);
    wash.addColorStop(0, hexToRgba(accent, 0.38));
    wash.addColorStop(1, hexToRgba(accent, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, PNG_WIDTH, height);

    let y = PNG_PAD + 6;

    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = "700 21px " + FONT_STACK;
    ctx.fillText(result.system + " Fingerprint Classification", PNG_PAD, y + 10);

    ctx.font = "14px " + FONT_STACK;
    ctx.fillStyle = "#374151";
    ctx.fillText("Suspect: " + result.suspect, PNG_PAD, y + 36);

    ctx.textAlign = "right";
    ctx.fillStyle = "#6b7280";
    ctx.font = "12.5px " + FONT_STACK;
    ctx.fillText(stamp.toLocaleString(), PNG_WIDTH - PNG_PAD, y + 36);

    // Code panel.
    const panelY = y + 56;
    const panelH = 62;
    ctx.fillStyle = "#0f172a";
    roundedRect(ctx, PNG_PAD, panelY, PNG_WIDTH - PNG_PAD * 2, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.font = '700 25px ui-monospace, Consolas, "Courier New", monospace';
    ctx.fillText(result.code, PNG_WIDTH / 2, panelY + panelH / 2 + 1);

    y = PNG_PAD + headerHeight;

    // Table header
    const headers = ["Finger", "Finger Name", "Pattern Selected", result.system + " Code"];
    ctx.fillStyle = "rgba(17, 24, 39, 0.07)";
    ctx.fillRect(PNG_PAD, y, PNG_WIDTH - PNG_PAD * 2, tableHeadHeight);
    ctx.font = PNG_FONT_HEAD;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    let x = PNG_PAD;
    headers.forEach((label, c) => {
        ctx.fillText(label, x + PNG_COLS[c] / 2, y + tableHeadHeight / 2);
        x += PNG_COLS[c];
    });

    y += tableHeadHeight;

    // Table body
    result.rows.forEach((row, r) => {
        const h = rowHeights[r];

        if (r % 2 === 1) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
            ctx.fillRect(PNG_PAD, y, PNG_WIDTH - PNG_PAD * 2, h);
        }

        ctx.strokeStyle = "rgba(17, 24, 39, 0.10)";
        ctx.beginPath();
        ctx.moveTo(PNG_PAD, y + h);
        ctx.lineTo(PNG_WIDTH - PNG_PAD, y + h);
        ctx.stroke();

        const middle = y + h / 2;
        x = PNG_PAD;

        ctx.fillStyle = "#111827";
        ctx.font = PNG_FONT_BODY;
        ctx.fillText(row.finger, x + PNG_COLS[0] / 2, middle);
        x += PNG_COLS[0];

        ctx.fillText(row.name, x + PNG_COLS[1] / 2, middle);
        x += PNG_COLS[1];

        const lines = wrapped[r];
        const startY = middle - ((lines.length - 1) * PNG_LINE_HEIGHT) / 2;
        lines.forEach((line, l) => {
            ctx.fillText(line, x + PNG_COLS[2] / 2, startY + l * PNG_LINE_HEIGHT);
        });
        x += PNG_COLS[2];

        ctx.font = PNG_FONT_CODE_CELL;
        ctx.fillText(row.code, x + PNG_COLS[3] / 2, middle);

        y += h;
    });

    // Table outline
    ctx.strokeStyle = "rgba(17, 24, 39, 0.14)";
    roundedRect(ctx, PNG_PAD, PNG_PAD + headerHeight, PNG_WIDTH - PNG_PAD * 2, tableHeadHeight + bodyHeight, 10);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = "12px " + FONT_STACK;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(result.system + " classification formula · 10 fingers · 20 characters",
                 PNG_PAD, y + footerHeight / 2);

    const fileName = result.system + "-" + slugify(result.suspect) + "-fingerprint-breakdown.png";
    saveCanvas(canvas, fileName);
}

function saveCanvas(canvas, fileName) {
    const trigger = url => {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return link;
    };

    if (canvas.toBlob) {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            trigger(url);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }, "image/png");
    } else {
        trigger(canvas.toDataURL("image/png"));
    }
}
