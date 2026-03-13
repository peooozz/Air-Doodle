// ===== PAGE NAVIGATION =====
const homePage = document.getElementById('home-page');
const guidePage = document.getElementById('guide-page');
const drawPage = document.getElementById('draw-page');

let appStarted = false;

function startApp() {
    homePage.classList.add('hidden');
    guidePage.classList.add('hidden');
    drawPage.classList.remove('hidden');
    if (!appStarted) {
        appStarted = true;
        initHandTracking();
    }
}

function showGuide() {
    homePage.classList.add('hidden');
    guidePage.classList.remove('hidden');
}

function hideGuide() {
    guidePage.classList.add('hidden');
    homePage.classList.remove('hidden');
}

function goHome() {
    drawPage.classList.add('hidden');
    guidePage.classList.add('hidden');
    homePage.classList.remove('hidden');
}

window.startApp = startApp;
window.showGuide = showGuide;
window.hideGuide = hideGuide;
window.goHome = goHome;

// ===== THEME =====
let isDarkTheme = true;

function getCanvasBg() {
    return isDarkTheme ? '#2a2a2a' : '#f5f0e8';
}

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    const btn = document.getElementById('btn-theme');
    btn.textContent = isDarkTheme ? '🌙' : '☀️';
    // Update draw page background
    drawPage.style.background = getCanvasBg();
}
window.toggleTheme = toggleTheme;

// ===== HOMEPAGE PARTICLE CANVAS =====
(function initParticles() {
    const pc = document.getElementById('particle-canvas');
    if (!pc) return;
    const pctx = pc.getContext('2d');

    function resize() {
        pc.width = window.innerWidth;
        pc.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const dots = [];
    const COUNT = 120;
    for (let i = 0; i < COUNT; i++) {
        dots.push({
            x: Math.random() * pc.width,
            y: Math.random() * pc.height,
            r: Math.random() * 2 + 0.5,
            dx: (Math.random() - 0.5) * 0.3,
            dy: (Math.random() - 0.5) * 0.3,
            phase: Math.random() * Math.PI * 2,
            hue: Math.random() < 0.3 ? 300 : Math.random() < 0.5 ? 190 : 260
        });
    }

    function drawParticles() {
        pctx.clearRect(0, 0, pc.width, pc.height);
        const t = performance.now() * 0.001;

        dots.forEach(d => {
            d.x += d.dx;
            d.y += d.dy;
            if (d.x < 0) d.x = pc.width;
            if (d.x > pc.width) d.x = 0;
            if (d.y < 0) d.y = pc.height;
            if (d.y > pc.height) d.y = 0;

            const alpha = 0.3 + 0.5 * Math.sin(t * 1.5 + d.phase);
            pctx.beginPath();
            pctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            pctx.fillStyle = `hsla(${d.hue}, 80%, 75%, ${alpha})`;
            pctx.shadowBlur = 8;
            pctx.shadowColor = `hsla(${d.hue}, 80%, 65%, ${alpha * 0.6})`;
            pctx.fill();
            pctx.shadowBlur = 0;
        });

        requestAnimationFrame(drawParticles);
    }
    drawParticles();
})();

// ===== DRAWING STATE =====
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingScreen = document.getElementById('loading-screen');
const gestureIndicator = document.getElementById('gesture-indicator');

let drawings = [];
let currentPath = null;
let selectedDrawing = null;
let isDragging = false;
let lastFingerPos = { x: 0, y: 0 };
let currentColor = '#FF3B3B';

// Eraser
const ERASER_RADIUS = 45;

// Hand stability smoothing
let smoothedPos = { x: null, y: null };
// Base factor for slow movements
const BASE_SMOOTHING = 0.25;

// Animation tick for glitter
let animTick = 0;

function setupCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', setupCanvas);
setupCanvas();

// ===== COLOR PICKER =====
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
    });
});

// ===== TOOLBAR =====
function clearAllDrawings() {
    drawings = [];
    currentPath = null;
    showGesture('🗑️ All Clear!');
}
window.clearAllDrawings = clearAllDrawings;

