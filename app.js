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
let wakeLock = null;    

// --- Unity（WebGL）インスタンス自動検出・直接送信ロジック ---
function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    if (typeof unityInstance !== "undefined" && unityInstance && typeof unityInstance.SendMessage === "function") return unityInstance;
    if (typeof gameInstance !== "undefined" && gameInstance && typeof gameInstance.SendMessage === "function") return gameInstance;
    
    for (let key in window) {
        try {
            if (window[key] && typeof window[key].SendMessage === "function") {
                return window[key];
            }
        } catch (e) {}
    }
    return null;
}

function triggerUnityWebGLSound(cellId) {
    const instance = getUnityInstance();
    if (instance) {
        const messageName = `Web GL ${cellId}`;
        instance.SendMessage('AudioController', 'PlayTargetWebGLSound', messageName);
        console.log(`Unity Trigger: ${messageName}`);
    }
}

function stopUnityWebGLSound() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'StopBackgroundSound');
        console.log("Unity Stop");
    }
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
const listenApp = document.getElementById('listen-app');
const listenUserDisplay = document.getElementById('listen-user-display');

const basePaintingWrapper = document.getElementById('base-painting-wrapper');
const trimmingZoomWrapper = document.getElementById('trimming-zoom-wrapper');
const trimmedImageTarget = document.getElementById('trimmed-image-target');
const controlsArea = document.getElementById('controls-area');
const btnZoomBack = document.getElementById('btn-zoom-back');

// --- モーダル遷移ロジック（元の仕様のまま維持） ---
if (btnChoiceFirst) {
    btnChoiceFirst.addEventListener('click', (e) => {
        e.preventDefault();
        if (modalInputTitle) modalInputTitle.innerText = "新しく登録するユーザー名を入力";
        if (modalStep1) modalStep1.style.display = 'none';
        if (modalStep2) modalStep2.style.display = 'block';
    });
}

if (btnChoiceReturn) {
    btnChoiceReturn.addEventListener('click', (e) => {
        e.preventDefault();
        if (modalInputTitle) modalInputTitle.innerText = "登録済みのユーザー名を入力";
        if (modalStep1) modalStep1.style.display = 'none';
        if (modalStep2) modalStep2.style.display = 'block';
    });
}

if (btnBackStep) {
    btnBackStep.addEventListener('click', (e) => {
        e.preventDefault();
        if (modalStep2) modalStep2.style.display = 'none';
        if (modalStep1) modalStep1.style.display = 'block';
    });
}

if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
        e.preventDefault();
        const username = inputUsername.value.trim();
        if (!username) { alert("ユーザー名を入力してください。"); return; }
        currentUser = username;
        
        if (modalStep1) modalStep1.style.display = 'none';
        if (modalStep2) modalStep2.style.display = 'none';
        if (modalStep3) modalStep3.style.display = 'block';
    });
}

if (btnModeListen) {
    btnModeListen.addEventListener('click', (e) => {
        e.preventDefault();
        if (userModal) userModal.style.display = 'none';
        if (listenApp) listenApp.style.display = 'block';
        if (listenUserDisplay) listenUserDisplay.innerText = currentUser;
    });
}

// --- 9分割タップ判定・自動トリミング変形 ＆ WebGL送信 ---
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
        const id = trigger.getAttribute('data-id');

        applyImageTrimming(id);
        basePaintingWrapper.style.display = 'none';
        trimmingZoomWrapper.style.display = 'block';
        controlsArea.style.visibility = 'visible'; 

        // WebGL側へ直接メッセージ「Web GL 1〜9」を送信
        triggerUnityWebGLSound(id);
        
        // 画面スリープ防止ロック開始
        requestWakeLock();
    });
});

function applyImageTrimming(id) {
    const row = Math.floor((id - 1) / 3); 
    const col = (id - 1) % 3;             
    trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;
}

// --- 「戻る」テキストボタンクリックによる静寂復帰 ---
if (btnZoomBack) {
    btnZoomBack.addEventListener('click', () => {
        trimmingZoomWrapper.style.display = 'none';
        basePaintingWrapper.style.display = 'block';
        controlsArea.style.visibility = 'hidden'; 
        
        // WebGLサウンド停止
        stopUnityWebGLSound();
        releaseWakeLock();
    });
}

// スリープ防止制御
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
