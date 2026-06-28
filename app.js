let wakeLock = null;
let currentUnityInstance = null;
let currentScriptElement = null;

// タップされた番号のWebGLを動的にロードして音を鳴らす関数
function loadAndPlayUnityWebGL(id) {
    // 既存のWebGLインスタンスやスクリプトが残っていれば完全に削除
    unloadUnityWebGL();

    const unityContainer = document.getElementById('unity-container');
    unityContainer.innerHTML = `<canvas id="unity-canvas" style="width: 0px; height: 0px;"></canvas>`;

    // タップされた番号に応じたビルドパスの動的生成
    const loaderUrl = `./Unity/${id}/Build/build_bird.loader.js`; 
    const config = {
        dataUrl: `./Unity/${id}/Build/build_bird.data`,
        frameworkUrl: `./Unity/${id}/Build/build_bird.framework.js`,
        codeUrl: `./Unity/${id}/Build/build_bird.wasm`,
        streamingAssetsUrl: "StreamingAssets",
        companyName: "DefaultCompany",
        productName: `kaiga-wo-kiku-${id}`,
        productVersion: "0.1",
    };

    currentScriptElement = document.createElement("script");
    currentScriptElement.src = loaderUrl;
    currentScriptElement.onload = () => {
        createUnityInstance(document.querySelector("#unity-canvas"), config, (progress) => {}).then((instance) => {
            currentUnityInstance = instance;
            // ロード完了後、該当ビルドにPlay命令を送信
            instance.SendMessage('AudioController', 'PlayTargetWebGLSound', `Web GL ${id}`);
        }).catch((message) => {
            console.error(`WebGL ${id} Load Failed:`, message);
        });
    };
    document.body.appendChild(currentScriptElement);
}

// 全体表示に戻る際、再生中のWebGLシステムを完全に停止・破棄する関数
function unloadUnityWebGL() {
    if (currentUnityInstance) {
        try {
            currentUnityInstance.SendMessage('AudioController', 'StopBackgroundSound');
            // Unityインスタンス自体のQuit処理（実装されている場合）
            if (typeof currentUnityInstance.Quit === "function") {
                currentUnityInstance.Quit();
            }
        } catch(e) {}
        currentUnityInstance = null;
    }
    if (currentScriptElement) {
        currentScriptElement.remove();
        currentScriptElement = null;
    }
    const unityContainer = document.getElementById('unity-container');
    unityContainer.innerHTML = '';
}

const viewFull = document.getElementById('view-full');
const viewZoom = document.getElementById('view-zoom');
const trimmedImageTarget = document.getElementById('trimmed-image-target');

// 1. 初期状態（全体表示）からの9分割タップ
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = trigger.getAttribute('data-id');

        // 枠内ズーム位置の計算
        const row = Math.floor((id - 1) / 3);
        const col = (id - 1) % 3;
        trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;

        // 表示切り替え
        viewFull.style.display = 'none';
        viewZoom.style.display = 'block';

        // 該当番号の独立したWebGLをロード＆再生
        loadAndPlayUnityWebGL(id);
        
        requestWakeLock();
    });
});

// 2. ズーム状態からの再タップで全体表示へ復帰
viewZoom.addEventListener('click', () => {
    viewZoom.style.display = 'none';
    viewFull.style.display = 'block';

    // 読み込んでいたWebGLを完全にアンロードして静寂に戻す
    unloadUnityWebGL();
    releaseWakeLock();
});

// スリープ制御
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