function undoDrawing() {
    if (drawings.length > 0) {
        drawings.pop();
        showGesture('↩️ Undo!');
    }
}
window.undoDrawing = undoDrawing;

function showGesture(text) {
    gestureIndicator.textContent = text;
    gestureIndicator.classList.add('show');
    clearTimeout(gestureIndicator._timer);
    gestureIndicator._timer = setTimeout(() => {
        gestureIndicator.classList.remove('show');
    }, 1200);
}

// ===== GESTURE DETECTION =====
function getDistance(p1, p2) {
    return Math.sqrt(
        Math.pow((p1.x - p2.x) * canvasElement.width, 2) +
        Math.pow((p1.y - p2.y) * canvasElement.height, 2)
    );
}

function getRawDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Only index finger up
function isStrictlyIndexUp(lm) {
    const indexOpen = lm[8].y < lm[6].y;
    const middleOpen = lm[12].y < lm[10].y;
    const ringOpen = lm[16].y < lm[14].y;
    const pinkyOpen = lm[20].y < lm[18].y;
    const thumbOpen = lm[4].x < lm[3].x; // simplified thumb check
    return indexOpen && !middleOpen && !ringOpen && !pinkyOpen;
}

// Index + Middle up (hover / pointer)
function isIndexAndMiddleUp(lm) {
    const indexOpen = lm[8].y < lm[6].y;
    const middleOpen = lm[12].y < lm[10].y;
    const ringOpen = lm[16].y < lm[14].y;
    const pinkyOpen = lm[20].y < lm[18].y;
    return indexOpen && middleOpen && !ringOpen && !pinkyOpen;
}

// 3 Fingers up (eraser)
function isThreeFingersUp(lm) {
    const indexOpen = lm[8].y < lm[6].y;
    const middleOpen = lm[12].y < lm[10].y;
    const ringOpen = lm[16].y < lm[14].y;
    const pinkyOpen = lm[20].y < lm[18].y;
    return indexOpen && middleOpen && ringOpen && !pinkyOpen;
}

// Pinch detection — use raw normalized distance between thumb tip and index tip
function isPinching(lm) {
    const dist = getRawDistance(lm[4], lm[8]);
    return dist < 0.06; // very tight pinch in normalized coords
}

// Find drawing near a point (using bounding box for easier shape grabbing)
function findDrawingAt(x, y) {
    const padding = 50;
    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.points.length === 0) continue;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let p of d.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        if (x >= minX - padding && x <= maxX + padding && y >= minY - padding && y <= maxY + padding) {
            return d;
        }
    }
    return null;
}

// ===== ERASER =====
function eraseAt(ex, ey) {
    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        const origIndices = d.points.map((p) => ({
            ...p,
            keep: Math.hypot(p.x - ex, p.y - ey) > ERASER_RADIUS
        }));

        const anyErased = origIndices.some(p => !p.keep);
        if (!anyErased) continue;

        const allErased = origIndices.every(p => !p.keep);
        if (allErased) {
            drawings.splice(i, 1);
            continue;
        }

        // Split into contiguous kept segments
        const newSegments = [];
        let segment = [];
        for (const p of origIndices) {
            if (p.keep) {
                segment.push({ x: p.x, y: p.y });
            } else {
                if (segment.length >= 2) newSegments.push(segment);
                segment = [];
            }
        }
        if (segment.length >= 2) newSegments.push(segment);

        drawings.splice(i, 1);
        for (const seg of newSegments) {
            drawings.splice(i, 0, {
                points: seg,
                color: d.color,
                id: Date.now() + Math.random()
            });
        }
    }
}

function drawPointerCursor(x, y) {
    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 8, 0, Math.PI * 2);
    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    canvasCtx.fill();
    canvasCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.stroke();
    canvasCtx.restore();
}

function drawEraserCursor(x, y) {
    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    canvasCtx.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)';
    canvasCtx.lineWidth = 2.5;
    canvasCtx.setLineDash([6, 4]);
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);

    canvasCtx.beginPath();
    canvasCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    canvasCtx.fillStyle = isDarkTheme ? 'rgba(255,100,100,0.12)' : 'rgba(255,100,100,0.15)';
    canvasCtx.fill();

    const cs = 8;
    canvasCtx.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.beginPath();
    canvasCtx.moveTo(x - cs, y); canvasCtx.lineTo(x + cs, y);
    canvasCtx.moveTo(x, y - cs); canvasCtx.lineTo(x, y + cs);
    canvasCtx.stroke();
    canvasCtx.restore();
}

