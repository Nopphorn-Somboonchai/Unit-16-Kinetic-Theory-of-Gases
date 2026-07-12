// ====================================================
// JAVASCRIPT SYSTEM - KINETIC THEORY OF GASES
// ====================================================

// --- Constants ---
const R_GAS = 8.31;
const kB = 1.38e-23;
const NA = 6.02e23;
const EXAM_STATE_KEY = 'exam_session_kinetic_theory';

// --- Application State ---
const AppState = {
    // Navigation
    currentSection: 'home',
    currentPracticeTopic: '16-3-1',
    currentPracticeQuestion: null,

    // Exam State
    currentExamQuestions: [],
    examTimerInterval: null,
    examTimeRemaining: 600,
    examDurationSeconds: 600,
    examStartTimestamp: null,
    examDeadlineTimestamp: null,
    examIsActive: false,
    examSubmissionInProgress: false,
    examStudentInfo: {},
    examExitGuardEnabled: false,

    // Simulation State (Canvas & Timer refs)
    gasPressureAnimFrame: null,
    gasPressureInterval: null,
    gasParts: [],
    wallHitsCount: 0
};

// --- Helper Math / Format Functions ---
function formatSci(num, sigFigs = 3) {
    if (num === 0) return "0";
    return num.toExponential(sigFigs - 1).replace('e', ' \\times 10^{').replace('+', '') + '}';
}

function cleanAndParseNumber(str) {
    let clean = str.trim().toLowerCase().replace(/\\times/g, 'e').replace(/x/g, 'e').replace(/\*/g, 'e').replace(/10\^/g, '').replace(/\{/g, '').replace(/\}/g, '').replace(/\s+/g, '');
    if (clean.includes('e')) {
        const parts = clean.split('e');
        return parseFloat(parts[0]) * Math.pow(10, parseFloat(parts[1]));
    }
    return parseFloat(clean);
}

function isNumericAnswerCorrect(userStr, targetNumOrArr) {
    if (!userStr) return false;
    const parsedUser = cleanAndParseNumber(userStr);
    if (isNaN(parsedUser)) return false;
    const targets = Array.isArray(targetNumOrArr) ? targetNumOrArr : [targetNumOrArr];
    return targets.some(targetNum => {
        if (Math.abs(targetNum) < 1e-9) return Math.abs(parsedUser) < 1e-9;
        return Math.abs(parsedUser - targetNum) / Math.abs(targetNum) < 0.01; // 1% error margin
    });
}

function formatExamTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// --- Navigation & Core UI ---
function showSection(sectionId) {
    let norm = sectionId.startsWith('sec-') ? sectionId.slice(4) : sectionId;
    if (AppState.examIsActive && !['exam-live', 'exam-result'].includes(norm)) {
        triggerAlert("กำลังสอบ", "กรุณาส่งข้อสอบก่อนออกจากหน้านี้ครับ", "fa-lock", "bg-amber-100 text-amber-600");
        norm = 'exam-live';
    }
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.add('hidden');

    ['home', 'review', 'practice', 'exam-start', 'exam-live', 'exam-result'].forEach(s => {
        const sec = document.getElementById('sec-' + s);
        if (sec) sec.classList.toggle('hidden', s !== norm);
    });

    if (norm !== 'exam-live' && !AppState.examIsActive) {
        clearInterval(AppState.examTimerInterval);
    }
    AppState.currentSection = norm;
    window.scrollTo(0, 0);
    renderMath();
}

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.toggle('hidden');
}

function triggerAlert(title, message, iconClass = 'fa-info', colorClass = 'bg-slate-100 text-slate-800') {
    const m = document.getElementById('modal-alert');
    const c = document.getElementById('modal-alert-card');
    const i = document.getElementById('modal-alert-icon');
    
    if (m && c && i) {
        document.getElementById('modal-alert-title').innerText = title;
        document.getElementById('modal-alert-msg').innerText = message;
        i.className = `w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl ${colorClass}`;
        i.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        m.classList.remove('hidden');
        setTimeout(() => { c.classList.remove('scale-95', 'opacity-0'); }, 10);
    }
}

function closeAlertModal() {
    const m = document.getElementById('modal-alert');
    const c = document.getElementById('modal-alert-card');
    if (m && c) {
        c.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { m.classList.add('hidden'); }, 200);
    }
}

// --- Performance & Optimization Helpers ---
function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function debounce(func, delay) {
    let timeout;
    return function () {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

let mathjaxQueue = Promise.resolve();
const pendingMathElements = new Set();
let mathjaxTimeout = null;

function queueTypeset(element) {
    if (typeof MathJax === 'undefined' || !MathJax.typesetPromise) return;
    if (element) {
        pendingMathElements.add(element);
    }
    if (mathjaxTimeout) {
        clearTimeout(mathjaxTimeout);
    }
    mathjaxTimeout = setTimeout(() => {
        const elements = pendingMathElements.size > 0 ? Array.from(pendingMathElements) : null;
        pendingMathElements.clear();
        mathjaxQueue = mathjaxQueue
            .then(() => {
                if (elements) {
                    MathJax.typesetClear(elements);
                    return MathJax.typesetPromise(elements);
                } else {
                    return MathJax.typesetPromise();
                }
            })
            .catch(err => console.warn("MathJax typeset error:", err));
    }, 100);
}

function renderMath() {
    queueTypeset(null);
}

// --- Review Tabs Logic ---
function switchReviewTab(tabName) {
    ['16-3-1', '16-3-2', '16-3-3'].forEach(t => {
        const btn = document.getElementById(`btn-tab-${t}`);
        const tab = document.getElementById(`review-tab-${t}`);
        if (btn && tab) {
            if (t === tabName) {
                btn.className = "flex-1 min-w-[140px] text-center py-2 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-indigo-700 shadow-sm border border-slate-200/50";
                tab.classList.remove('hidden');
            } else {
                btn.className = "flex-1 min-w-[140px] text-center py-2 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50";
                tab.classList.add('hidden');
            }
        }
    });
    stopSimulations();
    if (tabName === '16-3-1') initGasPressureSim();
    if (tabName === '16-3-3') calculateVrms();
}

function stopSimulations() {
    if (AppState.gasPressureAnimFrame) {
        cancelAnimationFrame(AppState.gasPressureAnimFrame);
        AppState.gasPressureAnimFrame = null;
    }
    if (AppState.gasPressureInterval) {
        clearInterval(AppState.gasPressureInterval);
        AppState.gasPressureInterval = null;
    }
}

// --- SIM 1: Origin of Pressure (Canvas) ---
function initGasPressureSim() {
    const canvas = document.getElementById('gas-pressure-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sSpeed = document.getElementById('sim1-slider-speed');
    const sNum = document.getElementById('sim1-slider-num');
    const lblS = document.getElementById('lbl-sim1-speed');
    const lblN = document.getElementById('lbl-sim1-num');
    const lblP = document.getElementById('lbl-sim1-pressure');
    const lblRate = document.getElementById('sim1-collision-rate');

    if (!sSpeed || !sNum) return;

    let currentSpeed = parseFloat(sSpeed.value);
    let currentNum = parseInt(sNum.value);

    const createParticles = (N) => {
        AppState.gasParts = [];
        for (let i = 0; i < N; i++) {
            const angle = Math.random() * 2 * Math.PI;
            AppState.gasParts.push({
                x: Math.random() * (canvas.width - 20) + 10,
                y: Math.random() * (canvas.height - 20) + 10,
                vx: Math.cos(angle),
                vy: Math.sin(angle),
                r: 3
            });
        }
    };

    createParticles(currentNum);

    const updateUI = () => {
        let tempText = "ปกติ (300 K)";
        if (currentSpeed > 3) tempText = "ร้อนมาก";
        else if (currentSpeed < 1.5) tempText = "เย็น";
        
        if (lblS && lblS.innerText !== tempText) lblS.innerText = tempText;

        // P ~ N * v^2 
        const P_relative = (currentNum / 50) * (currentSpeed * currentSpeed / 4);
        const pStr = P_relative.toFixed(2);
        if (lblP && lblP.innerText !== pStr) lblP.innerText = pStr;
    };

    updateUI();

    sSpeed.oninput = throttle(() => {
        currentSpeed = parseFloat(sSpeed.value);
        updateUI();
    }, 30);

    sNum.oninput = throttle(() => {
        currentNum = parseInt(sNum.value);
        if (lblN) lblN.innerText = `${currentNum} อนุภาค`;
        createParticles(currentNum);
        updateUI();
    }, 50);

    if (AppState.gasPressureInterval) clearInterval(AppState.gasPressureInterval);
    AppState.gasPressureInterval = setInterval(() => {
        const rate = AppState.wallHitsCount;
        let text = "การชน: ต่ำ";
        let colorClass = "text-sky-400";
        if (rate > 200) {
            text = "การชน: สูงมาก";
            colorClass = "text-rose-400";
        } else if (rate > 100) {
            text = "การชน: สูง";
            colorClass = "text-amber-400";
        }
        if (lblRate) {
            if (lblRate.innerText !== text) lblRate.innerText = text;
            if (lblRate.className !== colorClass) lblRate.className = colorClass;
        }
        AppState.wallHitsCount = 0;
    }, 500);

    const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#818cf8';
        ctx.beginPath();
        AppState.gasParts.forEach(p => {
            p.x += p.vx * currentSpeed;
            p.y += p.vy * currentSpeed;

            let hit = false;
            if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; hit = true; }
            if (p.x + p.r > canvas.width) { p.x = canvas.width - p.r; p.vx *= -1; hit = true; }
            if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; hit = true; }
            if (p.y + p.r > canvas.height) { p.y = canvas.height - p.r; p.vy *= -1; hit = true; }

            if (hit) AppState.wallHitsCount++;

            ctx.moveTo(p.x + p.r, p.y);
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        });
        ctx.fill();
        AppState.gasPressureAnimFrame = requestAnimationFrame(loop);
    };
    loop();
}

