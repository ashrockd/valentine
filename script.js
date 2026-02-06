const button = document.getElementById('anxiousBtn');
const buttonyes = document.getElementById('yesBtn');
const buttonText = button.querySelector('.button-text');
const panicMessage = document.getElementById('panicMessage');
const buttonZone = document.querySelector('.button-zone');

let currentAnxietyLevel = 'calm';
let hasBeenClicked = false;
let isRunningAway = false;

// --- Background music with exposed low-pass filter controls ---
// Note: browsers require a user gesture to start audio; we start on first pointer/key interaction.
// Tweakables:
// - Default slider values live in index.html.
// - These constants control the "Yes" transition + filter opening behavior.
const SHOW_AUDIO_CONTROLS = false;
const YES_REVEAL_FLASH_MS = 800; // dip-to-white duration before the image fades in
const FILTER_OPEN_CUTOFF_HZ = 20000; // effectively "no low-pass"
const FILTER_OPEN_TIME_CONSTANT = 1.1; // larger = slower smoothing

const bgmEl = document.getElementById('bgm');
const audioControlsEl = document.querySelector('.audio-controls');
const audioStatusEl = document.getElementById('audioStatus');
const lpCutoffEl = document.getElementById('lpCutoff');
const lpCutoffValEl = document.getElementById('lpCutoffVal');
const lpQEl = document.getElementById('lpQ');
const lpQValEl = document.getElementById('lpQVal');
const bgmVolEl = document.getElementById('bgmVol');
const bgmVolValEl = document.getElementById('bgmVolVal');

let audioCtx = null;
let lpFilter = null;
let bgmGain = null;
let bgmSource = null;
let audioStarted = false;

if (audioControlsEl) {
    audioControlsEl.classList.toggle('is-hidden', !SHOW_AUDIO_CONTROLS);
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function updateAudioUI() {
    if (lpCutoffEl && lpCutoffValEl) lpCutoffValEl.textContent = String(lpCutoffEl.value);
    if (lpQEl && lpQValEl) lpQValEl.textContent = String(lpQEl.value);
    if (bgmVolEl && bgmVolValEl) bgmVolValEl.textContent = String(bgmVolEl.value);
}

function applyFilterSettings() {
    if (!audioCtx || !lpFilter) return;

    const now = audioCtx.currentTime;
    const cutoff = clamp(parseFloat(lpCutoffEl?.value ?? '1200'), 40, 20000);
    const q = clamp(parseFloat(lpQEl?.value ?? '0.8'), 0.0001, 30);

    lpFilter.frequency.cancelScheduledValues(now);
    lpFilter.frequency.setTargetAtTime(cutoff, now, 0.03);

    lpFilter.Q.cancelScheduledValues(now);
    lpFilter.Q.setTargetAtTime(q, now, 0.03);
}

function applyVolume() {
    if (!audioCtx || !bgmGain) return;
    const now = audioCtx.currentTime;
    const vol = clamp(parseFloat(bgmVolEl?.value ?? '0.35'), 0, 1);
    bgmGain.gain.cancelScheduledValues(now);
    bgmGain.gain.setTargetAtTime(vol, now, 0.03);
}

async function ensureAudioStarted() {
    if (!bgmEl) return;
    if (audioStarted) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
        if (audioStatusEl) audioStatusEl.textContent = 'AudioContext not supported';
        return;
    }

    audioCtx = new AC();
    lpFilter = audioCtx.createBiquadFilter();
    lpFilter.type = 'lowpass';

    bgmGain = audioCtx.createGain();

    // Media element sources can only be created once per audio element.
    bgmSource = audioCtx.createMediaElementSource(bgmEl);
    bgmSource.connect(lpFilter);
    lpFilter.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);

    updateAudioUI();
    applyFilterSettings();
    applyVolume();

    try {
        await audioCtx.resume();
        await bgmEl.play();
        audioStarted = true;
        if (audioStatusEl) audioStatusEl.textContent = 'Playing';
    } catch (err) {
        if (audioStatusEl) audioStatusEl.textContent = 'Click to start (autoplay blocked)';
        // Swallow: user can click again, or provide a valid audio file at audio/bgm.mp3.
    }
}

function removeLowPassFilterSmooth() {
    if (!audioCtx || !lpFilter) return;
    const now = audioCtx.currentTime;

    // Smoothly "remove" the low-pass effect by opening the cutoff all the way up.
    lpFilter.frequency.cancelScheduledValues(now);
    lpFilter.frequency.setTargetAtTime(FILTER_OPEN_CUTOFF_HZ, now, FILTER_OPEN_TIME_CONSTANT);

    // Lower resonance to avoid a noticeable peak while the filter opens.
    lpFilter.Q.cancelScheduledValues(now);
    lpFilter.Q.setTargetAtTime(0.0001, now, FILTER_OPEN_TIME_CONSTANT);

    if (audioStatusEl) audioStatusEl.textContent = 'Filter opened';
}