// ===== COLOR PICKER HOVER =====
function checkColorPickerHover(ix, iy) {
    const buttons = document.querySelectorAll('.color-btn');
    buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        const mirroredX = canvasElement.width - ix;
        if (
            mirroredX >= rect.left - 15 && mirroredX <= rect.right + 15 &&
            iy >= rect.top - 15 && iy <= rect.bottom + 15
        ) {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color;
        }
    });
}

// ===== GLITTER HELPERS =====
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

// Seeded pseudo-random for consistent glitter positions per-point
function seededRand(seed) {
    let x = Math.sin(seed) * 43758.5453123;
    return x - Math.floor(x);
}

// ===== SHAPE RECOGNITION =====
function recognizeAndRefineShape(path) {
    if (!path || path.points.length < 15) return;

    const pts = path.points;
    const first = pts[0];
    const last = pts[pts.length - 1];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const diag = Math.hypot(width, height);

    if (diag < 40) return; // Too small

    const closureDist = Math.hypot(first.x - last.x, first.y - last.y);
    const isClosed = closureDist < diag * 0.3;

    if (isClosed) {
        // Evaluate Circle
        const cx = minX + width / 2;
        const cy = minY + height / 2;
        const avgRadius = (width + height) / 4;
        const aspectRatio = Math.max(width, height) / Math.min(width, height);

        let circleMatched = false;
        if (aspectRatio < 1.4) { // Much looser aspect ratio
            let totalDeviation = 0;
            for (const p of pts) {
                const r = Math.hypot(p.x - cx, p.y - cy);
                totalDeviation += Math.abs(r - avgRadius);
            }
            const avgDeviation = totalDeviation / pts.length;

            if (avgDeviation < avgRadius * 0.25) { // Much looser radial deviation (25%)
                // Perfect Circle!
                const newPts = [];
                const steps = 40;
                for (let i = 0; i <= steps; i++) {
                    const angle = (i / steps) * Math.PI * 2;
                    newPts.push({
                        x: cx + Math.cos(angle) * avgRadius,
                        y: cy + Math.sin(angle) * avgRadius
                    });
                }
                path.points = newPts;
                showGesture('✨ Perfect Circle!');
                return;
            }
        }

        // Evaluate Rectangle / Square
        let edgeDev = 0;
        for (const p of pts) {
            const distLeft = Math.abs(p.x - minX);
            const distRight = Math.abs(p.x - maxX);
            const distTop = Math.abs(p.y - minY);
            const distBottom = Math.abs(p.y - maxY);
            edgeDev += Math.min(distLeft, distRight, distTop, distBottom);
        }
        
        if (edgeDev / pts.length < Math.min(width, height) * 0.15) { // Looser edge deviation (15%)
            // 1.35 aspect ratio for a square gives a lot more leeway
            const isSquare = Math.max(width, height) / Math.min(width, height) < 1.35;
            const sizeX = isSquare ? Math.max(width, height) : width;
            const sizeY = isSquare ? Math.max(width, height) : height;
            
            path.points = [
                { x: cx - sizeX / 2, y: cy - sizeY / 2 }, // Top Left
                { x: cx + sizeX / 2, y: cy - sizeY / 2 }, // Top Right
                { x: cx + sizeX / 2, y: cy + sizeY / 2 }, // Bottom Right
                { x: cx - sizeX / 2, y: cy + sizeY / 2 }, // Bottom Left
                { x: cx - sizeX / 2, y: cy - sizeY / 2 }  // Close line
            ];
            path.isShape = true;
            showGesture(isSquare ? '🟩 Perfect Square!' : '🔲 Perfect Rectangle!');
            return;
        }

        // Evaluate Triangle
        let topPt = pts[0], blPt = pts[0], brPt = pts[0];
        for (const p of pts) {
            if (p.y < topPt.y) topPt = p;
            if (p.x < blPt.x && p.y > cy) blPt = p;
            if (p.x > brPt.x && p.y > cy) brPt = p;
        }

        function distToSegment(p, v, w) {
            const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
            if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
            let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
        }

        let triDev = 0;
        for (const p of pts) {
            const d1 = distToSegment(p, topPt, blPt);
            const d2 = distToSegment(p, blPt, brPt);
            const d3 = distToSegment(p, brPt, topPt);
            triDev += Math.min(d1, d2, d3);
        }

        if (triDev / pts.length < Math.min(width, height) * 0.18) { // Looser triangle deviation (18%)
            path.points = [
                { x: topPt.x, y: topPt.y },
                { x: brPt.x, y: brPt.y },
                { x: blPt.x, y: blPt.y },
                { x: topPt.x, y: topPt.y }
            ];
            path.isShape = true;
            showGesture('🔺 Perfect Triangle!');
            return;
        }
    } else {
        // Evaluate Straight Line
        const lineLen = Math.hypot(last.x - first.x, last.y - first.y);
        if (lineLen > 60) {
            let totalDev = 0;
            for (const p of pts) {
                const num = Math.abs((last.y - first.y) * p.x - (last.x - first.x) * p.y + last.x * first.y - last.y * first.x);
                totalDev += num / lineLen;
            }
            if ((totalDev / pts.length) < 25) { // Looser line deviation
                // Perfect Straight Line!
                path.points = [first, last];
                path.isShape = true;
                showGesture('📏 Straight Line!');
            }
        }
    }
}

