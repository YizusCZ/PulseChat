/**
 * PulseChat Radio — Audio Visualizer
 * Compact neon-styled frequency bar visualizer for the radio footer.
 */

let visualizerInitialized = false;
let analyser = null;
let animationId = null;

function initVisualizer(audioElement) {
    if (visualizerInitialized) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audioElement);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        visualizerInitialized = true;
        drawVisualizer();
    } catch (e) {
        console.warn('Visualizer init error:', e);
    }
}

function drawVisualizer() {
    const canvas = document.getElementById('radio-visualizer');
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const WIDTH = rect.width;
    const HEIGHT = rect.height;

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgba(8, 8, 12, 0.9)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const barCount = 32;
        const barWidth = (WIDTH / barCount) - 1.5;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i * step];
            const percent = value / 255;
            const barHeight = percent * HEIGHT * 0.9;
            const x = i * (barWidth + 1.5);
            const y = HEIGHT - barHeight;

            // Emerald gradient
            const g = Math.floor(180 + percent * 75);
            const alpha = 0.6 + percent * 0.4;
            ctx.fillStyle = `rgba(16, ${g}, 129, ${alpha})`;
            
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
            } else {
                ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();

            // Top glow
            if (percent > 0.5) {
                ctx.shadowColor = `rgba(52, 211, 153, 0.5)`;
                ctx.shadowBlur = 6;
                ctx.fillRect(x, y, barWidth, 1.5);
                ctx.shadowBlur = 0;
            }
        }
    }
    draw();
}

window.addEventListener('resize', () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
        drawVisualizer();
    }
});
