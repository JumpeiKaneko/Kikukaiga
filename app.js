const firebaseConfig = {
    apiKey: "AIzaSyCwBqi08ShVjJ90Mku2NsXJK0E03p4CsT4",
    authDomain: "kaiga-wo-kiku.firebaseapp.com",
    projectId: "kaiga-wo-kiku",
    storageBucket: "kaiga-wo-kiku.firebasestorage.app"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

let currentUser = ""; 
let audioCtx;
let bayerMasterGain;
let activeSource = null; 
let soundBuffers = {};  
let wakeLock = null;    
let currentActiveCellId = null;
let cellStartTime = 0;

const soundMapping = {
    1: { name: "植物音（木々を揺らす風）", file: "forest_wind.mp3" },
    2: { name: "植物音（竹の擦れ合い）", file: "bamboo.mp3" },
    3: { name: "植物音（上空の鳥の声）", file: "sky_birds.mp3" },
    4: { name: "橋周辺（水門の音）", file: "water_gate.mp3" },
    5: { name: "橋周辺（太鼓橋のきしみ）", file: "bridge_creak.mp3" },
    6: { name: "橋周辺（近くを飛ぶ鳥）", file: "near_birds.mp3" },
    7: { name: "水面（小川の水流）", file: "stream.mp3" },
    8: { name: "水面（水面の揺らぎ）", file: "water_surface.mp3" },
    9: { name: "水面（カエル・虫の声）", file: "frogs.mp3" }
};

// --- Unity WebGL イベント送信（仕様準拠：Web GL 1〜9） ---
function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    if (typeof unityInstance !== "undefined" && unityInstance && typeof unityInstance.SendMessage === "function") return unityInstance;
    return null;
}

function triggerUnityWebGLSound(cellId) {
    const instance = getUnityInstance();
    if (instance) {
        const messageName = `Web GL ${cellId}`;
        instance.SendMessage('AudioController', 'PlayTargetWebGLSound', messageName);
        console.log(`Unity SendMessage: ${messageName}`);
    }
}

function stopUnityWebGLSound() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'StopBackgroundSound');
    }
}

// --- 音声初期化とプリロード ---
async function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        bayerMasterGain = audioCtx.createGain();
        bayerMasterGain.gain.value = 1.0;
        bayerMasterGain.connect(audioCtx.destination);
        
        for (let id in soundMapping) {
            try {
                const storageRef = storage.ref().child(`assets/${soundMapping[id].file}`);
                const url = await storageRef.getDownloadURL();
                const response = await fetch(url.replace("http://", "https://"));
                const arrayBuffer = await response.arrayBuffer();
                soundBuffers[id] = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.error(`Audio preloading error for cell ${id}:`, e);
            }
        }
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
}

// --- DOM接続 ---
const userModal = document.getElementById('user-modal');
const modalStep1 = document.getElementById('modal-step-1');
const modalStep2 = document.getElementById('modal-step-2');
const modalStep3 = document.getElementById('modal-step-3');
const modalInputTitle = document.getElementById('modal-input-title');
const btnChoiceFirst = document.getElementById('btn-choice-first');
const btnChoiceReturn = document.getElementById('btn-choice-return');
const btnBackStep = document.getElementById('btn-back-step');
const inputUsername = document.getElementById('input-username');
const btnLogin = document.getElementById('btn-login');
const btnModeListen = document.getElementById('btn-mode-listen');
const btnModeRecord = document.getElementById('btn-mode-record');
const mainApp = document.getElementById('main-app');
const listenApp = document.getElementById('listen-app');
const listenUserDisplay = document.getElementById('listen-user-display');
const btnChangeModeFromListen = document.getElementById('btn-change-mode-from-listen');
const btnBackToListen = document.getElementById('btn-back-to-listen');
const btnFixedPlay = document.getElementById('btn-fixed-play');
const fixedSoundList = document.getElementById('fixed-sound-list');
const wakelockStatus = document.getElementById('wakelock-status');

// トリミング制御用
const basePaintingWrapper = document.getElementById('base-painting-wrapper');
const trimmingZoomWrapper = document.getElementById('trimming-zoom-wrapper');
const trimmedImageTarget = document.getElementById('trimmed-image-target');
const zoomControlsArea = document.getElementById('zoom-controls-area');
const playingSoundName = document.getElementById('playing-sound-name');
const btnZoomBack = document.getElementById('btn-zoom-back');

// --- モーダル遷移ロジック ---
if (btnChoiceFirst) {
    btnChoiceFirst.addEventListener('click', (e) => {
        e.preventDefault();
        modalInputTitle.innerText = "新しく登録するユーザー名を入力";
        modalStep1.style.display = 'none';
        modalStep2.style.display = 'block';
    });
}
if (btnChoiceReturn) {
    btnChoiceReturn.addEventListener('click', (e) => {
        e.preventDefault();
        modalInputTitle.innerText = "登録済みのユーザー名を入力";
        modalStep1.style.display = 'none';
        modalStep2.style.display = 'block';
    });
}
if (btnBackStep) {
    btnBackStep.addEventListener('click', (e) => {
        e.preventDefault();
        modalStep2.style.display = 'none';
        modalStep1.style.display = 'block';
    });
}
if (btnLogin) {
    btnLogin.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = inputUsername.value.trim();
        if (!username) { alert("ユーザー名を入力してください。"); return; }
        currentUser = username;
        modalStep2.style.display = 'none';
        modalStep3.style.display = 'block';
        await initAudio(); 
    });
}