// --- SIM 3: Vrms Calculator ---
const M_MAP = {
    "0.002": "2", "0.004": "4", "0.028": "28", "0.032": "32", "0.044": "44"
};

const debounceCalculateVrmsMath = debounce((T, M_kg) => {
    const mathDiv = document.getElementById('calc-vrms-math');
    if (mathDiv) {
        mathDiv.innerHTML = `
          <div>\\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\)</div>
          <div>\\( v_{rms} = \\sqrt{\\frac{3(8.31)(${T})}{${M_kg}}} \\)</div>
        `;
        queueTypeset(mathDiv);
    }
}, 150);

function calculateVrms() {
    const tempInput = document.getElementById('calc-vrms-temp');
    const gasSelect = document.getElementById('calc-vrms-gas');
    if (!tempInput || !gasSelect) return;

    const T = parseFloat(tempInput.value) || 300;
    const M_kg = parseFloat(gasSelect.value) || 0.032;
    const gasName = gasSelect.options[gasSelect.selectedIndex].text.split(' -')[0];

    const v = Math.sqrt((3 * R_GAS * T) / M_kg);
    const resultSpan = document.getElementById('calc-vrms-result');
    if (resultSpan) resultSpan.innerText = v.toFixed(2);

    debounceCalculateVrmsMath(T, M_kg);

    const v_light = Math.sqrt((3 * R_GAS * T) / 0.002);
    const dur_light = Math.max(0.1, 2 * (483 / v_light));
    const dur_selected = Math.max(0.1, 2 * (483 / v));

    document.querySelectorAll('.anim-light').forEach(el => el.style.animationDuration = dur_light + 's');
    document.querySelectorAll('.anim-heavy').forEach(el => el.style.animationDuration = dur_selected + 's');

    const lblGasB = document.getElementById('lbl-sim3-gasB');
    if (lblGasB) {
        lblGasB.innerHTML = `<i class="fa-solid fa-circle text-rose-400 text-[12px] align-middle mr-1"></i> แก๊สที่เลือก (${gasName})`;
    }
}