// ===== MAIN RESULTS CALLBACK =====
function onResults(results) {
    if (loadingScreen.style.display !== 'none') loadingScreen.style.display = 'none';

    animTick++;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Background
    canvasCtx.fillStyle = getCanvasBg();
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    drawStoredPaths();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const hand = results.multiHandLandmarks[0];
        const indexTip = hand[8];
        const middleTip = hand[12];
        const thumbTip = hand[4];

        const ringTip = hand[16];

        let ix = indexTip.x * canvasElement.width;
        let iy = indexTip.y * canvasElement.height;
        const mx = middleTip.x * canvasElement.width;
        const my = middleTip.y * canvasElement.height;
        const rx = ringTip.x * canvasElement.width;
        const ry = ringTip.y * canvasElement.height;
        const tx = thumbTip.x * canvasElement.width;
        const ty = thumbTip.y * canvasElement.height;

        // ERASER — 3 fingers up
        if (isThreeFingersUp(hand)) {
            const eraserX = (ix + mx + rx) / 3;
            const eraserY = (iy + my + ry) / 3;
            eraseAt(eraserX, eraserY);
            drawEraserCursor(eraserX, eraserY);
            currentPath = null;
            isDragging = false;
            selectedDrawing = null;
        }
        // HOVER — index + middle up
        else if (isIndexAndMiddleUp(hand)) {
            const hoverX = (ix + mx) / 2;
            const hoverY = (iy + my) / 2;
            drawPointerCursor(hoverX, hoverY);
            currentPath = null;
            isDragging = false;
            selectedDrawing = null;
        }
        // DRAW — only index up
        else if (isStrictlyIndexUp(hand) && !isPinching(hand)) {
            // Dynamic EMA Smoothing based on velocity
            if (smoothedPos.x === null) {
                smoothedPos.x = ix;
                smoothedPos.y = iy;
            } else {
                // Calculate distance moved this frame
                const dist = Math.hypot(ix - smoothedPos.x, iy - smoothedPos.y);
                
                // If moving fast (> 20px per frame), snap instantly (1.0 factor = no latency)
                // If moving slow, use heavy smoothing (BASE_SMOOTHING) for stability
                let dynamicFactor = BASE_SMOOTHING;
                if (dist > 5) {
                    // Ramp up the factor quickly based on speed
                    dynamicFactor = Math.min(1.0, BASE_SMOOTHING + (dist * 0.05));
                }

                smoothedPos.x += (ix - smoothedPos.x) * dynamicFactor;
                smoothedPos.y += (iy - smoothedPos.y) * dynamicFactor;
            }
            ix = smoothedPos.x;
            iy = smoothedPos.y;

            if (!currentPath) {
                currentPath = { points: [], color: currentColor, id: Date.now(), holdFrames: 0, isShape: false };
                drawings.push(currentPath);
            }

            const lastPt = currentPath.points[currentPath.points.length - 1];
            const distToLast = lastPt ? Math.hypot(lastPt.x - ix, lastPt.y - iy) : Infinity;

            // HOLD TO SNAP LOGIC
            if (distToLast < 8) {
                // Finger is holding still in roughly same spot
                currentPath.holdFrames++;
                if (currentPath.holdFrames > 18 && !currentPath.isShape) { // ~0.6 seconds hold
                    recognizeAndRefineShape(currentPath);
                }
            } else {
                currentPath.holdFrames = 0;
            }

            // Anti micro-jitter deadzone, and don't add points if already snapped to shape
            if (!currentPath.isShape && (!lastPt || distToLast > 2.5)) {
                currentPath.points.push({ x: ix, y: iy });
            }

            checkColorPickerHover(ix, iy);
            isDragging = false;
            selectedDrawing = null;
        }
        // PINCH → DRAG
        else if (isPinching(hand)) {
            smoothedPos = { x: null, y: null };
            const midX = (ix + tx) / 2;
            const midY = (iy + ty) / 2;

            if (!isDragging) {
                selectedDrawing = findDrawingAt(midX, midY);
                if (selectedDrawing) {
                    isDragging = true;
                    lastFingerPos = { x: midX, y: midY };
                }
            }

            if (isDragging && selectedDrawing) {
                const dx = midX - lastFingerPos.x;
                const dy = midY - lastFingerPos.y;
                selectedDrawing.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
                lastFingerPos = { x: midX, y: midY };
            }
            currentPath = null;
        }
        // IDLE
        else {
            currentPath = null;
            isDragging = false;
            selectedDrawing = null;
            smoothedPos = { x: null, y: null };
        }

        drawNeonSkeleton(hand);
    } else {
        currentPath = null;
        isDragging = false;
        selectedDrawing = null;
        smoothedPos = { x: null, y: null };
    }

    canvasCtx.restore();
}