// Start audio on first interaction anywhere on the page.
document.addEventListener('pointerdown', () => { ensureAudioStarted(); }, { once: true });
document.addEventListener('keydown', () => { ensureAudioStarted(); }, { once: true });

// Live tweak controls.
if (lpCutoffEl) lpCutoffEl.addEventListener('input', () => { updateAudioUI(); applyFilterSettings(); });
if (lpQEl) lpQEl.addEventListener('input', () => { updateAudioUI(); applyFilterSettings(); });
if (bgmVolEl) bgmVolEl.addEventListener('input', () => { updateAudioUI(); applyVolume(); });
updateAudioUI();

// Panic messages for different anxiety levels
const panicMessages = {
    'slightly-nervous': [
        "Um... hi there?",
        "Oh, you're getting close...",
        "I see you...",
        "Please be gentle..."
    ],
    'nervous': [
        "Wait, what are you doing?",
        "I'm not ready for this!",
        "Can we talk about this?",
        "Please don't!",
        "I'm getting nervous..."
    ],
    'very-nervous': [
        "No no no no no!",
        "PLEASE STOP!",
        "I can't handle this!",
        "Why are you doing this?!",
        "I'm literally shaking!",
        "BACK AWAY!"
    ],
    'panicking': [
        "I'M FREAKING OUT!!!",
        "NOOOOOO!!!",
        "SOMEBODY HELP!!!",
        "I CAN'T BREATHE!",
        "THIS IS TOO MUCH!",
        "LEAVE ME ALONE!!!",
        "I'M OUTTA HERE!"
    ]
};

// Success messages
const successMessages = [
    "You did it! 🎉",
    "I'm okay! 💚",
    "That wasn't so bad!",
    "We're friends now! 😊",
    "Phew! I survived!"
];

let messageTimeout;

// Calculate distance between cursor and button
function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Get button center position
function getButtonCenter() {
    const rect = button.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

// Update anxiety level based on distance
function updateAnxietyLevel(distance) {
    let newLevel;

    if (distance > 200) {
        newLevel = 'calm';
    } else if (distance > 150) {
        newLevel = 'slightly-nervous';
    } else if (distance > 100) {
        newLevel = 'nervous';
    } else if (distance > 60) {
        newLevel = 'very-nervous';
    } else {
        newLevel = 'panicking';
    }

    if (newLevel !== currentAnxietyLevel) {
        currentAnxietyLevel = newLevel;
        updateButtonState();
    }
}

// Update button appearance and show messages
function updateButtonState() {
    // Remove all anxiety classes
    button.classList.remove('calm', 'slightly-nervous', 'nervous', 'very-nervous', 'panicking');
    document.body.classList.remove('level-calm', 'level-slightly-nervous', 'level-nervous', 'level-very-nervous', 'level-panicking');

    // Add current anxiety class
    button.classList.add(currentAnxietyLevel);
    document.body.classList.add('level-' + currentAnxietyLevel);

    // Show panic message for nervous states
    if (currentAnxietyLevel !== 'calm' && !hasBeenClicked) {
        showPanicMessage();
    } else if (currentAnxietyLevel === 'calm') {
        hidePanicMessage();
    }
}

// Show a random panic message
function showPanicMessage() {
    if (panicMessages[currentAnxietyLevel]) {
        const messages = panicMessages[currentAnxietyLevel];
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];

        panicMessage.textContent = randomMessage;
        panicMessage.classList.add('show');

        // Clear previous timeout
        clearTimeout(messageTimeout);

        // Hide message after 2 seconds if level doesn't change
        messageTimeout = setTimeout(() => {
            if (currentAnxietyLevel !== 'panicking') {
                hidePanicMessage();
            }
        }, 2000);
    }
}

// Hide panic message
function hidePanicMessage() {
    panicMessage.classList.remove('show');
}

