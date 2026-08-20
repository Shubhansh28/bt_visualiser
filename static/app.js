/* ===================================================================
   BST Playground — Frontend Logic
   Monaco editor init, run handler, canvas tree renderer, simulation.
   =================================================================== */

// ── Globals ────────────────────────────────────────────────────────
let editor = null;
let currentFormat = "leetcode";

// Render Backend URL (Update this with your actual Render URL)
const API_BASE_URL = "https://bt-visualiser.onrender.com";

// Simulation state
let simState = {
    steps: [],
    currentStep: 0,
    playing: false,
    timer: null,
    treeJson: null,
    inputTreeJson: null,
    highlightedNodeVal: null,
    decorationIds: [],
    userCodeLines: [],
    error: null,
    callStack: [],
};

// ── Default template code ──────────────────────────────────────────
const DEFAULT_CODE = `# ═══════════════════════════════════════════════════
# Available helpers (injected automatically):
#   TreeNode(val, left, right)  — standard tree node
#   build_tree(arr)             — builds tree from input
#   print_tree(root)            — pretty-print tree
#   inorder(root)               — in-order traversal
#   preorder(root)              — pre-order traversal
#   postorder(root)             — post-order traversal
#   level_order(root)           — level-order traversal
#   tree_to_list(root)          — tree → LeetCode list
# ═══════════════════════════════════════════════════

# 'root' is pre-built from your input above ☝️

# ── Write your solution below ───────────────────────

class Solution:
    def invertTree(self, root):
        if not root:
            return None
        root.left, root.right = root.right, root.left
        self.invertTree(root.left)
        self.invertTree(root.right)
        return root

sol = Solution()
root = sol.invertTree(root)

# Print results
print("Inverted tree:")
print_tree(root)
print("\\nIn-order:", inorder(root))
print("Level-order:", level_order(root))
`;

// ── Monaco Editor Initialization ───────────────────────────────────
function initEditor() {
    // Configure Monaco Environment for CDN workers
    window.MonacoEnvironment = {
        getWorkerUrl: function (workerId, label) {
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' };
                importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.min.js');
            `)}`;
        },
    };

    require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
    });

    require(["vs/editor/editor.main"], function () {
        // Define a custom dark theme
        monaco.editor.defineTheme("bst-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
                { token: "comment", foreground: "5a5a72", fontStyle: "italic" },
                { token: "keyword", foreground: "a29bfe", fontStyle: "bold" },
                { token: "string", foreground: "00d2a0" },
                { token: "number", foreground: "feca57" },
                { token: "type", foreground: "54a0ff" },
                { token: "identifier", foreground: "e8e8f0" },
                { token: "delimiter", foreground: "9090a8" },
            ],
            colors: {
                "editor.background": "#0a0a0f",
                "editor.foreground": "#e8e8f0",
                "editor.lineHighlightBackground": "#1a1a2611",
                "editor.selectionBackground": "#6c5ce733",
                "editorCursor.foreground": "#a29bfe",
                "editorLineNumber.foreground": "#3a3a52",
                "editorLineNumber.activeForeground": "#6c5ce7",
                "editor.inactiveSelectionBackground": "#6c5ce71a",
            },
        });

        editor = monaco.editor.create(document.getElementById("editor-container"), {
            value: DEFAULT_CODE,
            language: "python",
            theme: "bst-dark",
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12 },
            renderLineHighlight: "gutter",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            bracketPairColorization: { enabled: true },
            autoClosingBrackets: "always",
            tabSize: 4,
            wordWrap: "on",
        });

        // Resize editor when window resizes
        window.addEventListener("resize", () => editor.layout());

        // Ctrl+Enter to run
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    });
}