// ===== DRAW STORED PATHS — GLITTER ANIMATED STROKES =====
function drawStoredPaths() {
    canvasCtx.lineCap = 'round';
    canvasCtx.lineJoin = 'round';

    drawings.forEach((d, dIdx) => {
        if (d.points.length < 2) return;

        const isSelected = selectedDrawing && selectedDrawing.id === d.id;
        const color = d.color || '#FF3B3B';
        const rgb = hexToRgb(color);

        canvasCtx.save();

        // Helper to draw smooth bezier curves across all lines, OR sharp lines for shapes
        const drawStroke = () => {
            canvasCtx.beginPath();
            if (d.points.length > 0) {
                canvasCtx.moveTo(d.points[0].x, d.points[0].y);
                if (d.isShape) {
                    // Geometric shapes need sharp sharp corners
                    for (let i = 1; i < d.points.length; i++) {
                        canvasCtx.lineTo(d.points[i].x, d.points[i].y);
                    }
                } else {
                    // Freehand drawings get smoothed out
                    for (let i = 1; i < d.points.length - 1; i++) {
                        const xc = (d.points[i].x + d.points[i + 1].x) / 2;
                        const yc = (d.points[i].y + d.points[i + 1].y) / 2;
                        canvasCtx.quadraticCurveTo(d.points[i].x, d.points[i].y, xc, yc);
                    }
                    if (d.points.length > 1) {
                        const last = d.points[d.points.length - 1];
                        canvasCtx.lineTo(last.x, last.y);
                    }
                }
            }
            if (d.isShape) {
                // Ensure sharp corners don't get rounded caps by overriding join
                canvasCtx.lineJoin = 'miter'; 
            } else {
                canvasCtx.lineJoin = 'round';
            }
            canvasCtx.stroke();
        };

        // === 1. Big soft glow layer ===
        canvasCtx.shadowBlur = isSelected ? 45 : 30;
        canvasCtx.shadowColor = isSelected ? '#ffff00' : color;
        canvasCtx.strokeStyle = isSelected ? 'rgba(255,255,0,0.5)' : `rgba(${rgb.r},${rgb.g},${rgb.b},0.4)`;
        canvasCtx.lineWidth = isSelected ? 34 : 28;
        drawStroke();

        // === 2. Main solid stroke ===
        canvasCtx.shadowBlur = 0;
        canvasCtx.strokeStyle = isSelected ? '#ffff00' : color;
        canvasCtx.lineWidth = isSelected ? 26 : 22;
        drawStroke();

        // === 3. Inner bright core ===
        canvasCtx.strokeStyle = isSelected ? '#fffde7' : `rgba(${Math.min(255,rgb.r+80)},${Math.min(255,rgb.g+80)},${Math.min(255,rgb.b+80)},0.7)`;
        canvasCtx.lineWidth = isSelected ? 8 : 6;
        drawStroke();

        canvasCtx.restore();

        // === 4. GLITTER PARTICLES along the stroke ===
        drawGlitterOnPath(d.points, rgb, dIdx);
    });
}