// --- Dynamic Question Templates (16.3 Kinetic Theory) ---
class SeededRNG {
    constructor(seedStr) {
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
        this.seed = hash || 1;
    }
    random() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

const QUESTION_TEMPLATES = [
    // 16.3.1 ความดันของแก๊ส (Theory)
    {
        id: '16_3_1_q1', topic: '16.3.1', type: 'choice',
        title: 'ที่มาของความดันแก๊ส',
        choices: [
            'เกิดจากการที่โมเลกุลของแก๊สชนผนังภาชนะแล้วสะท้อนกลับ ทำให้เกิดแรงดลเฉลี่ยกระทำต่อพื้นที่ผนัง',
            'เกิดจากแรงดึงดูดระหว่างโมเลกุลของแก๊สที่ดึงให้ผนังภาชนะหดตัวเข้าหากัน',
            'เกิดจากน้ำหนักของโมเลกุลแก๊สทั้งหมดที่กดทับลงบนก้นภาชนะเพียงอย่างเดียว',
            'เกิดจากการขยายตัวของปริมาตรโมเลกุลแก๊สเมื่อได้รับความร้อนจนเบียดผนังภาชนะ'
        ],
        text: () => `ตามทฤษฎีจลน์ของแก๊ส "ความดัน (Pressure)" ของแก๊สในภาชนะปิดเกิดขึ้นจากสาเหตุใดเป็นหลัก`,
        generate: (r) => ({ params: {}, answers: ['เกิดจากการที่โมเลกุลของแก๊สชนผนังภาชนะแล้วสะท้อนกลับ ทำให้เกิดแรงดลเฉลี่ยกระทำต่อพื้นที่ผนัง'], answersRaw: [0], explanation: () => `ตามทฤษฎีจลน์ ความดันเกิดจากการที่โมเลกุลแก๊สเคลื่อนที่แบบสุ่มพุ่งชนผนังและสะท้อนกลับแบบยืดหยุ่น การเปลี่ยนโมเมนตัมนี้ทำให้เกิดแรงดล (Impulse) และเมื่อรวมแรงดลจากทุกโมเลกุลต่อหนึ่งหน่วยพื้นที่ จะกลายเป็นความดันที่แก๊สกระทำต่อผนัง` })
    },
    {
        id: '16_3_1_q2', topic: '16.3.1', type: 'choice',
        title: 'ความสัมพันธ์ของความดันและ \\( v_{rms} \\)',
        choices: [
            'ความดันแปรผันตรงกับกำลังสองของอัตราเร็ว RMS (\\( v_{rms}^2 \\))',
            'ความดันแปรผกผันกับอัตราเร็ว RMS (\\( 1/v_{rms} \\))',
            'ความดันไม่มีความเกี่ยวข้องกับอัตราเร็วของโมเลกุล',
            'ความดันแปรผันตรงกับรากที่สองของอัตราเร็ว RMS (\\( \\sqrt{v_{rms}} \\))'
        ],
        text: () => `จากสมการความดันของแก๊สตามทฤษฎีจลน์ \\( P = \\frac{1}{3}\\rho v_{rms}^2 \\) ข้อใดสรุปความสัมพันธ์ได้ถูกต้อง (เมื่อความหนาแน่นคงตัว)`,
        generate: (r) => ({ params: {}, answers: ['ความดันแปรผันตรงกับกำลังสองของอัตราเร็ว RMS (\\( v_{rms}^2 \\))'], answersRaw: [0], explanation: () => `จากสมการ \\( P = \\frac{1}{3}\\rho v_{rms}^2 \\) จะเห็นว่าความดัน \\(P\\) แปรผันตรงกับ \\(v_{rms}^2\\) นั่นคือถ้าโมเลกุลวิ่งเร็วขึ้น ความดันจะเพิ่มขึ้นอย่างมาก เพราะชนผนังบ่อยขึ้นและชนแรงขึ้นด้วย` })
    },
    {
        id: '16_3_1_q_understanding_1', topic: '16.3.1', type: 'choice',
        title: 'อุณหภูมิต่อความดันแก๊สในปริมาตรคงตัว',
        choices: [
            'มีผล เพราะเมื่อเพิ่มอุณหภูมิ พลังงานจลน์เฉลี่ยและอัตราเร็วของโมเลกุลจะเพิ่มขึ้น ทำให้ชนผนังบ่อยและแรงขึ้น ความดันจึงสูงขึ้น และในทางตรงกันข้ามเมื่อลดอุณหภูมิ',
            'ไม่มีผล เพราะการเพิ่มหรือลดอุณหภูมิในภาชนะปิดที่มีปริมาตรคงตัว ความดันของระบบจะคงเดิมเสมอตามกฎของแก๊สอุดมคติ \\(PV = nRT\\)',
            'มีผล เพราะเมื่อเพิ่มอุณหภูมิ โมเลกุลจะมีมวลและขนาดใหญ่ขึ้นเบียดผนังภาชนะทำให้ความดันสูงขึ้น โดยอัตราเร็วเท่าเดิม',
            'ไม่มีผล เพราะการเปลี่ยนแปลงอุณหภูมิสัมบูรณ์ส่งผลกระทบต่ออัตราเร็วของโมเลกุลแก๊สเท่านั้น แต่ไม่ได้ส่งผลต่อความถี่ในการชนผนัง'
        ],
        text: () => `การเพิ่มและลดอุณหภูมิของแก๊สในภาชนะปิดปริมาตรคงตัว มีผลต่อการเปลี่ยนแปลงความดันของแก๊สหรือไม่ เพราะเหตุใด (อ้างอิง ตรวจสอบความเข้าใจ 16.3 ข้อ 1)`,
        generate: (r) => ({
            params: {},
            answers: ['มีผล เพราะเมื่อเพิ่มอุณหภูมิ พลังงานจลน์เฉลี่ยและอัตราเร็วของโมเลกุลจะเพิ่มขึ้น ทำให้ชนผนังบ่อยและแรงขึ้น ความดันจึงสูงขึ้น และในทางตรงกันข้ามเมื่อลดอุณหภูมิ'],
            answersRaw: [0],
            explanation: () => `มีผลต่อการเปลี่ยนแปลงความดันของแก๊สอย่างชัดเจน<br>1. **การเพิ่มอุณหภูมิ:** ทำให้อุณหภูมิสัมบูรณ์ \\(T\\) เพิ่มขึ้น ส่งผลให้พลังงานจลน์เฉลี่ย \\(\\bar{E}_k\\) และอัตราเร็วของโมเลกุลเพิ่มขึ้น เมื่อชนกับผนังภาชนะจึงเกิดแรงดลเฉลี่ยกระทำต่อผนังมากขึ้นและความถี่ในการชนผนังก็เพิ่มขึ้น ส่งผลให้ความดันสูงขึ้น<br>2. **การลดอุณหภูมิ:** ในทำนองตรงกันข้าม พลังงานจลน์เฉลี่ยและอัตราเร็วของโมเลกุลจะลดลง ทำให้ความถี่ในการชนและแรงดลที่กระทำต่อผนังลดลง ส่งผลให้ความดันลดลง`
        })
    },
    {
        id: '16_3_1_q_understanding_3a', topic: '16.3.1', type: 'choice',
        title: 'เปรียบเทียบอุณหภูมิของแก๊สในกล่อง 2 ใบ',
        choices: [
            'เท่ากัน เนื่องจากแก๊สในกล่องแต่ละใบมีความดัน ปริมาตร และจำนวนโมลเท่ากัน ตามกฎของแก๊สอุดมคติ \\(PV = nRT\\)',
            'ไม่เท่ากัน โดยแก๊สไนโตรเจนมีอุณหภูมิสูงกว่า เนื่องจากมีมวลโมเลกุลน้อยกว่า ทำให้เกิดความร้อนง่ายกว่า',
            'ไม่เท่ากัน โดยแก๊สออกซิเจนมีอุณหภูมิสูงกว่า เนื่องจากแก๊สออกซิเจนมีความจุความร้อนจำเพาะต่ำกว่า',
            'ไม่สามารถสรุปได้เนื่องจากเป็นแก๊สคนละชนิดกัน และไม่มีข้อมูลเกี่ยวกับความเร็วเฉลี่ยของโมเลกุล'
        ],
        text: () => `เมื่อนำกล่อง 2 ใบ ที่มีปริมาตร (V) และความดันภายใน (P) เท่ากัน กล่องใบที่ 1 บรรจุแก๊สไนโตรเจน (\\(\\text{N}_2\\)) จำนวน 1.0 โมล กล่องใบที่ 2 บรรจุแก๊สออกซิเจน (\\(\\text{O}_2\\)) จำนวน 1.0 โมล เท่ากัน อุณหภูมิของแก๊สในกล่องแต่ละใบมีค่าเท่ากันหรือไม่ (อ้างอิง ตรวจสอบความเข้าใจ 16.3 ข้อ 3 ก)`,
        generate: (r) => ({
            params: {},
            answers: ['เท่ากัน เนื่องจากแก๊สในกล่องแต่ละใบมีความดัน ปริมาตร และจำนวนโมลเท่ากัน ตามกฎของแก๊สอุดมคติ \\(PV = nRT\\)'],
            answersRaw: [0],
            explanation: () => `อุณหภูมิของแก๊สในกล่องแต่ละใบมีค่า **เท่ากัน** เนื่องจากแก๊สในกล่องแต่ละใบมีความดัน \\(P\\), ปริมาตร \\(V\\) และจำนวนโมล \\(n\\) เท่ากัน เมื่อพิจารณาตามกฎของแก๊สอุดมคติ \\(PV = nRT\\) หรือ \\(T = \\frac{PV}{nR}\\) จะได้ว่าแก๊สทั้งสองกล่องมีค่าอุณหภูมิ \\(T\\) เท่ากันโดยไม่ต้องคำนึงถึงชนิดของแก๊ส`
        })
    },
    {
        id: '16_3_1_calc_p', topic: '16.3.1', type: 'numeric_single',
        title: 'คำนวณความดันจากความหนาแน่นและอัตราเร็ว RMS',
        inputs: [{ label: 'ความดันแก๊ส (kPa):' }],
        text: (p) => `แก๊สไนโตรเจนมีความหนาแน่น \\(${p.rho.toFixed(2)}\\text{ kg/m}^3\\) และมีอัตราเร็วอาร์เอ็มเอส (\\(v_{rms}\\)) เท่ากับ \\(${p.vrms}\\text{ m/s}\\) ความดันของแก๊สนี้มีค่ากี่กิโลพาสคัล (kPa)`,
        generate: (r) => {
            const rho = r ? 0.8 + (r % 10) * 0.1 : 1.2;
            const vrms = r ? 400 + r * 5 : 500;
            const P = (1 / 3) * rho * vrms * vrms;
            const P_kPa = P / 1000;
            return { params: { rho, vrms }, answers: [P_kPa.toFixed(1), P_kPa.toFixed(2), Math.round(P_kPa).toString()], answersRaw: [P_kPa], explanation: () => `จากสมการความดันของแก๊ส: \\( P = \\frac{1}{3}\\rho v_{rms}^2 \\) <br>แทนค่า: \\( P = \\frac{1}{3}(${rho.toFixed(2)})(${vrms})^2 \\) <br> \\( P = \\frac{1}{3}(${rho.toFixed(2)})(${vrms * vrms}) = ${P.toFixed(1)}\\text{ Pa} \\) <br> แปลงเป็นหน่วยกิโลพาสคัล (kPa) โดยหารด้วย 1000: <br> \\( P = \\frac{${P.toFixed(1)}}{1000} \\approx ${P_kPa.toFixed(2)}\\text{ kPa} \\)` };
        }
    },

    // 16.3.2 พลังงานจลน์เฉลี่ยและอุณหภูมิ
    {
        id: '16_3_2_ek1', topic: '16.3.2', type: 'numeric_single',
        title: 'คำนวณพลังงานจลน์เฉลี่ย',
        inputs: [{ label: 'พลังงานจลน์เฉลี่ย $E_{k}$ :' }],
        text: (p) => `แก๊สฮีเลียม (He) อุณหภูมิ \\(${p.T}\\text{ K}\\) จะมีพลังงานจลน์เฉลี่ยต่อโมเลกุลเท่าใด ในหน่วย \\(\\times 10^{-21} \\text{ J}\\) (กำหนด \\(k_B = 1.38 \\times 10^{-23}\\text{ J/K}\\))`,
        generate: (r) => {
            const T = r ? 300 + r * 15 : 300;
            const Ek = 1.5 * 1.38e-23 * T;
            const Ek_coeff = Ek / 1e-21;
            return { params: { T }, answers: [Ek_coeff.toFixed(2), (Ek_coeff.toFixed(2) + " × 10^-21")], answersRaw: [[Ek_coeff, Ek]], explanation: () => `จากสมการ \\( \\bar{E}_k = \\frac{3}{2}k_BT \\) <br>แทนค่า: \\( \\bar{E}_k = \\frac{3}{2}(1.38 \\times 10^{-23})(${T}) \\) <br> \\( \\bar{E}_k = ${Ek_coeff.toFixed(2)} \\times 10^{-21}\\text{ J} \\) <br> *(หมายเหตุ: พลังงานจลน์เฉลี่ยไม่ได้ขึ้นกับชนิดของแก๊ส ขึ้นกับ T เท่านั้น)*` };
        }
    },
    {
        id: '16_3_2_ratio', topic: '16.3.2', type: 'choice',
        title: 'เปรียบเทียบพลังงานจลน์แก๊สต่างชนิด',
        choices: [
            'เท่ากัน เพราะอุณหภูมิเท่ากัน',
            'ออกซิเจนมีมากกว่า เพราะมีมวลโมเลกุลมากกว่า',
            'ไฮโดรเจนมีมากกว่า เพราะเป็นแก๊สที่เบากว่า',
            'ไม่สามารถเปรียบเทียบได้หากไม่ทราบปริมาตร'
        ],
        text: () => `ที่อุณหภูมิ 27 องศาเซลเซียสเท่ากัน พลังงานจลน์เฉลี่ยของโมเลกุลแก๊สไฮโดรเจน (H₂) และแก๊สออกซิเจน (O₂) เป็นอย่างไร`,
        generate: (r) => ({ params: {}, answers: ['เท่ากัน เพราะอุณหภูมิเท่ากัน'], answersRaw: [0], explanation: () => `จากสมการ \\( \\bar{E}_k = \\frac{3}{2}k_BT \\) แสดงให้เห็นว่า พลังงานจลน์เฉลี่ยแปรผันตรงกับอุณหภูมิสัมบูรณ์ (T) เท่านั้น ไม่ได้ขึ้นอยู่กับชนิดหรือมวลของแก๊สเลย ดังนั้นเมื่อ T เท่ากัน \\( \\bar{E}_k \\) จึงเท่ากัน` })
    },
    {
        id: '16_3_2_internalE_pv', topic: '16.3.2', type: 'numeric_single',
        title: 'พลังงานภายในระบบจากความดันและปริมาตร',
        inputs: [{ label: 'พลังงานภายใน (Joule):' }],
        text: (p) => `แก๊สอุดมคติบรรจุอยู่ในภาชนะปิดขนาด \\(${p.V.toFixed(1)}\\text{ m}^3\\) มีความดัน \\(${p.P_kPa.toFixed(1)}\\text{ kPa}\\) พลังงานภายในระบบ (U) ของแก๊สนี้มีค่ากี่จูล`,
        generate: (r) => {
            const V = r ? (2 + (r % 5) * 0.5) : 3.0;
            const P_kPa = r ? 100 + r * 3 : 150.0;
            const P = P_kPa * 1000;
            const U = 1.5 * P * V;
            return { params: { V, P_kPa }, answers: [Math.round(U).toString(), U.toFixed(1)], answersRaw: [U], explanation: () => `พลังงานภายในระบบ (U) สำหรับแก๊สอุดมคติ หาได้จากสมการ: <br> \\( U = \\frac{3}{2}PV \\) <br> **สิ่งสำคัญ:** ต้องแปลงความดันให้เป็นหน่วยพาสคัล (Pa) ก่อน: \\( P = ${P_kPa.toFixed(1)}\\text{ kPa} = ${P}\\text{ Pa} \\) <br> แทนค่า: \\( U = \\frac{3}{2}(${P})(${V.toFixed(1)}) = ${U.toFixed(1)}\\text{ J} \\)` };
        }
    },
    {
        id: '16_3_2_ek_stp_distractor', topic: '16.3.2', type: 'numeric_single',
        title: 'คำนวณพลังงานจลน์เฉลี่ย (มีตัวลวง)',
        inputs: [{ label: 'พลังงานจลน์เฉลี่ย \\( \\bar{E}_k \\) (พิมพ์เฉพาะตัวเลขข้างหน้า \\( \\times 10^{-21} \\text{ J} \\)):' }],
        text: (p) => `จงหาพลังงานจลน์เฉลี่ยของโมเลกุล${p.gas}ที่อุณหภูมิ \\(${p.t}\\) องศาเซลเซียส และความดัน \\(${p.p}\\) บรรยากาศ (ตอบเฉพาะตัวเลขสัมประสิทธิ์ข้างหน้า \\(\\times 10^{-21}\\text{ J}\\))`,
        generate: (r) => {
            const gases = ['ออกซิเจน', 'ไนโตรเจน', 'ไฮโดรเจน', 'คาร์บอนไดออกไซด์'];
            const gas = r ? gases[r % 4] : 'ออกซิเจน';
            const t = r ? (r % 3) * 27 : 0;
            const p_atm = r ? 1 + (r % 3) : 1;
            const T = t + 273;
            const Ek = 1.5 * 1.38e-23 * T;
            const Ek_coeff = Ek / 1e-21;

            return {
                params: { gas, t, p: p_atm },
                answers: [Ek_coeff.toFixed(2), Ek_coeff.toFixed(3)],
                answersRaw: [Ek_coeff],
                explanation: () => `จากสมการพลังงานจลน์เฉลี่ย \\( \\bar{E}_k = \\frac{3}{2}k_BT \\) <br><br> **💡 ข้อสังเกต:** พลังงานจลน์เฉลี่ยขึ้นอยู่กับ <strong>อุณหภูมิสัมบูรณ์ (T) เพียงอย่างเดียว</strong> ไม่ขึ้นกับชนิดของแก๊ส หรือ ความดัน (ความดัน ${p.p} บรรยากาศ เป็นเพียงตัวลวง) <br><br> แปลงอุณหภูมิ: \\( T = ${t} + 273 = ${T} \\text{ K} \\) <br> แทนค่า: \\( \\bar{E}_k = \\frac{3}{2}(1.38 \\times 10^{-23})(${T}) \\) <br> \\( \\bar{E}_k = ${Ek_coeff.toFixed(2)} \\times 10^{-21}\\text{ J} \\)`
            };
        }
    },
    {
        id: '16_3_2_ek_double_temp', topic: '16.3.2', type: 'numeric_single',
        title: 'การเปลี่ยนแปลงพลังงานจลน์เฉลี่ยกับอุณหภูมิ',
        inputs: [{ label: 'อุณหภูมิใหม่ (K หรือ °C):' }],
        text: (p) => `แก๊สชนิดหนึ่งบรรจุในภาชนะปิดที่อุณหภูมิ \\(${p.t1}^\\circ\\text{C}\\) จะต้องทำให้แก๊สนี้มีอุณหภูมิเป็นเท่าใด (ตอบหน่วยเคลวิน) จึงจะมีพลังงานจลน์เฉลี่ยต่อโมเลกุลเป็น ${p.n} เท่าของค่าเดิม`,
        generate: (r) => {
            const t1 = r ? (r % 3) * 27 : 0;
            const n = r ? 2 + (r % 3) : 2;
            const T1 = t1 + 273;
            const T2 = n * T1;
            const t2_celsius = T2 - 273;

            return {
                params: { t1, n },
                answers: [T2.toString()],
                answersRaw: [T2],
                explanation: () => `พลังงานจลน์เฉลี่ยแปรผันตรงกับอุณหภูมิสัมบูรณ์ (เคลวิน) ตามสมการ \\( \\bar{E}_k = \\frac{3}{2}k_BT \\) นั่นคือ \\( \\bar{E}_k \\propto T \\)<br>
            ดังนั้น \\( \\frac{(\\bar{E}_k)_2}{(\\bar{E}_k)_1} = \\frac{T_2}{T_1} \\)<br>
            โจทย์ต้องการให้ \\( (\\bar{E}_k)_2 = ${n}(\\bar{E}_k)_1 \\) จะได้ \\( \\frac{T_2}{T_1} = ${n} \\)<br>
            แปลงอุณหภูมิเริ่มต้น: \\( T_1 = ${t1} + 273 = ${T1} \\text{ K} \\)<br>
            แทนค่าหา T ใหม่: \\( T_2 = ${n} \\times ${T1} = ${T2} \\text{ K} \\) <br>
            (หรือเท่ากับ \\( ${T2} - 273 = ${t2_celsius}^\\circ\\text{C} \\))`
            };
        }
    },
    {
        id: '16_3_2_internalE_argon', topic: '16.3.2', type: 'numeric_single',
        title: 'พลังงานภายในของแก๊สอาร์กอน',
        inputs: [{ label: 'พลังงานภายใน (Joule):' }],
        text: (p) => `พลังงานภายในของแก๊สอาร์กอนจำนวน \\(${p.n.toFixed(2)}\\text{ โมล}\\) ที่ \\(${p.t}\\) องศาเซลเซียส มีค่าเท่าใด (กำหนดให้ \\( R = 8.31 \\text{ J/(mol K)} \\))`,
        generate: (r) => {
            const n = r ? (1 + (r % 4) * 0.5) : 1.00;
            const t = r ? (27 + (r % 3) * 10) : 27;
            const T = t + 273;
            const U = 1.5 * n * 8.31 * T;
            return {
                params: { n, t },
                answers: [Math.round(U).toString(), U.toFixed(1), U.toFixed(2)],
                answersRaw: [U],
                explanation: () => `
              พลังงานภายในระบบ (U) ของแก๊สอะตอมเดี่ยว (เช่น อาร์กอน) หาได้จากสมการ: <br>
              \\( U = \\frac{3}{2}nRT \\) <br>
              แปลงอุณหภูมิเป็นหน่วยเคลวิน: \\( T = ${t} + 273 = ${T}\\text{ K} \\) <br>
              แทนค่า: \\( U = \\frac{3}{2}(${n.toFixed(2)})(8.31)(${T}) \\)<br>
              \\( U = ${U.toFixed(1)}\\text{ J} \\)
            `
            };
        }
    },

    // 16.3.3 อัตราเร็ว RMS
    {
        id: '16_3_3_vrms_calc', topic: '16.3.3', type: 'numeric_single',
        title: 'คำนวณอัตราเร็ว RMS (แก๊สออกซิเจน)',
        inputs: [{ label: 'อัตราเร็ว \\( v_{rms} \\) (m/s):' }],
        text: (p) => `จงหาอัตราเร็วอาร์เอ็มเอส (\\( v_{rms} \\)) ของโมเลกุลแก๊สออกซิเจน (O₂) ที่อุณหภูมิ \\(${p.T}\\text{ K}\\) กำหนดให้มวลโมลาร์ของ O₂ = \\(32 \\text{ g/mol}\\) และ \\(R = 8.31 \\text{ J/(mol K)}\\)`,
        generate: (r) => {
            const T = r ? 250 + r * 8 : 300;
            const M_kg = 32 * 1e-3;
            const v = Math.sqrt((3 * 8.31 * T) / M_kg);
            return { params: { T }, answers: [Math.round(v).toString(), v.toFixed(1), v.toFixed(2)], answersRaw: [v], explanation: () => `จากสมการ \\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\) <br> **สิ่งสำคัญ:** ต้องแปลง M เป็น kg/mol คือ \\(32 \\times 10^{-3}\\text{ kg/mol}\\) <br>แทนค่า: \\( v_{rms} = \\sqrt{\\frac{3(8.31)(${T})}{32 \\times 10^{-3}}} \\) <br> \\( v_{rms} = \\sqrt{\\frac{${(3 * 8.31 * T).toFixed(2)}}{0.032}} \\approx ${v.toFixed(2)}\\text{ m/s} \\)` };
        }
    },
    {
        id: '16_3_3_vrms_ratio', topic: '16.3.3', type: 'choice',
        title: 'การแปรผันของอัตราเร็ว RMS',
        choices: [
            'เพิ่มขึ้นเป็น 2 เท่า',
            'เพิ่มขึ้นเป็น √2 เท่า (ประมาณ 1.414 เท่า)',
            'ลดลงครึ่งหนึ่ง',
            'เท่าเดิม'
        ],
        text: () => `ถ้าเพิ่มอุณหภูมิสัมบูรณ์ของแก๊สในภาชนะปิดให้เป็น 2 เท่าของอุณหภูมิเดิม อัตราเร็ว RMS ของโมเลกุลแก๊สจะเปลี่ยนแปลงอย่างไร`,
        generate: (r) => ({ params: {}, answers: ['เพิ่มขึ้นเป็น √2 เท่า (ประมาณ 1.414 เท่า)'], answersRaw: [0], explanation: () => `จากสมการ \\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\) จะเห็นว่า \\( v_{rms} \\propto \\sqrt{T} \\) <br> ดังนั้น ถ้า T กลายเป็น 2 เท่า \\( v_{rms} \\) ใหม่จะกลายเป็น \\( \\sqrt{2} \\) เท่าของค่าเดิม (ไม่ถึง 2 เท่าเพราะติดรากที่สอง)` })
    },
    {
        id: '16_3_3_vrms_compare', topic: '16.3.3', type: 'numeric_single',
        title: 'เปรียบเทียบอัตราเร็ว RMS ของแก๊สสองชนิด',
        inputs: [{ label: 'อัตราเร็ว RMS ของแก๊สฮีเลียม (m/s):' }],
        text: (p) => `ที่อุณหภูมิห้องเดียวกัน อัตราเร็ว RMS ของโมเลกุลแก๊สนีออน (Ne) เท่ากับ \\(${p.v_Ne}\\text{ m/s}\\) อัตราเร็ว RMS ของแก๊สฮีเลียม (He) จะมีค่ากี่เมตรต่อวินาที (กำหนดมวลโมเลกุล Ne = 20 g/mol, He = 4 g/mol)`,
        generate: (r) => {
            const v_Ne = r ? 300 + r * 5 : 400;
            const v_He = v_Ne * Math.sqrt(5);
            return { params: { v_Ne }, answers: [Math.round(v_He).toString(), v_He.toFixed(1), v_He.toFixed(2)], answersRaw: [v_He], explanation: () => `จากสมการอัตราเร็ว RMS: \\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\) <br> ที่อุณหภูมิ \\(T\\) เท่ากัน จะได้ว่า \\( v_{rms} \\propto \\frac{1}{\\sqrt{M}} \\) <br> เปรียบเทียบระหว่างแก๊สฮีเลียม (He) และนีออน (Ne): <br> \\( \\frac{v_{He}}{v_{Ne}} = \\sqrt{\\frac{M_{Ne}}{M_{He}}} = \\sqrt{\\frac{20}{4}} = \\sqrt{5} \\approx 2.236 \\) <br>  ดังนั้น: \\( v_{He} = v_{Ne} \\times \\sqrt{5} = ${v_Ne} \\times 2.236 = ${v_He.toFixed(2)}\\text{ m/s} \\)` };
        }
    },

    // ข้อผสมแบบฝึกหัด สสวท
    {
        id: '16_3_mix_internalE', topic: '16.3.2', type: 'numeric_single',
        title: 'พลังงานภายในระบบ (Internal Energy)',
        inputs: [{ label: 'พลังงานรวม (Joule):' }],
        text: (p) => `แก๊สฮีเลียม (He) จำนวน \\(${p.n.toFixed(1)}\\text{ mol}\\) บรรจุในภาชนะปิดที่อุณหภูมิ \\(${p.t}^\\circ\\text{C}\\) พลังงานจลน์รวมทั้งหมดของแก๊สนี้ (พลังงานภายในระบบ, U) มีค่ากี่จูล $\\left(กำหนด R = 8.31 J/mol K\\right)$`,
        generate: (r) => {
            const n = r ? (1 + r * 0.1) : 2;
            const t = r ? (10 + r) : 27;
            const T = t + 273;
            const U = 1.5 * n * 8.31 * T;
            return { params: { n, t }, answers: [Math.round(U).toString(), U.toFixed(1)], answersRaw: [U], explanation: () => `พลังงานจลน์รวมของแก๊สทั้งหมด (U) หาได้จาก: <br> \\( U = \\frac{3}{2}nRT \\) <br> แปลง T = ${t} + 273 = ${T} K <br> แทนค่า: \\( U = \\frac{3}{2}(${n.toFixed(1)})(8.31)(${T}) = ${U.toFixed(1)}\\text{ J} \\)` };
        }
    },
    {
        id: '16_3_mix_vrms_ek', topic: '16.3.3', type: 'numeric_double',
        title: 'หาอัตราเร็ว RMS และพลังงานจลน์เฉลี่ย',
        inputs: [
            { label: '1) อัตราเร็ว \\( v_{rms} \\) (m/s):' },
            { label: '2) พลังงานจลน์เฉลี่ย \\( \\bar{E}_k \\) (พิมพ์เลขหน้า \\( \\times 10^{-21} \\text{ J} \\)):' }
        ],
        text: (p) => `จงหาอัตราเร็วอาร์เอ็มเอส (\\( v_{rms} \\)) และพลังงานจลน์เฉลี่ย (\\( \\bar{E}_k \\)) ของโมเลกุลแก๊สไนโตรเจน (N₂) ที่อุณหภูมิ \\(${p.T}\\text{ K}\\) <br><br> <span class="text-sm text-slate-500">(กำหนดมวลโมลาร์ N₂ = 28 g/mol, \\(R = 8.31 \\text{ J/(mol K)}\\), \\(k_B = 1.38 \\times 10^{-23} \\text{ J/K}\\))</span>`,
        generate: (r) => {
            const T = r ? 280 + (r % 5) * 10 : 280;
            const M_kg = 28 * 1e-3;
            const v = Math.sqrt((3 * 8.31 * T) / M_kg);
            const Ek = 1.5 * 1.38e-23 * T;
            const Ek_coeff = Ek / 1e-21;

            return {
                params: { T },
                answers: [Math.round(v).toString(), Ek_coeff.toFixed(2)],
                answersRaw: [v, Ek_coeff],
                explanation: () => `
              <strong>ส่วนที่ 1: หาอัตราเร็วอาร์เอ็มเอส (\\( v_{rms} \\))</strong><br>
              จากสูตร \\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\)<br>
              แปลงมวลโมลาร์ N₂ เป็นกิโลกรัม/โมล: \\( M = 28 \\times 10^{-3} \\text{ kg/mol} \\)<br>
              แทนค่า: \\( v_{rms} = \\sqrt{\\frac{3(8.31)(${T})}{28 \\times 10^{-3}}} \\approx ${v.toFixed(2)} \\text{ m/s} \\)<br><br>
              <strong>ส่วนที่ 2: หาพลังงานจลน์เฉลี่ย (\\( \\bar{E}_k \\))</strong><br>
              จากสูตร \\( \\bar{E}_k = \\frac{3}{2}k_BT \\)<br>
              แทนค่า: \\( \\bar{E}_k = \\frac{3}{2}(1.38 \\times 10^{-23})(${T}) \\)<br>
              \\( \\bar{E}_k = ${Ek_coeff.toFixed(2)} \\times 10^{-21} \\text{ J} \\)
            `
            };
        }
    },
    {
        id: '16_3_mix_vrms_ek_neon', topic: '16.3.3', type: 'numeric_double',
        title: 'หาอัตราเร็ว RMS และพลังงานจลน์ (อะตอมนีออน)',
        inputs: [
            { label: '1) อัตราเร็ว \\( v_{rms} \\) (m/s):' },
            { label: '2) พลังงานจลน์เฉลี่ย \\( \\bar{E}_k \\) (พิมพ์เลขหน้า \\( \\times 10^{-21} \\text{ J} \\)):' }
        ],
        text: (p) => `จงหาอัตราเร็วอาร์เอ็มเอส (\\( v_{rms} \\)) และพลังงานจลน์เฉลี่ย (\\( \\bar{E}_k \\)) ของอะตอมนีออน (Ne) ที่อุณหภูมิ \\(${p.T}\\text{ เคลวิน}\\) <br><br> <span class="text-sm text-slate-500">(กำหนดมวลโมลาร์ของนีออน = \\(20 \\times 10^{-3} \\text{ kg/mol}\\), \\(R = 8.31 \\text{ J/(mol K)}\\), \\(k_B = 1.38 \\times 10^{-23} \\text{ J/K}\\))</span>`,
        generate: (r) => {
            const T = r ? 400 + (r % 6) * 10 : 450;
            const M_kg = 20 * 1e-3;
            const v = Math.sqrt((3 * 8.31 * T) / M_kg);
            const Ek = 1.5 * 1.38e-23 * T;
            const Ek_coeff = Ek / 1e-21;

            return {
                params: { T },
                answers: [Math.round(v).toString(), Ek_coeff.toFixed(2), Ek_coeff.toFixed(3)],
                answersRaw: [v, Ek_coeff],
                explanation: () => `
              <strong>ส่วนที่ 1: หาอัตราเร็วอาร์เอ็มเอส (\\( v_{rms} \\))</strong><br>
              จากสูตร \\( v_{rms} = \\sqrt{\\frac{3RT}{M}} \\)<br>
              โจทย์กำหนดมวลโมลาร์ Ne: \\( M = 20 \\times 10^{-3} \\text{ kg/mol} \\)<br>
              แทนค่า: \\( v_{rms} = \\sqrt{\\frac{3(8.31)(${T})}{20 \\times 10^{-3}}} \\approx ${v.toFixed(2)} \\text{ m/s} \\)<br><br>
              <strong>ส่วนที่ 2: หาพลังงานจลน์เฉลี่ย (\\( \\bar{E}_k \\))</strong><br>
              จากสูตร \\( \\bar{E}_k = \\frac{3}{2}k_BT \\)<br>
              แทนค่า: \\( \\bar{E}_k = \\frac{3}{2}(1.38 \\times 10^{-23})(${T}) \\)<br>
              \\( \\bar{E}_k = ${Ek_coeff.toFixed(2)} \\times 10^{-21} \\text{ J} \\)
            `
            };
        }
    }
];

// --- Practice Engine ---
function startPracticeMode(topic) {
    AppState.currentPracticeTopic = topic;
    const practiceArena = document.getElementById('practice-arena');
    if (practiceArena) practiceArena.classList.remove('hidden');

    ['16-3-1', '16-3-2', '16-3-3'].forEach(t => {
        const btn = document.getElementById(`btn-prac-${t}`);
        if (btn) {
            btn.className = t === topic
                ? "p-4 bg-indigo-50 border-2 border-indigo-500 text-indigo-900 rounded-xl flex items-center gap-4 transition text-left shadow-sm"
                : "p-4 bg-white hover:bg-slate-50 text-slate-800 rounded-xl border border-slate-200 flex items-center gap-4 transition text-left shadow-sm";
        }
    });

    const fb = document.getElementById('prac-feedback');
    const expBox = document.getElementById('prac-explanation-box');
    if (fb) fb.classList.add('hidden');
    if (expBox) expBox.classList.add('hidden');

    regeneratePractice();
}

function regeneratePractice() {
    const typeSelect = document.getElementById('prac-type-select');
    if (!typeSelect) return;

    const mode = typeSelect.value;
    const isRandom = mode === 'random';
    const formattedTopic = AppState.currentPracticeTopic.replace(/-/g, '.');
    const filtered = QUESTION_TEMPLATES.filter(q => q.topic.startsWith(formattedTopic));

    if (!filtered.length) return;
    const template = filtered[Math.floor(Math.random() * filtered.length)];
    const R = isRandom ? Math.floor(Math.random() * 50) + 1 : null;
    const instance = template.generate(R);

    AppState.currentPracticeQuestion = { template, instance };

    const badge = document.getElementById('prac-badge-mode');
    const qTitle = document.getElementById('prac-question-title');
    const qText = document.getElementById('prac-question-text');
    const cz = document.getElementById('prac-choice-zone');
    const nz = document.getElementById('prac-numeric-zone');

    if (badge) badge.innerText = `หัวข้อ ${template.topic} • ${isRandom ? 'โหมดสุ่มตัวเลข' : 'โจทย์อ้างอิงมาตรฐาน'}`;
    if (qTitle) qTitle.innerText = `📋 โจทย์: ${template.title}`;
    if (qText) qText.innerHTML = template.text(instance.params);

    const input1 = document.getElementById('prac-input-val1');
    const input2 = document.getElementById('prac-input-val2');
    const input3 = document.getElementById('prac-input-val3');
    if (input1) input1.value = '';
    if (input2) input2.value = '';
    if (input3) input3.value = '';

    const zone2 = document.getElementById('prac-input-zone-2');
    const zone3 = document.getElementById('prac-input-zone-3');
    if (zone2) zone2.classList.add('hidden');
    if (zone3) zone3.classList.add('hidden');

    const fb = document.getElementById('prac-feedback');
    const expBox = document.getElementById('prac-explanation-box');
    if (fb) fb.classList.add('hidden');
    if (expBox) expBox.classList.add('hidden');

    if (template.type === 'choice') {
        if (cz) cz.classList.remove('hidden');
        if (nz) nz.classList.add('hidden');
        if (cz) {
            cz.innerHTML = template.choices.map(c => `
              <button onclick="checkPracticeChoice('${c}')" class="w-full text-left px-5 py-3 bg-white hover:bg-indigo-50 text-slate-800 font-medium rounded-xl border border-slate-200 hover:border-indigo-300 transition">${c}</button>
            `).join('');
        }
    } else {
        if (cz) cz.classList.add('hidden');
        if (nz) nz.classList.remove('hidden');

        const lbl1 = document.getElementById('lbl-prac-input-1');
        if (lbl1) lbl1.innerHTML = template.inputs[0].label;

        if (template.type === 'numeric_double') {
            if (zone2) zone2.classList.remove('hidden');
            const lbl2 = document.getElementById('lbl-prac-input-2');
            if (lbl2) lbl2.innerHTML = template.inputs[1].label;
        } else if (template.type === 'numeric_triple') {
            if (zone2) zone2.classList.remove('hidden');
            if (zone3) zone3.classList.remove('hidden');
            const lbl2 = document.getElementById('lbl-prac-input-2');
            const lbl3 = document.getElementById('lbl-prac-input-3');
            if (lbl2) lbl2.innerHTML = template.inputs[1].label;
            if (lbl3) lbl3.innerHTML = template.inputs[2].label;
        }
    }
    renderMath();
}

function checkPracticeAnswer() {
    if (!AppState.currentPracticeQuestion) return;
    const { template, instance } = AppState.currentPracticeQuestion;
    if (template.type === 'choice') return;

    const v1El = document.getElementById('prac-input-val1');
    const v2El = document.getElementById('prac-input-val2');
    const v3El = document.getElementById('prac-input-val3');
    
    const v1 = v1El ? v1El.value.trim() : '';
    const v2 = v2El ? v2El.value.trim() : '';
    const v3 = v3El ? v3El.value.trim() : '';

    if (!v1 ||
        (template.type === 'numeric_double' && !v2) ||
        (template.type === 'numeric_triple' && (!v2 || !v3))) {
        triggerAlert("กรอกไม่ครบ", "ระบุคำตอบให้ครบก่อนตรวจครับ", "fa-circle-question", "bg-amber-100 text-amber-600");
        return;
    }

    const c1 = isNumericAnswerCorrect(v1, instance.answersRaw[0]);
    const c2 = (template.type === 'numeric_double' || template.type === 'numeric_triple')
        ? isNumericAnswerCorrect(v2, instance.answersRaw[1])
        : true;
    const c3 = (template.type === 'numeric_triple')
        ? isNumericAnswerCorrect(v3, instance.answersRaw[2])
        : true;
    showPracticeFeedback(c1 && c2 && c3, instance.explanation());
}

function checkPracticeChoice(choice) {
    if (!AppState.currentPracticeQuestion) return;
    const { instance } = AppState.currentPracticeQuestion;
    showPracticeFeedback(choice === instance.answers[0], instance.explanation());
}

function showPracticeFeedback(isCorrect, explainText) {
    const fb = document.getElementById('prac-feedback');
    const expText = document.getElementById('prac-explanation-text');
    const expBox = document.getElementById('prac-explanation-box');

    if (fb) {
        fb.className = `p-5 rounded-2xl border block ${isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`;
        fb.innerHTML = isCorrect
            ? `<div class="font-bold flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i> ยอดเยี่ยม! ตอบถูกต้องตามหลักฟิสิกส์</div>`
            : `<div class="font-bold flex items-center gap-2"><i class="fa-solid fa-circle-xmark text-rose-500 text-lg"></i> คำตอบยังไม่ถูก ลองศึกษาเฉลยด้านล่างดูนะครับ</div>`;
    }
    if (expText) expText.innerHTML = explainText;
    if (expBox) expBox.classList.remove('hidden');
    renderMath();
}

// --- Exam Engine ---
function startExamProcess() {
    const nameInput = document.getElementById('exam-student-name');
    const classSelect = document.getElementById('exam-student-class');
    const noInput = document.getElementById('exam-student-no');
    const durationInput = document.getElementById('exam-duration-minutes');

    if (!nameInput || !classSelect || !noInput) return;

    const name = nameInput.value.trim();
    const cls = classSelect.value;
    const num = noInput.value.trim();
    const R = parseInt(num);

    if (!name || !cls || isNaN(R) || R < 1 || R > 40) {
        triggerAlert("ข้อมูลไม่ครบถ้วน", "กรุณาระบุ ชื่อ ชั้นเรียน และเลขที่ (1-40) ให้ถูกต้องก่อนเริ่มสอบครับ", "fa-user", "bg-indigo-100 text-indigo-600");
        return;
    }

    AppState.examDurationSeconds = (parseInt(durationInput.value) || 10) * 60;
    AppState.examStudentInfo = { name, class: cls, number: num };

    const examRNG = new SeededRNG(num);

    const q16_3_1 = QUESTION_TEMPLATES.filter(q => q.topic === '16.3.1');
    const q16_3_2 = QUESTION_TEMPLATES.filter(q => q.topic === '16.3.2');
    const q16_3_3 = QUESTION_TEMPLATES.filter(q => q.topic === '16.3.3' && q.id !== '16_3_mix_vrms_ek');

    const shuffled_1 = examRNG.shuffle(q16_3_1);
    const shuffled_2 = examRNG.shuffle(q16_3_2);
    const shuffled_3 = examRNG.shuffle(q16_3_3);

    const selectedTemplates = [
        shuffled_1[0],
        shuffled_2[0],
        shuffled_2[1],
        shuffled_3[0],
        shuffled_3[1]
    ];

    AppState.currentExamQuestions = selectedTemplates.map(template => {
        const instance = template.generate(R);
        const choices = template.type === 'choice' ? examRNG.shuffle(template.choices) : [];
        return {
            id: template.id, topic: template.topic, type: template.type, title: template.title,
            text: template.text(instance.params), inputs: template.inputs || [], choices: choices
        };
    });

    const lblUserInfo = document.getElementById('lbl-exam-user-info');
    if (lblUserInfo) lblUserInfo.innerText = `${name} (ม.6/${cls} เลขที่ ${num})`;
    
    renderExamLiveDOM();

    AppState.examStartTimestamp = Date.now();
    AppState.examDeadlineTimestamp = AppState.examStartTimestamp + (AppState.examDurationSeconds * 1000);
    AppState.examTimeRemaining = AppState.examDurationSeconds;
    AppState.examIsActive = true;
    AppState.examSubmissionInProgress = false;

    sessionStorage.setItem(EXAM_STATE_KEY, JSON.stringify({
        examQuestions: AppState.currentExamQuestions, 
        studentInfo: AppState.examStudentInfo, 
        examStartTimestamp: AppState.examStartTimestamp, 
        examDeadlineTimestamp: AppState.examDeadlineTimestamp, 
        examDurationSeconds: AppState.examDurationSeconds
    }));

    setupExamLocks();
    showSection('exam-live');
    startExamTimer();
}

function setupExamLocks() {
    AppState.examExitGuardEnabled = true;
    document.body.classList.add('exam-locked');
    window.addEventListener('beforeunload', handleExamBeforeUnload);
}

function releaseExamLocks() {
    AppState.examExitGuardEnabled = false;
    document.body.classList.remove('exam-locked');
    window.removeEventListener('beforeunload', handleExamBeforeUnload);
}

function handleExamBeforeUnload(e) { 
    if (AppState.examIsActive) { 
        e.preventDefault(); 
        e.returnValue = ''; 
    } 
}

function renderExamLiveDOM() {
    const container = document.getElementById('exam-questions-container');
    if (!container) return;

    container.innerHTML = '';
    AppState.currentExamQuestions.forEach((q, idx) => {
        let inputHTML = '';
        if (q.type === 'choice') {
            inputHTML += `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">`;
            q.choices.forEach((c, cIdx) => {
                inputHTML += `
                  <label class="flex items-center gap-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl cursor-pointer transition">
                    <input type="radio" name="exam-q${idx}" value="${c}" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                    <span class="text-sm text-slate-800">${c}</span>
                  </label>
                `;
            });
            inputHTML += `</div>`;
        } else if (q.type === 'numeric_single') {
            inputHTML += `
              <div class="mt-4">
                <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
                <input type="text" id="exam-q${idx}-val1" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm">
              </div>
            `;
        } else if (q.type === 'numeric_double') {
            inputHTML += `
              <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
                  <input type="text" id="exam-q${idx}-val1" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[1].label}</label>
                  <input type="text" id="exam-q${idx}-val2" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm">
                </div>
              </div>
            `;
        }
        container.innerHTML += `
          <div class="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span class="font-bold text-slate-800">ข้อที่ ${idx + 1}: ${q.title}</span>
              <span class="bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-md text-xs font-bold">2 คะแนน</span>
            </div>
            <p class="text-sm md:text-base text-slate-700 leading-relaxed font-medium math-font">${q.text}</p>
            ${inputHTML}
          </div>
        `;
    });
    renderMath();
}

function startExamTimer() {
    clearInterval(AppState.examTimerInterval);
    AppState.examTimerInterval = setInterval(() => {
        if (!AppState.examIsActive) return;
        AppState.examTimeRemaining = Math.max(0, Math.ceil((AppState.examDeadlineTimestamp - Date.now()) / 1000));
        
        const timerDisplay = document.getElementById('exam-timer-display');
        if (timerDisplay) {
            timerDisplay.innerText = formatExamTime(AppState.examTimeRemaining);
            if (AppState.examTimeRemaining < 60) {
                timerDisplay.classList.add('text-rose-400');
            } else {
                timerDisplay.classList.remove('text-rose-400');
            }
        }

        if (AppState.examTimeRemaining <= 0) {
            clearInterval(AppState.examTimerInterval);
            triggerAlert("หมดเวลาสอบ", "ระบบกำลังส่งข้อสอบอัตโนมัติ", "fa-clock", "bg-rose-100 text-rose-600");
            submitExam(true);
        }
    }, 500);
}

function getExamAnswers() {
    return AppState.currentExamQuestions.map((q, idx) => {
        if (q.type === 'choice') {
            const chk = document.querySelector(`input[name="exam-q${idx}"]:checked`);
            return chk ? chk.value : null;
        } else if (q.type === 'numeric_single') {
            const el = document.getElementById(`exam-q${idx}-val1`);
            return el ? [el.value] : null;
        } else if (q.type === 'numeric_double') {
            const el1 = document.getElementById(`exam-q${idx}-val1`);
            const el2 = document.getElementById(`exam-q${idx}-val2`);
            return el1 && el2 ? [el1.value, el2.value] : null;
        }
        return null;
    });
}

function confirmSubmitExam() {
    const answers = getExamAnswers();
    const uncomplete = answers.some(a => !a || (Array.isArray(a) && (a.some(val => !val.trim()))));
    const msg = uncomplete ? "คุณยังทำข้อสอบไม่ครบทุกข้อ ยืนยันที่จะส่งข้อสอบเลยหรือไม่?" : "คุณทำข้อสอบครบแล้ว ยืนยันต้องการส่งข้อสอบหรือไม่?";

    const m = document.getElementById('modal-confirm');
    const c = document.getElementById('modal-confirm-card');
    const msgEl = document.getElementById('modal-confirm-msg');
    
    if (m && c && msgEl) {
        msgEl.innerText = msg;
        m.classList.remove('hidden');
        setTimeout(() => { c.classList.remove('scale-95', 'opacity-0'); }, 10);
    }
}

function closeConfirmModal() {
    const m = document.getElementById('modal-confirm');
    const c = document.getElementById('modal-confirm-card');
    if (m && c) {
        c.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { m.classList.add('hidden'); }, 200);
    }
}