// ── Run Code ───────────────────────────────────────────────────────
async function runCode() {
    const runBtn = document.getElementById("run-btn");
    const outputText = document.getElementById("output-text");
    const outputPlaceholder = document.getElementById("output-placeholder");
    const treePlaceholder = document.getElementById("tree-placeholder");

    // Set running state
    runBtn.classList.add("running");
    runBtn.innerHTML = '<span class="spinner"></span> Running...';
    outputPlaceholder.style.display = "none";
    outputText.textContent = "";
    outputText.className = "output-text";

    const code = editor.getValue();
    const treeInput = document.getElementById("tree-input").value;

    try {
        const response = await fetch(API_BASE_URL + "/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                tree_input: treeInput,
                input_format: currentFormat,
            }),
        });

        const data = await response.json();

        // Display output
        if (data.error) {
            outputText.textContent = data.output
                ? data.output + "\n\n❌ Error:\n" + data.error
                : "❌ Error:\n" + data.error;
            outputText.className = "output-text error";
        } else if (data.output) {
            outputText.textContent = data.output;
            outputText.className = "output-text";
        } else {
            outputText.textContent = "✓ Code executed successfully (no output).";
            outputText.className = "output-text";
        }

        // Render tree
        if (data.tree_json) {
            treePlaceholder.classList.add("hidden");
            renderTree(data.tree_json);
        } else {
            treePlaceholder.classList.remove("hidden");
            clearCanvas();
        }
    } catch (err) {
        outputText.textContent = "❌ Connection error: " + err.message;
        outputText.className = "output-text error";
    } finally {
        // Reset button
        runBtn.classList.remove("running");
        runBtn.innerHTML = '<span class="icon">▶</span> Run';
    }
}

// ── Canvas Tree Renderer ───────────────────────────────────────────
// Uses a centered top-down binary layout for clean symmetric trees.