function drawGlitterOnPath(points, rgb, drawingIndex) {
    canvasCtx.save();

    const spacing = 3; // every 3rd point
    const time = animTick * 0.05;

    for (let i = 0; i < points.length; i += spacing) {
        const p = points[i];
        // Generate several glitter dots around each point
        const numDots = 5;
        for (let j = 0; j < numDots; j++) {
            const seed = (drawingIndex * 10000) + (i * 100) + j;
            const rand1 = seededRand(seed);
            const rand2 = seededRand(seed + 0.5);
            const rand3 = seededRand(seed + 1.0);
            const rand4 = seededRand(seed + 1.5);

            // Animate: twinkle by shifting brightness over time
            const twinkle = Math.sin(time + rand1 * 20) * 0.5 + 0.5;

            // Skip dim ones for performance
            if (twinkle < 0.25) continue;

            // Position offset from center of stroke
            const offsetX = (rand2 - 0.5) * 24;
            const offsetY = (rand3 - 0.5) * 24;

            const gx = p.x + offsetX;
            const gy = p.y + offsetY;

            // Size varies
            const size = rand4 * 3.0 + 0.8;

            // Color: mix between the base color and white for sparkle
            const mixWhite = twinkle * 0.7;
            const gr = Math.round(rgb.r + (255 - rgb.r) * mixWhite);
            const gg = Math.round(rgb.g + (255 - rgb.g) * mixWhite);
            const gb = Math.round(rgb.b + (255 - rgb.b) * mixWhite);

            canvasCtx.globalAlpha = twinkle * 0.9;
            canvasCtx.fillStyle = `rgb(${gr},${gg},${gb})`;
            canvasCtx.beginPath();
            canvasCtx.arc(gx, gy, size, 0, Math.PI * 2);
            canvasCtx.fill();
        }
    }

    canvasCtx.globalAlpha = 1;
    canvasCtx.restore();
}

// ===== NEON SKELETON =====
function drawNeonSkeleton(landmarks) {
    const blue = '#ffffff';
    canvasCtx.save();
    canvasCtx.shadowBlur = 15;
    canvasCtx.shadowColor = blue;
    canvasCtx.strokeStyle = blue;
    canvasCtx.lineWidth = 3;

    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],
        [0,17]
    ];

    connections.forEach(([a, b]) => {
        canvasCtx.beginPath();
        canvasCtx.moveTo(landmarks[a].x * canvasElement.width, landmarks[a].y * canvasElement.height);
        canvasCtx.lineTo(landmarks[b].x * canvasElement.width, landmarks[b].y * canvasElement.height);
        canvasCtx.stroke();
    });

    canvasCtx.fillStyle = blue;
    landmarks.forEach(point => {
        canvasCtx.beginPath();
        canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 4, 0, Math.PI * 2);
        canvasCtx.fill();
    });

    canvasCtx.restore();
}

// ===== INIT HAND TRACKING =====
function initHandTracking() {
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.75
    });

    hands.onResults(onResults);

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });
    camera.start();
}