function executeSubmitExam() {
    closeConfirmModal();
    setTimeout(() => submitExam(), 200);
}

function submitExam(timeExpired = false) {
    if (AppState.examSubmissionInProgress) return;
    AppState.examSubmissionInProgress = true;
    AppState.examIsActive = false;
    clearInterval(AppState.examTimerInterval);
    releaseExamLocks();

    const answers = getExamAnswers();
    let total_score = 0;
    const gradedResults = [];
    const R = parseInt(AppState.examStudentInfo.number) || 1;

    AppState.currentExamQuestions.forEach((q, idx) => {
        const userAns = answers[idx];
        const template = QUESTION_TEMPLATES.find(t => t.id === q.id);
        const dynamicCalc = template.generate(R);

        let isCorrect = false;
        if (q.type === 'choice') {
            isCorrect = userAns === dynamicCalc.answers[0];
        } else if (q.type === 'numeric_single') {
            isCorrect = userAns && isNumericAnswerCorrect(userAns[0], dynamicCalc.answersRaw[0]);
        } else if (q.type === 'numeric_double') {
            isCorrect = userAns &&
                isNumericAnswerCorrect(userAns[0], dynamicCalc.answersRaw[0]) &&
                isNumericAnswerCorrect(userAns[1], dynamicCalc.answersRaw[1]);
        }

        const score = isCorrect ? 2.0 : 0.0;
        total_score += score;
        gradedResults.push({
            idx, isCorrect, score, userAns,
            expectedAnswers: dynamicCalc.answers,
            explanationText: dynamicCalc.explanation()
        });
    });

    const elapsed = timeExpired ? AppState.examDurationSeconds : (AppState.examDurationSeconds - AppState.examTimeRemaining);
    const timeStr = `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วินาที`;

    const payload = {
        score: total_score, 
        timeTaken: timeStr, 
        studentInfo: AppState.examStudentInfo,
        gradedResults, 
        examQuestions: AppState.currentExamQuestions, 
        date: new Date().toLocaleDateString('th-TH')
    };
    localStorage.setItem('last_exam_results_16_3', JSON.stringify(payload));
    sessionStorage.removeItem(EXAM_STATE_KEY);

    updateLatestScore();
    showSection('exam-result');
    renderExamResults(payload);
}

