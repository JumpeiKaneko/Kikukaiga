let wakeLock = null;    

// --- Unity WebGL インスタンスへの直接メッセージ送信 ---
function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    if (typeof unityInstance !== "undefined" && unityInstance && typeof unityInstance.SendMessage === "function") return unityInstance;
    return null;
}

// タップされたタイミングでUnity側のAudioControllerへ「Web GL 1」〜「Web GL 9」を直接トリガー
function triggerUnityWebGLSound(cellId) {
    const instance = getUnityInstance();
    if (instance) {
        const messageName = `Web GL ${cellId}`;
        instance.SendMessage('AudioController', 'PlayTargetWebGLSound', messageName);
        console.log(`Unity Trigger: ${messageName}`);
    }
}

// 戻るボタンが押された際に、Unity側のサウンドを完全に停止させる
function stopUnityWebGLSound() {
    const instance = getUnityInstance();
    if (instance) {
        instance.SendMessage('AudioController', 'StopBackgroundSound');
        console.log("Unity Sound Stopped.");
    }
}

// --- DOM要素の接続 ---
const basePaintingWrapper = document.getElementById('base-painting-wrapper');
const trimmingZoomWrapper = document.getElementById('trimming-zoom-wrapper');
const trimmedImageTarget = document.getElementById('trimmed-image-target');
const controlsArea = document.getElementById('controls-area');
const btnZoomBack = document.getElementById('btn-zoom-back');

// --- 9分割タップ・自動トリミング ＆ WebGLサウンドトリガー ---
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
        const id = trigger.getAttribute('data-id');

        // 正方形の枠のサイズを維持したまま、中身のオブジェクトポジションをシフトして変形
        applyImageTrimming(id);

        // 全体表示を隠し、トリミング画面と「戻る」文字を静かに出現させる
        basePaintingWrapper.style.display = 'none';
        trimmingZoomWrapper.style.display = 'block';
        controlsArea.style.visibility = 'visible'; 

        // WebGL側へ直接、音の再生命令（Web GL 1〜9）を飛ばす
        triggerUnityWebGLSound(id);
        
        // 端末が途中で画面スリープして音が途切れるのを自動防止
        requestWakeLock();
    });
});

// 額縁のサイズを破壊せず、内側の画像位置だけを縦横％で美しくズームさせる関数
function applyImageTrimming(id) {
    const row = Math.floor((id - 1) / 3); 
    const col = (id - 1) % 3;             
    trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;
}

// --- 「戻る」テキストをクリックした際の挙動 ---
if (btnZoomBack) {
    btnZoomBack.addEventListener('click', () => {
        // 全体表示の1枚絵へと静かに復帰
        trimmingZoomWrapper.style.display = 'none';
        basePaintingWrapper.style.display = 'block';
        controlsArea.style.visibility = 'hidden'; 
        
        // WebGL側の音を完全に停止し、静寂に戻す
        stopUnityWebGLSound();
        
        // スリープ防止ロックを解除
        releaseWakeLock();
    });
}

// 端末の画面スリープ防止（Wakelock API）自動制御
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
