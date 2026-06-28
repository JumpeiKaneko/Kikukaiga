const firebaseConfig = {
    apiKey: "AIzaSyCwBqi08ShVjJ90Mku2NsXJK0E03p4CsT4",
    authDomain: "kaiga-wo-kiku.firebaseapp.com",
    projectId: "kaiga-wo-kiku",
    storageBucket: "kaiga-wo-kiku.firebasestorage.app"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// セッション識別用の匿名ランダムIDを裏で自動生成（画面には一切出さない）
let currentUser = "User_" + Math.random().toString(36).substring(2, 6).toUpperCase(); 

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

function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    return null;
}

function triggerUnityWebGLSound(cellId) {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'PlayTargetWebGLSound', `Web GL ${cellId}`);
    }
}

function stopUnityWebGLSound() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'StopBackgroundSound');
    }
}

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
            } catch (e) {}
        }
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
}

const basePaintingWrapper = document.getElementById('base-painting-wrapper');
const trimmingZoomWrapper = document.getElementById('trimming-zoom-wrapper');
const trimmedImageTarget = document.getElementById('trimmed-image-target');

window.addEventListener('DOMContentLoaded', () => {
    initAudio();
});

// --- 純粋な絵画のタップ・インタラクション ---
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', async () => {
        const id = trigger.getAttribute('data-id');
        await initAudio();

        currentActiveCellId = id;
        applyImageTrimming(id);

        basePaintingWrapper.style.display = 'none';
        trimmingZoomWrapper.style.display = 'block';

        // 音声のループ再生開始
        if (activeSource) { try { activeSource.stop(); } catch(e){} }
        activeSource = audioCtx.createBufferSource();
        activeSource.buffer = soundBuffers[id];
        activeSource.loop = true;
        activeSource.connect(bayerMasterGain);
        activeSource.start(0);

        cellStartTime = Date.now();
        triggerUnityWebGLSound(id);
        
        // スマホを配置した際のスリープを防止するロックを自動でオンにする
        requestWakeLock();
    });
});

function applyImageTrimming(id) {
    const row = Math.floor((id - 1) / 3); 
    const col = (id - 1) % 3;             
    trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;
}

// ズームされた絵画そのものをタップして、全体表示（静寂）へ戻す
if (trimmingZoomWrapper) {
    trimmingZoomWrapper.addEventListener('click', () => {
        trimmingZoomWrapper.style.display = 'none';
        basePaintingWrapper.style.display = 'block';
        
        if (activeSource) {
            try { activeSource.stop(); } catch(e){}
            activeSource = null;
        }
        stopUnityWebGLSound();
        releaseWakeLock(); // スリープ防止を解除

        // 体験変容の検証データ（聴取ログ）をFirebaseへ自動裏同期
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
    });
}

// 画面スリープ防止（Wakelock）自動制御
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {}
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}

// セキュリティ制限バイパス
document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, true);
document.body.addEventListener('touchstart', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, {passive: true, once: true});