function renderExamResults(data) {
    const nameEl = document.getElementById('lbl-res-student-name');
    const metaEl = document.getElementById('lbl-res-student-meta');
    const timeEl = document.getElementById('lbl-res-time-elapsed');
    const dateEl = document.getElementById('lbl-res-finished-at');
    const scoreEl = document.getElementById('lbl-res-total-score');
    
    if (nameEl) nameEl.innerText = data.studentInfo.name;
    if (metaEl) metaEl.innerText = `ม.6/${data.studentInfo.class} เลขที่ ${data.studentInfo.number}`;
    if (timeEl) timeEl.innerText = data.timeTaken;
    if (dateEl) dateEl.innerText = data.date;
    if (scoreEl) scoreEl.innerText = data.score;

    const circle = document.getElementById('res-circle-progress');
    if (circle) circle.style.strokeDashoffset = 439.8 - (data.score / 10) * 439.8;

    const fb = document.getElementById('lbl-res-badge-feedback');
    if (fb) {
        if (data.score >= 8) {
            fb.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-star"></i> ยอดเยี่ยม! เข้าใจทฤษฎีจลน์ของแก๊สได้ดีมาก</span>`;
        } else if (data.score >= 5) {
            fb.innerHTML = `<span class="text-indigo-600 font-bold"><i class="fa-solid fa-thumbs-up"></i> ดี! ผ่านเกณฑ์ ลองดูเฉลยเพื่อเก็บรายละเอียดเพิ่มนะ</span>`;
        } else {
            fb.innerHTML = `<span class="text-rose-600 font-bold"><i class="fa-solid fa-book"></i> พยายามอีกนิด กลับไปทบทวนสูตรความสัมพันธ์ \\( v_{rms} \\) และ \\( \\bar{E}_k \\) นะครับ</span>`;
        }
    }

    const tbody = document.getElementById('exam-result-tbody');
    const sols = document.getElementById('exam-solutions-container');
    if (tbody && sols) {
        tbody.innerHTML = ''; 
        sols.innerHTML = '';

        data.gradedResults.forEach((grad, i) => {
            const q = data.examQuestions[i];
            const status = grad.isCorrect
                ? `<span class="text-emerald-500 font-bold"><i class="fa-solid fa-check"></i> 2.0</span>`
                : `<span class="text-rose-500 font-bold"><i class="fa-solid fa-xmark"></i> 0.0</span>`;

            tbody.innerHTML += `
              <tr class="bg-white">
                <td class="px-5 py-3 font-medium text-center">${i + 1}</td>
                <td class="px-5 py-3 text-slate-700">${q.title}</td>
                <td class="px-5 py-3 text-center">2.0</td>
                <td class="px-5 py-3 text-center">${status}</td>
              </tr>
            `;

            let uAns = 'ไม่ได้ตอบ';
            if (q.type === 'choice') {
                uAns = grad.userAns || uAns;
            } else if (grad.userAns && grad.userAns[0]) {
                uAns = grad.userAns.filter(val => val !== undefined && val !== null).join(', ');
            }

            sols.innerHTML += `
              <div class="bg-white p-5 rounded-xl border border-slate-200">
                <h5 class="font-bold text-slate-800 mb-2">ข้อ ${i + 1}: ${q.title}</h5>
                <p class="text-sm text-slate-600 mb-3 math-font">${q.text}</p>
                <div class="text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                  <p>คำตอบของคุณ: <span class="font-bold ${grad.isCorrect ? 'text-emerald-600' : 'text-rose-600'}">${uAns}</span></p>
                  <p>เฉลยที่ถูกต้อง: <span class="font-bold text-slate-800">${grad.expectedAnswers.join(' หรือ ')}</span></p>
                </div>
                <div class="text-xs text-slate-700 bg-sky-50/50 p-3 rounded-lg math-font border border-sky-100">${grad.explanationText}</div>
              </div>
            `;
        });
    }
    renderMath();
}