function clearCanvas() {
    const canvas = document.getElementById("tree-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getTreeDepth(node) {
    if (!node) return 0;
    return 1 + Math.max(getTreeDepth(node.left), getTreeDepth(node.right));
}

/**
 * Assign positions using a centered top-down layout.
 * Root is at the center. At each level, children spread by an offset
 * that halves per depth, producing the classic symmetric layout.
 */
function assignCenteredPositions(node, x, y, hOffset, verticalGap, nodesList) {
    if (!node) return;
    node._x = x;
    node._y = y;
    nodesList.push(node);

    if (node.left) {
        assignCenteredPositions(node.left, x - hOffset, y + verticalGap, hOffset / 2, verticalGap, nodesList);
    }
    if (node.right) {
        assignCenteredPositions(node.right, x + hOffset, y + verticalGap, hOffset / 2, verticalGap, nodesList);
    }
}

function renderTree(treeJson, highlightVal) {
    const canvas = document.getElementById("tree-canvas");
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width = wrap.clientWidth + "px";
    canvas.style.height = wrap.clientHeight + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const depth = getTreeDepth(treeJson);

    // Dynamic sizing
    const nodeRadius = Math.max(20, Math.min(28, Math.min(w, h) / (depth * 2.5)));
    const verticalGap = Math.max(50, (h - 80) / Math.max(depth, 1));
    const startY = 40 + nodeRadius;

    // Starting horizontal offset: half of available width per side
    const hOffset = (w - 80) / 4;

    // Collect all nodes with centered positions
    const nodes = [];
    assignCenteredPositions(treeJson, w / 2, startY, hOffset, verticalGap, nodes);

    // Store last tree for resize
    canvas._lastTree = treeJson;
    canvas._lastHighlight = highlightVal;

    // Animate drawing
    let animProgress = 0;
    const animDuration = 600; // ms
    const startTime = performance.now();

    function animate(timestamp) {
        animProgress = Math.min(1, (timestamp - startTime) / animDuration);
        const eased = easeOutCubic(animProgress);

        ctx.clearRect(0, 0, w, h);

        // Draw edges first (behind nodes)
        drawEdges(ctx, treeJson, eased, nodeRadius);

        // Draw nodes
        nodes.forEach((node, i) => {
            const nodeProgress = Math.max(0, Math.min(1, (eased * nodes.length - i) / 2));
            if (nodeProgress > 0) {
                const isHighlighted = highlightVal !== undefined && node.val === highlightVal;
                drawNode(ctx, node._x, node._y, node.val, nodeRadius, nodeProgress, depth, isHighlighted);
            }
        });

        if (animProgress < 1) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

/** Render tree without animation (for simulation stepping) */
function renderTreeImmediate(treeJson, highlightVal) {
    const canvas = document.getElementById("tree-canvas");
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width = wrap.clientWidth + "px";
    canvas.style.height = wrap.clientHeight + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const depth = getTreeDepth(treeJson);

    const nodeRadius = Math.max(20, Math.min(28, Math.min(w, h) / (depth * 2.5)));
    const verticalGap = Math.max(50, (h - 80) / Math.max(depth, 1));
    const startY = 40 + nodeRadius;
    const hOffset = (w - 80) / 4;

    const nodes = [];
    assignCenteredPositions(treeJson, w / 2, startY, hOffset, verticalGap, nodes);

    canvas._lastTree = treeJson;
    canvas._lastHighlight = highlightVal;

    // Draw edges
    drawEdges(ctx, treeJson, 1, nodeRadius);

    // Draw nodes
    nodes.forEach((node) => {
        const isHighlighted = highlightVal !== undefined && node.val === highlightVal;
        drawNode(ctx, node._x, node._y, node.val, nodeRadius, 1, depth, isHighlighted);
    });
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function drawEdges(ctx, node, progress, radius) {
    if (!node) return;

    const alpha = Math.min(1, progress * 1.5);

    if (node.left) {
        drawEdgeLine(ctx, node._x, node._y, node.left._x, node.left._y, alpha, radius);
        drawEdges(ctx, node.left, progress, radius);
    }
    if (node.right) {
        drawEdgeLine(ctx, node._x, node._y, node.right._x, node.right._y, alpha, radius);
        drawEdges(ctx, node.right, progress, radius);
    }
}

function drawEdgeLine(ctx, x1, y1, x2, y2, alpha, radius) {
    // Calculate edge start/end points on circle boundaries
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const startX = x1 + Math.cos(angle) * radius;
    const startY = y1 + Math.sin(angle) * radius;
    const endX = x2 - Math.cos(angle) * radius;
    const endY = y2 - Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(startX, startY);

    // Bezier curve for smoother edges
    const midY = (startY + endY) / 2 + 10;
    ctx.bezierCurveTo(startX, midY, endX, midY, endX, endY);

    // Brighter, thicker edges
    ctx.strokeStyle = `rgba(162, 155, 254, ${0.7 * alpha})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
}

function drawNode(ctx, x, y, val, radius, progress, totalDepth, isHighlighted) {
    const scale = progress;
    const r = radius * scale;

    if (r <= 0) return;

    ctx.save();

    // Highlighted node gets extra glow
    if (isHighlighted) {
        ctx.shadowColor = "rgba(0, 210, 160, 0.8)";
        ctx.shadowBlur = 28 * progress;

        // Outer highlight ring
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 210, 160, ${0.6 * progress})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    } else {
        ctx.shadowColor = "rgba(108, 92, 231, 0.5)";
        ctx.shadowBlur = 18 * progress;
    }

    // Circle gradient
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);

    if (isHighlighted) {
        grad.addColorStop(0, `hsla(160, 80%, 55%, ${progress})`);
        grad.addColorStop(1, `hsla(160, 70%, 35%, ${progress})`);
    } else {
        grad.addColorStop(0, `hsla(250, 65%, 65%, ${progress})`);
        grad.addColorStop(1, `hsla(250, 55%, 42%, ${progress})`);
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    if (isHighlighted) {
        ctx.strokeStyle = `rgba(0, 210, 160, ${0.9 * progress})`;
        ctx.lineWidth = 2.5;
    } else {
        ctx.strokeStyle = `rgba(162, 155, 254, ${0.7 * progress})`;
        ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    ctx.restore();

    // Text — larger, bolder
    const fontSize = Math.max(12, Math.min(16, r * 0.85));
    ctx.font = `700 ${fontSize}px 'Inter', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${progress})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(val), x, y + 0.5);
}

// ── Format Toggle ──────────────────────────────────────────────────
function setFormat(format) {
    currentFormat = format;
    document.querySelectorAll(".format-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.format === format);
    });

    const input = document.getElementById("tree-input");
    if (format === "leetcode") {
        input.placeholder = "[1, 2, 3, null, null, 4, 5]";
    } else {
        input.placeholder = "1 2 3 -1 -1 4 5";
    }
}

// ── Helpers Drawer ─────────────────────────────────────────────────
function toggleHelpers() {
    document.getElementById("helpers-drawer").classList.toggle("open");
    document.getElementById("backdrop").classList.toggle("visible");
}

function closeHelpers() {
    document.getElementById("helpers-drawer").classList.remove("open");
    document.getElementById("backdrop").classList.remove("visible");
}

// ── Reset Editor ───────────────────────────────────────────────────
function resetEditor() {
    if (editor) {
        editor.setValue(DEFAULT_CODE);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════

async function startSimulation() {
    const simBtn = document.getElementById("simulate-btn");
    const outputText = document.getElementById("output-text");
    const outputPlaceholder = document.getElementById("output-placeholder");
    const treePlaceholder = document.getElementById("tree-placeholder");

    // Reset any existing simulation
    stopSimulation();

    simBtn.classList.add("running");
    simBtn.innerHTML = '<span class="spinner"></span> Loading...';
    outputPlaceholder.style.display = "none";
    outputText.textContent = "⏳ Preparing simulation...";
    outputText.className = "output-text";

    const code = editor.getValue();
    const treeInput = document.getElementById("tree-input").value;

    try {
        const response = await fetch(API_BASE_URL + "/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                tree_input: treeInput,
                input_format: currentFormat,
            }),
        });

        const data = await response.json();

        if (!data.steps || data.steps.length === 0) {
            outputText.textContent = data.error
                ? "❌ Simulation Error:\n" + data.error
                : "No simulation steps recorded. Make sure your code has recursive function calls.";
            outputText.className = "output-text error";
            simBtn.classList.remove("running");
            simBtn.innerHTML = '<span class="icon">⏯</span> Simulate';
            return;
        }

        // Setup simulation state
        simState.steps = data.steps;
        simState.currentStep = 0;
        simState.treeJson = data.input_tree_json || data.tree_json;
        simState.inputTreeJson = data.input_tree_json;
        simState.userCodeLines = data.user_code_lines || [];
        simState.error = data.error;
        simState.callStack = [];
        simState.playing = false;

        // Show tree
        if (simState.treeJson) {
            treePlaceholder.classList.add("hidden");
            renderTree(simState.treeJson);
        }

        // Show sim controls
        document.getElementById("sim-controls").classList.add("visible");
        updateSimUI();

        outputText.textContent = `✓ Simulation ready — ${data.steps.length} steps recorded.\nUse the controls below to step through the recursion.`;
        if (data.output) {
            outputText.textContent += "\n\n── Output ──\n" + data.output;
        }
        outputText.className = "output-text";

    } catch (err) {
        outputText.textContent = "❌ Connection error: " + err.message;
        outputText.className = "output-text error";
    } finally {
        simBtn.classList.remove("running");
        simBtn.innerHTML = '<span class="icon">⏯</span> Simulate';
    }
}

