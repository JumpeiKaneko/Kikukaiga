let wakeLock = null;
let currentUnityInstance = null;
let currentScriptElement = null;

function getUnityInstance() {
    if (typeof window.unityInstance !== "undefined" && window.unityInstance && typeof window.unityInstance.SendMessage === "function") return window.unityInstance;
    if (typeof unityInstance !== "undefined" && unityInstance && typeof unityInstance.SendMessage === "function") return unityInstance;
    if (typeof gameInstance !== "undefined" && gameInstance && typeof gameInstance.SendMessage === "function") return gameInstance;
    return null;
}

function loadAndPlayUnityWebGL(id) {
    unloadUnityWebGL();

    const unityContainer = document.getElementById('unity-container');
    unityContainer.innerHTML = `<canvas id="unity-canvas" style="width: 0px; height: 0px;"></canvas>`;

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
            instance.SendMessage('AudioController', 'PlayTargetWebGLSound', `Web GL ${id}`);
        }).catch((message) => {
            console.error(`WebGL ${id} Load Failed:`, message);
        });
    };
    document.body.appendChild(currentScriptElement);
}

function unloadUnityWebGL() {
    if (currentUnityInstance) {
        try {
            currentUnityInstance.SendMessage('AudioController', 'StopBackgroundSound');
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
const paintingContainer = document.querySelector('.painting-view-container');

// 1. 初期状態（全体表示）からの9分割タップ
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = trigger.getAttribute('data-id');

        const row = Math.floor((id - 1) / 3);
        const col = (id - 1) % 3;
        trimmedImageTarget.style.objectPosition = `${col * 50}% ${row * 50}%`;

        viewFull.style.display = 'none';
        viewZoom.style.display = 'block';
        
        // ズーム状態であることを示すクラスを外枠に付与
        paintingContainer.classList.add('is-zoomed');

        loadAndPlayUnityWebGL(id);
        requestWakeLock();
    });
});

// 2. ズーム状態からの再タップ（額縁コンテナ自体のクリックで確実に全体へ戻す）
paintingContainer.addEventListener('click', (e) => {
    // ズーム状態のときだけ作動させる
    if (!paintingContainer.classList.contains('is-zoomed')) return;
    
    // 透明グリッドのボタン自体へのタップだった場合はすり抜ける（多重動作防止）
    if (e.target.classList.contains('grid-cell-trigger')) return;

    viewZoom.style.display = 'none';
    viewFull.style.display = 'block';
    paintingContainer.classList.remove('is-zoomed');

    unloadUnityWebGL();
    releaseWakeLock();
});

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