if (btnModeListen) {
    btnModeListen.addEventListener('click', (e) => {
        e.preventDefault();
        userModal.style.display = 'none';
        listenApp.style.display = 'block';
        listenUserDisplay.innerText = currentUser;
    });
}
if (btnModeRecord) {
    btnModeRecord.addEventListener('click', (e) => {
        e.preventDefault();
        userModal.style.display = 'none';
        mainApp.style.display = 'block';
        renderFixedSoundSelector();
    });
}

if (btnChangeModeFromListen) {
    btnChangeModeFromListen.addEventListener('click', () => {
        listenApp.style.display = 'none';
        mainApp.style.display = 'block';
        resetToGlobalPaintingView();
        renderFixedSoundSelector();
    });
}
if (btnBackToListen) {
    btnBackToListen.addEventListener('click', () => {
        mainApp.style.display = 'none';
        listenApp.style.display = 'block';
        listenUserDisplay.innerText = currentUser;
        stopFixedAudio();
    });
}

// --- 自動トリミング変形 ＆ 音声再生ロジック ---
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', async () => {
        const id = trigger.getAttribute('data-id');
        await initAudio();

        currentActiveCellId = id;
        playingSoundName.innerText = `再生中: ${soundMapping[id].name}`;

        // 枠のサイズを完全に維持したまま、中身を切り替える
        applyImageTrimming(id);
        basePaintingWrapper.style.display = 'none';
        trimmingZoomWrapper.style.display = 'block';
        zoomControlsArea.style.visibility = 'visible'; // 余白を保ったまま静かに出現

        // 音声ループ処理
        if (activeSource) { try { activeSource.stop(); } catch(e){} }
        activeSource = audioCtx.createBufferSource();
        activeSource.buffer = soundBuffers[id];
        activeSource.loop = true;
        activeSource.connect(bayerMasterGain);
        activeSource.start(0);

        cellStartTime = Date.now();

        // Unity WebGLへトリガー送信
        triggerUnityWebGLSound(id);
    });
});

function applyImageTrimming(id) {
    const row = Math.floor((id - 1) / 3); 
    const col = (id - 1) % 3;             
    trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;
}

if (btnZoomBack) {
    btnZoomBack.addEventListener('click', () => {
        resetToGlobalPaintingView();
    });
}

function resetToGlobalPaintingView() {
    trimmingZoomWrapper.style.display = 'none';
    basePaintingWrapper.style.display = 'block';
    zoomControlsArea.style.visibility = 'hidden';
    
    if (activeSource) {
        try { activeSource.stop(); } catch(e){}
        activeSource = null;
    }
    stopUnityWebGLSound();

    if (currentActiveCellId && cellStartTime > 0) {
        const durationSec = (Date.now() - cellStartTime) / 1000;
        db.collection("app_logs").add({
            user: currentUser,
            cellId: parseInt(currentActiveCellId),
            cellName: soundMapping[currentActiveCellId].name,
            duration: durationSec,
            type: "grid_listen",
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentActiveCellId = null;
        cellStartTime = 0;
    }
}

// --- セクション④：単一音選択＆生鳴らし固定制御 ---
let selectedFixedId = null;
let fixedSource = null;

function renderFixedSoundSelector() {
    fixedSoundList.innerHTML = "";
    for (let id in soundMapping) {
        const item = document.createElement('div');
        item.className = "fixed-sound-item";
        item.innerHTML = `
            <input type="radio" name="fixed-sound" id="radio-${id}" value="${id}">
            <label for="radio-${id}">${soundMapping[id].name}</label>
        `;
        fixedSoundList.appendChild(item);
    }
    document.querySelectorAll('input[name="fixed-sound"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedFixedId = e.target.value;
            stopFixedAudio();
        });
    });
}

if (btnFixedPlay) {
    btnFixedPlay.addEventListener('click', async () => {
        if (!selectedFixedId) { alert("配置する音を1つ選択してください。"); return; }
        await initAudio();

        if (!fixedSource) {
            if (!soundBuffers[selectedFixedId]) return;
            fixedSource = audioCtx.createBufferSource();
            fixedSource.buffer = soundBuffers[selectedFixedId];
            fixedSource.loop = true;
            fixedSource.connect(bayerMasterGain);
            fixedSource.start(0);
            
            btnFixedPlay.innerText = "出力を停止する";
            btnFixedPlay.classList.add('recording');
            requestWakeLock();
        } else {
            stopFixedAudio();
        }
    });
}

function stopFixedAudio() {
    if (fixedSource) {
        try { fixedSource.stop(); } catch(e){}
        fixedSource = null;
    }
    btnFixedPlay.innerText = "この音を大音量でループ再生して配置する";
    btnFixedPlay.classList.remove('recording');
    releaseWakeLock();
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakelockStatus.style.display = 'block';
        }
    } catch (err) {}
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
        wakelockStatus.style.display = 'none';
    }
}

document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, true);