function stopSimulation() {
    simState.playing = false;
    if (simState.timer) {
        clearTimeout(simState.timer);
        simState.timer = null;
    }
    simState.steps = [];
    simState.currentStep = 0;
    simState.callStack = [];

    // Hide controls
    document.getElementById("sim-controls").classList.remove("visible");
    document.getElementById("sim-error-banner").classList.remove("visible");

    // Clear editor decorations
    if (editor && simState.decorationIds.length > 0) {
        simState.decorationIds = editor.deltaDecorations(simState.decorationIds, []);
    }

    document.getElementById("sim-play-icon").textContent = "▶";
}

function toggleSimPlay() {
    if (simState.steps.length === 0) return;

    if (simState.playing) {
        // Pause
        simState.playing = false;
        if (simState.timer) {
            clearTimeout(simState.timer);
            simState.timer = null;
        }
        document.getElementById("sim-play-icon").textContent = "▶";
        document.getElementById("sim-status").textContent = "Paused";
    } else {
        // Play
        simState.playing = true;
        document.getElementById("sim-play-icon").textContent = "⏸";
        document.getElementById("sim-status").textContent = "Playing";
        autoStep();
    }
}

function autoStep() {
    if (!simState.playing) return;
    if (simState.currentStep >= simState.steps.length) {
        simState.playing = false;
        document.getElementById("sim-play-icon").textContent = "▶";
        document.getElementById("sim-status").textContent = "Finished";
        // Show error at the end if there was one
        showSimError();
        return;
    }

    stepForward();

    const speed = parseInt(document.getElementById("sim-speed").value);
    const delay = Math.max(50, 1200 - speed * 110);
    simState.timer = setTimeout(autoStep, delay);
}

