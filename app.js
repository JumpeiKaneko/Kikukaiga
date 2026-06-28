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
let activeSources = {}; // 9分割エリア用の再生ノード管理
let soundBuffers = {};  // オーディオバッファ格納用
let wakeLock = null;    // スリープ防止用

// 実験用ElevenLabsパーツ定義 (ストレージのWAVまたはMP3パス)
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

// ログ追跡用変数
let cellTimestamps = {};

// --- Unity WebGL (2ch空間環境背景音) 制御 ---
function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    if (typeof unityInstance !== "undefined" && unityInstance && typeof unityInstance.SendMessage === "function") return unityInstance;
    if (typeof gameInstance !== "undefined" && gameInstance && typeof gameInstance.SendMessage === "function") return gameInstance;
    return null;
}

function playUnityAudio() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'PlayBackgroundSound');
    }
}

function stopUnityAudio() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'StopBackgroundSound');
    }
}

// --- Web Audio API 初期化とパーツのプリロード ---
async function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        bayerMasterGain = audioCtx.createGain();
        bayerMasterGain.gain.value = 1.0;
        bayerMasterGain.connect(audioCtx.destination);
        
        // 9つの音声ファイルをFirebase Storageからプリロードしてデコード
        for (let id in soundMapping) {
            try {
                const storageRef = storage.ref().child(`assets/${soundMapping[id].file}`);
                const url = await storageRef.getDownloadURL();
                const response = await fetch(url.replace("http://", "https://"));
                const arrayBuffer = await response.arrayBuffer();
                soundBuffers[id] = await audioCtx.decodeAudioData(arrayBuffer);
                console.log(`Preloaded data successfully: ${soundMapping[id].name}`);
            } catch (e) {
                console.error(`Audio preloading error for cell ${id}:`, e);
            }
        }
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
}

// --- モーダル遷移・DOM接続 ---
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
        
        // ログイン確定のタイミングでWeb Audioを立ち上げてプリロード開始
        await initAudio(); 
    });
}

// 鑑賞モード起動
if (btnModeListen) {
    btnModeListen.addEventListener('click', (e) => {
        e.preventDefault();
        userModal.style.display = 'none';
        listenApp.style.display = 'block';
        listenUserDisplay.innerText = currentUser;
        playUnityAudio(); // 空間全体背景音のフェードイン開始
    });
}

// 演奏・固定モード起動
if (btnModeRecord) {
    btnModeRecord.addEventListener('click', (e) => {
        e.preventDefault();
        userModal.style.display = 'none';
        mainApp.style.display = 'block';
        renderFixedSoundSelector();
    });
}

// モード間相互スイッチ
if (btnChangeModeFromListen) {
    btnChangeModeFromListen.addEventListener('click', () => {
        listenApp.style.display = 'none';
        mainApp.style.display = 'block';
        stopAllGridAudio();
        renderFixedSoundSelector();
    });
}
if (btnBackToListen) {
    btnBackToListen.addEventListener('click', () => {
        mainApp.style.display = 'none';
        listenApp.style.display = 'block';
        listenUserDisplay.innerText = currentUser;
        stopFixedAudio();
        playUnityAudio();
    });
}

// --- 画面スリープ防止処理の組み込み ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakelockStatus.style.display = 'block';
        }
    } catch (err) {
        console.warn(`Wakelock request failed: ${err.message}`);
    }
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
        wakelockStatus.style.display = 'none';
    }
}

// --- セクション③：9分割グリッド鑑賞と自動Firebaseログ記録 ---
document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.addEventListener('click', async (e) => {
        const id = cell.getAttribute('data-id');
        const name = cell.getAttribute('data-name');
        await initAudio();

        if (!activeSources[id]) {
            // 音を鳴らす（ループ）
            if (!soundBuffers[id]) {
                console.warn("バッファのプリロードがまだ完了していません。");
                return;
            }
            const source = audioCtx.createBufferSource();
            source.buffer = soundBuffers[id];
            source.loop = true;
            source.connect(bayerMasterGain);
            source.start(0);
            activeSources[id] = source;
            cell.classList.add('active');

            // ログ用開始時間をスタンプ
            cellTimestamps[id] = Date.now();
        } else {
            // 音を止める
            try { activeSources[id].stop(); } catch(err){}
            delete activeSources[id];
            cell.classList.remove('active');

            // タップ秒数を計算してFirebase Firestoreへ定量同期
            const startTime = cellTimestamps[id];
            if (startTime) {
                const durationSec = (Date.now() - startTime) / 1000;
                delete cellTimestamps[id];

                db.collection("app_logs").add({
                    user: currentUser,
                    cellId: parseInt(id),
                    cellName: name,
                    duration: durationSec,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    console.log(`Firestoreログ同期成功: ${name}を ${durationSec}秒聴取`);
                }).catch(err => console.error("ログ同期エラー:", err));
            }
        }
    });
});

function stopAllGridAudio() {
    Object.keys(activeSources).forEach(id => {
        try { activeSources[id].stop(); } catch(e){}
        delete activeSources[id];
    });
    document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('active'));
    cellTimestamps = {};
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
        if (!selectedFixedId) { alert("配置したい音をリストから1つ選択してください。"); return; }
        await initAudio();

        if (!fixedSource) {
            // 再生開始・スリープ防止ロックオン
            if (!soundBuffers[selectedFixedId]) return;
            fixedSource = audioCtx.createBufferSource();
            fixedSource.buffer = soundBuffers[selectedFixedId];
            fixedSource.loop = true;
            fixedSource.connect(bayerMasterGain);
            fixedSource.start(0);
            
            btnFixedPlay.innerText = "この音の出力を停止する";
            btnFixedPlay.classList.add('recording');
            requestWakeLock();
            stopUnityAudio(); // 自身の端末からの空間BGM出力をカットして混線を防止
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

// ブラウザ無音化のセキュリティバイパス用
document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, true);