function toggleExamSolutionBox() {
    const box = document.getElementById('exam-solution-box');
    const icon = document.getElementById('icon-toggle-sol');
    const lbl = document.getElementById('lbl-toggle-solution-text');
    if (box && icon) {
        box.classList.toggle('hidden');
        const isHidden = box.classList.contains('hidden');
        icon.className = isHidden ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up";
        if (lbl) lbl.innerText = isHidden ? "ดูเฉลยละเอียดและวิธีทำ" : "ซ่อนเฉลยละเอียดและวิธีทำ";
    }
}

function updateLatestScore() {
    const saved = localStorage.getItem('last_exam_results_16_3');
    const badge = document.getElementById('latest-score-badge');
    const lbl = document.getElementById('lbl-last-score');
    if (saved) {
        const data = JSON.parse(saved);
        if (lbl) lbl.innerText = `${data.score}/10 (${data.studentInfo.name})`;
        if (badge) badge.classList.remove('hidden');
    }
}

function showLatestResultModal() {
    const saved = localStorage.getItem('last_exam_results_16_3');
    if (saved) {
        showSection('exam-result');
        renderExamResults(JSON.parse(saved));
    }
}

// --- On Load Init ---
window.onload = () => {
    updateLatestScore();
    switchReviewTab('16-3-1');
    renderMath();

    // Bind Vrms Temp slider throttled handler
    const vrmsTempSlider = document.getElementById('calc-vrms-temp');
    const lblVrmsTemp = document.getElementById('lbl-calc-vrms-t');
    if (vrmsTempSlider) {
        vrmsTempSlider.oninput = throttle(() => {
            const val = vrmsTempSlider.value;
            if (lblVrmsTemp) lblVrmsTemp.innerText = val + ' K';
            calculateVrms();
        }, 30);
    }

    const activeSession = sessionStorage.getItem(EXAM_STATE_KEY);
    if (activeSession) {
        try {
            const s = JSON.parse(activeSession);
            if (s.examDeadlineTimestamp > Date.now()) {
                AppState.currentExamQuestions = s.examQuestions;
                AppState.examStudentInfo = s.studentInfo;
                AppState.examDeadlineTimestamp = s.examDeadlineTimestamp;
                AppState.examDurationSeconds = s.examDurationSeconds;
                AppState.examIsActive = true;
                
                const lblUserInfo = document.getElementById('lbl-exam-user-info');
                if (lblUserInfo) lblUserInfo.innerText = `${s.studentInfo.name} (ม.6/${s.studentInfo.class})`;
                
                renderExamLiveDOM();
                setupExamLocks();
                showSection('exam-live');
                startExamTimer();
            } else {
                sessionStorage.removeItem(EXAM_STATE_KEY);
            }
        } catch (e) { 
            sessionStorage.removeItem(EXAM_STATE_KEY); 
        }
    }

    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) {
        totalCountEl.innerText = QUESTION_TEMPLATES.length;
    }
};