function stepForward() {
    if (simState.currentStep >= simState.steps.length) {
        document.getElementById("sim-status").textContent = "Finished";
        showSimError();
        return;
    }

    const step = simState.steps[simState.currentStep];
    simState.currentStep++;

    // Update call stack
    updateCallStack(step);

    // Highlight code line in editor
    highlightLine(step.line);

    // Highlight node in tree
    if (simState.treeJson && step.node_val !== null && step.node_val !== undefined) {
        simState.highlightedNodeVal = step.node_val;
        renderTreeImmediate(simState.treeJson, step.node_val);
    }

    // Update UI
    updateSimUI();

    // If this step has an error, mark it
    if (step.error) {
        document.getElementById("sim-status").textContent = "⚠️ Error";
    }
}

function updateCallStack(step) {
    if (step.event === "call") {
        simState.callStack.push({
            func: step.func,
            line: step.line,
            depth: step.depth,
            nodeVal: step.node_val,
        });
    } else if (step.event === "return") {
        // Pop the matching call from stack
        if (simState.callStack.length > 0) {
            simState.callStack.pop();
        }
    }

    // Render call stack
    const container = document.getElementById("sim-callstack-items");
    container.innerHTML = "";

    if (simState.callStack.length === 0) {
        container.innerHTML = '<div class="sim-callstack-empty">Empty</div>';
        return;
    }

    // Show stack from bottom (oldest) to top (newest)
    [...simState.callStack].reverse().forEach((entry, idx) => {
        const item = document.createElement("div");
        item.className = "sim-callstack-item" + (idx === 0 ? " active" : "");
        const nodeStr = entry.nodeVal !== null && entry.nodeVal !== undefined
            ? ` (node=${entry.nodeVal})`
            : "";
        item.textContent = `${entry.func}${nodeStr}  — L${entry.line}, d${entry.depth}`;
        container.appendChild(item);
    });
}

function highlightLine(lineNum) {
    if (!editor || lineNum < 1) return;

    // Clear previous decorations
    simState.decorationIds = editor.deltaDecorations(simState.decorationIds, [
        {
            range: new monaco.Range(lineNum, 1, lineNum, 1),
            options: {
                isWholeLine: true,
                className: "sim-line-highlight",
                glyphMarginClassName: "sim-glyph-margin",
            },
        },
    ]);

    // Scroll to the line
    editor.revealLineInCenter(lineNum);
}

function updateSimUI() {
    const counter = document.getElementById("sim-step-counter");
    const status = document.getElementById("sim-status");
    counter.textContent = `${simState.currentStep} / ${simState.steps.length}`;

    if (!simState.playing && simState.currentStep > 0 && simState.currentStep < simState.steps.length) {
        status.textContent = "Paused";
    } else if (simState.currentStep >= simState.steps.length) {
        status.textContent = "Finished";
    }
}

function showSimError() {
    if (simState.error) {
        const banner = document.getElementById("sim-error-banner");
        document.getElementById("sim-error-text").textContent =
            "Recursion Error: " + simState.error;
        banner.classList.add("visible");
    }
}

// ── Initialize ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initEditor();

    // Format buttons
    document.querySelectorAll(".format-btn").forEach((btn) => {
        btn.addEventListener("click", () => setFormat(btn.dataset.format));
    });

    // Run button
    document.getElementById("run-btn").addEventListener("click", runCode);

    // Simulate button
    document.getElementById("simulate-btn").addEventListener("click", startSimulation);

    // Simulation controls
    document.getElementById("sim-play-btn").addEventListener("click", toggleSimPlay);
    document.getElementById("sim-step-btn").addEventListener("click", stepForward);
    document.getElementById("sim-stop-btn").addEventListener("click", stopSimulation);
    document.getElementById("sim-speed").addEventListener("input", (e) => {
        document.getElementById("sim-speed-val").textContent = e.target.value + "x";
    });
    document.getElementById("sim-error-close").addEventListener("click", () => {
        document.getElementById("sim-error-banner").classList.remove("visible");
    });

    // Helpers drawer
    document.getElementById("helpers-btn").addEventListener("click", toggleHelpers);
    document.getElementById("helpers-close").addEventListener("click", closeHelpers);
    document.getElementById("backdrop").addEventListener("click", closeHelpers);

    // Reset button
    document.getElementById("reset-btn").addEventListener("click", resetEditor);

    // Resize canvas on window resize
    window.addEventListener("resize", () => {
        const canvas = document.getElementById("tree-canvas");
        if (canvas._lastTree) {
            renderTreeImmediate(canvas._lastTree, canvas._lastHighlight);
        }
    });
});
