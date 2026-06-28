let wakeLock = null;
let currentUnityInstance = null;
let currentScriptElement = null;
let activeCellId = null;

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

const paintingFrame = document.getElementById('painting-frame');
const targetImage = document.getElementById('painting-target-image');
const controlsArea = document.getElementById('controls-area');
const btnZoomBack = document.getElementById('btn-zoom-back');

// 全面の9分割エリアのクリックイベント
document.querySelectorAll('.grid-cell-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = trigger.getAttribute('data-id');

        // すでにズーム状態で、かつ「同じ場所」がタップされた場合は全体に戻す
        if (paintingFrame.classList.contains('is-zoomed') && activeCellId === id) {
            triggerReset();
            return;
        }

        const row = Math.floor((id - 1) / 3);
        const col = (id - 1) % 3;
        targetImage.style.objectPosition = `${col * 50}% ${row * 50}%`;

        paintingFrame.classList.add('is-zoomed');
        controlsArea.style.visibility = 'visible'; // 四角いボタンを表示
        activeCellId = id; 

        loadAndPlayUnityWebGL(id);
        requestWakeLock();
    });
});

// 四角い「戻る」ボタンクリックで全体表示へ復帰
if (btnZoomBack) {
    btnZoomBack.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerReset();
    });
}

function triggerReset() {
    paintingFrame.classList.remove('is-zoomed');
    targetImage.style.objectPosition = 'center'; 
    controlsArea.style.visibility = 'hidden'; 
    activeCellId = null;
    
    unloadUnityWebGL();
    releaseWakeLock();
}

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