// Move button away from cursor
function moveButtonAway(cursorX, cursorY) {
    if (hasBeenClicked || isRunningAway) return;

    const buttonCenter = getButtonCenter();
    const distance = getDistance(cursorX, cursorY, buttonCenter.x, buttonCenter.y);

    // Only run away when panicking
    if (currentAnxietyLevel === 'panicking' && distance < 80) {
        isRunningAway = true;
        button.classList.add('running');

        // Calculate direction away from cursor
        const angle = Math.atan2(buttonCenter.y - cursorY, buttonCenter.x - cursorX);
        const moveDistance = 150;

        const newX = Math.cos(angle) * moveDistance;
        const newY = Math.sin(angle) * moveDistance;

        // Get button zone boundaries
        const zoneRect = buttonZone.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();

        // Calculate new position relative to button zone
        let finalX = buttonCenter.x - zoneRect.left + newX - buttonRect.width / 2;
        let finalY = buttonCenter.y - zoneRect.top + newY - buttonRect.height / 2;

        // Keep button within boundaries
        const margin = 50;
        finalX = Math.max(margin, Math.min(zoneRect.width - buttonRect.width - margin, finalX));
        finalY = Math.max(margin, Math.min(zoneRect.height - buttonRect.height - margin, finalY));

        button.style.left = finalX + 'px';
        button.style.top = finalY + 'px';

        // Reset running state
        setTimeout(() => {
            button.classList.remove('running');
            isRunningAway = false;
        }, 200);
    }
}

// Track mouse movement
document.addEventListener('mousemove', (e) => {
    if (hasBeenClicked) return;

    const buttonCenter = getButtonCenter();
    const distance = getDistance(e.clientX, e.clientY, buttonCenter.x, buttonCenter.y);

    // Add micro-jitter for realism when nervous
    if (currentAnxietyLevel !== 'calm' && !isRunningAway) {
        const jitterX = (Math.random() - 0.5) * 4;
        const jitterY = (Math.random() - 0.5) * 4;
        button.style.transform = `translate(${jitterX}px, ${jitterY}px)`;
    } else if (!isRunningAway) {
        button.style.transform = '';
    }

    updateAnxietyLevel(distance);
    moveButtonAway(e.clientX, e.clientY);
});

// Handle button click
button.addEventListener('click', (e) => {
    e.preventDefault();

    if (!hasBeenClicked) {
        hasBeenClicked = true;

        // Final ultimate prank: BSOD after a short delay
        setTimeout(() => {
            const bsod = document.getElementById('bsod');
            bsod.classList.add('active');

            // Hide the container to sell the effect
            document.querySelector('.container').style.opacity = '0';
            document.body.style.background = '#0078d7';
        }, 800);

        // Remove all anxiety classes
        button.classList.remove('calm', 'slightly-nervous', 'nervous', 'very-nervous', 'panicking', 'running');

        // Add clicked state
        button.classList.add('clicked');

        // Show success message
        const randomSuccess = successMessages[Math.floor(Math.random() * successMessages.length)];
        buttonText.textContent = randomSuccess;

        // Hide panic message
        hidePanicMessage();

        // Create confetti
        createConfetti();
    }
});

// Create confetti effect
function createConfetti() {
    const colors = ['#FFE66D', '#FF6B6B', '#4ECDC4', '#95E1D3', '#A8E6CF'];
    const buttonRect = button.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;

    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = centerX + (Math.random() - 0.5) * 100 + 'px';
            confetti.style.top = centerY + 'px';
            confetti.style.width = Math.random() * 10 + 5 + 'px';
            confetti.style.height = confetti.style.width;
            confetti.style.animationDuration = Math.random() * 2 + 2 + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';

            document.body.appendChild(confetti);

            setTimeout(() => {
                confetti.remove();
            }, 4000);
        }, i * 20);
    }
}

// Reset button to initial state
function resetButton() {
    hasBeenClicked = false;
    currentAnxietyLevel = 'calm';

    button.classList.remove('clicked');
    button.classList.add('calm');
    buttonText.textContent = 'Click Me?';

    // Reset position to center
    button.style.left = '';
    button.style.top = '';
}

// Initialize button state
button.classList.add('calm');

// Handle yes button click
buttonyes.addEventListener('click', (e) => {
    e.preventDefault();

    if (!hasBeenClicked) {
        hasBeenClicked = true;

        // Ensure audio is running (user gesture = this click), then open the filter during the transition.
        ensureAudioStarted().finally(() => {
            removeLowPassFilterSmooth();
        });

        // Fullscreen reveal with a dip-to-white + fade in to image.
        const reveal = document.getElementById('yesReveal');
        const flash = reveal?.querySelector('.yes-reveal__flash');
        const img = document.getElementById('yesRevealImg');
        if (reveal && flash && img) {
            reveal.classList.add('active');
            reveal.setAttribute('aria-hidden', 'false');

            flash.classList.add('on');
            img.classList.remove('show');

            // Quick flash, then fade in the image.
            setTimeout(() => {
                flash.classList.remove('on');
                img.classList.add('show');
            }, YES_REVEAL_FLASH_MS);
        }

        // Add clicked state
        buttonyes.classList.add('clicked');



        // Hide panic message
        hidePanicMessage();

        // Create confetti
        createConfetti();
    }
});
