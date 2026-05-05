
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { spawn, execSync } = require('child_process');

// 🚀 Multi-Stream Key Manager
const STREAM_KEYS = {
    '1': '14601603391083_14040893622891_puxzrwjniu', 
    '2': '14601696583275_14041072274027_apdzpdb5xi', 
    '3': '14617940008555_14072500914795_ohw67ls7ny',
    '4': '14601972227691_14041593547371_obdhgewlmq',
    '5': '15145825803883_15082736847467_hjyjq4bud4',
    '6': '15145851166315_15082784229995_mr5eweath4', 
    '7': '15145866042987_15082813393515_axt6r27f7m',
    '8': '15145878756971_15082836265579_oeowgtmnxu'
};

const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];

const RTMP_SERVER = 'rtmp://vsu.okcdn.ru/input/';
const RTMP_DESTINATION = `${RTMP_SERVER}${ACTIVE_STREAM_KEY}`;

let browser = null;
let ffmpegProcess = null;

async function mainLoop() {
    while (true) {
        try {
            await startDirectStreaming();
        } catch (error) {
            console.error(`\n[!] ALERT: ${error.message}`);
            console.log('[*] 🔄 Restarting everything in 3 seconds as requested...');
            await cleanup();
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

async function startDirectStreaming() {
    console.log(`[*] Starting browser and FFmpeg...`);
    console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL}`);

    const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';

    const browserArgs = [
        '--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720',
        '--kiosk', '--autoplay-policy=no-user-gesture-required' 
    ];

    console.log(`Launching Browser on Virtual Screen...`);
    browser = await puppeteer.launch({
        channel: 'chrome',
        headless: false, 
        defaultViewport: { width: 1280, height: 720 },
        ignoreDefaultArgs: ['--enable-automation'], 
        args: browserArgs
    });

    const page = await browser.newPage();
    const pages = await browser.pages();
    for (const p of pages) {
        if (p !== page) await p.close();
    }

    // Aggressive Ad-Popup Blocker
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== page) {
                    console.log(`[*] Adware tab detected! Forcing video tab back to foreground...`);
                    await page.bringToFront(); 
                    setTimeout(() => newPage.close().catch(() => { }), 2000);
                }
            } catch (e) { }
        }
    });

    const displayNum = process.env.DISPLAY || ':99';

    console.log(`[*] Navigating to target URL: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 8000));

    // =========================================================================
    // 🎯 NEW: THE PLAY BUTTON CLICKER (For OPlayer & others)
    // =========================================================================
    console.log('[*] Hunting for the "Play" Button...');
    let playClicked = false;
    let attempts = 0;

    while (!playClicked && attempts < 15) {
        for (const frame of page.frames()) {
            try {
                const playBtn = await frame.$('button[aria-label="Play"], .jw-icon-display[aria-label="Play"], #UnMutePlayer button.unmute');
                if (playBtn) {
                    const isVisible = await frame.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.opacity !== '0';
                    }, playBtn);

                    if (isVisible) {
                        console.log(`[*] Play/Unmute button found! Clicking it now...`);
                        await frame.evaluate(el => el.click(), playBtn); 
                        playClicked = true;
                        await new Promise(r => setTimeout(r, 2000));
                        await page.bringToFront();
                        break; 
                    }
                }
            } catch (err) {}
        }
        if (playClicked) break; 
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }

    // =========================================================================
    // 🧠 THE SMART SCANNER & CLEANER 
    // =========================================================================
    let targetFrame = null;
    console.log('[*] Scanning iframes for the REAL Live Stream Video...');
    for (const frame of page.frames()) {
        try {
            const isRealLiveStream = await frame.evaluate(() => {
                const vid = document.querySelector('video[data-html5-video]') || document.querySelector('video');
                if (!vid) return false;
                if (vid.clientWidth < 300 || vid.clientHeight < 200) return false;
                return true; 
            });

            if (isRealLiveStream) {
                targetFrame = frame;
                console.log(`[+] Smart Scanner selected Real Video in frame: ${frame.url() || 'unknown'}`);
            }

            await frame.evaluate(() => {
                const floatedAd = document.getElementById('floated');
                if (floatedAd) floatedAd.remove();
            });
        } catch (e) { }
    }

    if (!targetFrame) throw new Error('No <video> element could be found.');

    // =========================================================================
    // 🔊 AUDIO UNLOCKER + UI HIDER (Updated for OPlayer)
    // =========================================================================
    console.log('[*] Stealth Mode: Unmuting video and hiding player UI...');
    await targetFrame.evaluate(async () => {
        const style = document.createElement('style');
        style.innerHTML = `
            .jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, .clappr-core, 
            [data-player] .controls, .unmute-overlay, .play-overlay, button, 
            .dplayer-controller, .dplayer-notice { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
            video::-webkit-media-controls { display: none !important; }
            .oplayer-ui, oplayer-ui, [data-oplayer], #player > div > div:not(video) { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
        `;
        document.head.appendChild(style);

        const video = document.querySelector('video[data-html5-video]') || document.querySelector('video');
        if (video) {
            video.removeAttribute('controls');
            video.muted = false; 
            video.volume = 1.0; 
            await video.play().catch(e => {});
        }
    });

    await new Promise(r => setTimeout(r, 2000));

    // =========================================================================
    // 📡 FFMPEG BROADCAST (YOUR PERFECT SYNC SETTINGS)
    // =========================================================================
    function startBroadcast() {
        if (ffmpegProcess) return; 
        
        let ffmpegArgs = [];

        if (streamQuality.includes('40KBps')) {
            console.log('\n[*] 🚀 FFmpeg Mode: ULTRA-LOW BANDWIDTH (360p @ 20FPS)...');
            ffmpegArgs = [
                '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
                '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '20',
                '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
                '-vf', 'scale=640:360',
                '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'baseline',
                '-b:v', '200k', '-maxrate', '250k', '-bufsize', '500k',
                '-pix_fmt', 'yuv420p', '-g', '40', '-max_muxing_queue_size', '1024',
                '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-ar', '44100',
                '-async', '1', '-f', 'flv', RTMP_DESTINATION 
            ];
        } else {
            console.log('\n[*] 🚀 FFmpeg Mode: BALANCED 480p (854x480 @ 30FPS)... perfect sync active!');
            ffmpegArgs = [
                '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
                '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
                '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
                '-vf', 'scale=854:480',
                '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
                '-b:v', '800k', '-maxrate', '850k', '-bufsize', '1700k',
                '-pix_fmt', 'yuv420p', '-g', '60', '-max_muxing_queue_size', '1024',
                '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-ar', '44100',
                '-async', '1', '-f', 'flv', RTMP_DESTINATION 
            ];
        }

        ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output.includes('Error') || output.includes('Failed')) {
                console.log(`\n[FFmpeg Issue]: ${output}`);
            }
        });

        ffmpegProcess.on('close', (code) => console.log(`\n[*] FFmpeg exited (Code: ${code})`));
    }

    startBroadcast();

    // =========================================================================
    // 🧠 THE SMART WATCHDOG & LOADER OVERLAY
    // =========================================================================
    console.log('\n[*] Smart Engine Connected! Monitoring Video Health & Privacy 24/7...');

    let bufferCounter = 0; 

    while (true) {
        if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

        await page.evaluate(() => {
            document.body.style.backgroundColor = 'black';
            document.body.style.overflow = 'hidden';
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
                iframe.style.width = '100vw'; iframe.style.height = '100vh';
                iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
            });
        }).catch(() => {});

        const status = await targetFrame.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';

            const v = document.querySelector('video[data-html5-video]') || document.querySelector('video');
            if (!v || v.ended) return 'DEAD';

            if (v.readyState < 2) return 'BUFFERING';

            v.style.position = 'fixed'; v.style.top = '0'; v.style.left = '0';
            v.style.width = '100vw'; v.style.height = '100vh';
            v.style.zIndex = '2147483647'; v.style.backgroundColor = 'black'; v.style.objectFit = 'contain';

            return 'HEALTHY';
        }).catch(() => 'EVAL_ERROR');

        if (status === 'BUFFERING') {
            await page.evaluate(() => {
                let overlay = document.getElementById('main-watchdog-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'main-watchdog-overlay';
                    overlay.innerHTML = `
                        <style>
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            .loader-container { text-align: center; color: white; font-family: sans-serif; }
                            .loader { border: 8px solid rgba(255, 255, 255, 0.1); border-top: 8px solid #ffaa00; border-radius: 50%; width: 80px; height: 80px; animation: spin 1s linear infinite; margin: 0 auto 30px auto; }
                            .loading-text { font-size: 32px; font-weight: bold; margin-bottom: 15px; }
                            .reassurance-text { font-size: 20px; color: #cccccc; font-weight: normal; }
                        </style>
                        <div class="loader-container"><div class="loader"></div><div class="loading-text">लोड हो रहा है...</div><div class="reassurance-text">कृपया प्रतीक्षा करें, यह शीघ्र ही फिर से शुरू होगा!</div></div>
                    `;
                    overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0';
                    overlay.style.width = '100vw'; overlay.style.height = '100vh'; overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)'; 
                    overlay.style.zIndex = '2147483647'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
                    document.body.appendChild(overlay);
                }
            }).catch(() => {});

            bufferCounter++;
            console.log(`[!] Video is buffering... showing Professional Secure Holding Screen. (${bufferCounter}/15)`);
            if (bufferCounter > 15) throw new Error("Video stuck in buffering for too long.");
        } else {
            await page.evaluate(() => {
                let existingOverlay = document.getElementById('main-watchdog-overlay');
                if (existingOverlay) existingOverlay.remove();
            }).catch(() => {});
            bufferCounter = 0; 
        }

        if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
            console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
            throw new Error("Watchdog detected video dead."); 
        }

        await new Promise(r => setTimeout(r, 3000)); 
    }
}

async function cleanup() {
    if (ffmpegProcess) {
        try { ffmpegProcess.stdin.end(); ffmpegProcess.kill('SIGKILL'); } catch (e) { }
        ffmpegProcess = null;
    }
    if (browser) {
        try { await browser.close(); } catch (e) { }
        browser = null;
    }
}

process.on('SIGINT', async () => {
    console.log('\n[*] Stopping live script cleanly...');
    await cleanup();
    process.exit(0);
});

// =========================================================================
// ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// =========================================================================
setTimeout(async () => {
    console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GH_PAT;
    const ref = process.env.GITHUB_REF_NAME || 'main';
    const workflowFileName = 'main.yml'; 

    if (!repo || !token) {
        console.log("[!] GitHub Token (GH_PAT) ya Repo data nahi mila. Auto-trigger skip kar raha hu.");
        return;
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFileName}/dispatches`, {
            method: 'POST',
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
            body: JSON.stringify({
                ref: ref,
                inputs: {
                    target_url: process.env.TARGET_URL,
                    okru_stream_channel: process.env.OKRU_STREAM_ID,
                    use_proxy: process.env.USE_PROXY,
                    stream_quality: process.env.STREAM_QUALITY
                }
            })
        });

        if (response.ok) {
            console.log("[+] Next workflow run successfully triggered!");
        } else {
            console.error("[-] GitHub API responded with error:", response.status, await response.text());
        }
    } catch (err) {
        console.error("[-] Failed to trigger next workflow:", err);
    }
}, 21000000); 

mainLoop();















// --------------- done, bas iss mei yeh audio and video sync k issue hai ====================



// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
//             '--disable-gpu', '--disable-software-rasterizer', '--disable-accelerated-2d-canvas', 
//             '--force-color-profile=srgb', '--window-size=1280,720', '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) { if (p !== page) await p.close(); }

//     // 🛑 Ad & Popup Blocker
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED!`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
//     await new Promise(r => setTimeout(r, 5000));

//     // 🎯 THE PLAY BUTTON CLICKER (Based on your DevTools Image)
//     console.log('[*] Hunting for the "Play" Button...');
//     let playClicked = false;
//     let attempts = 0;

//     while (!playClicked && attempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 // Targetting the exact button shown in your image
//                 const playBtn = await frame.$('button[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         console.log(`[*] "Play" button found in iframe! Clicking it now...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         playClicked = true;
//                         console.log(`[+] Clicked successfully!`);
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (playClicked) break; 
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 Smart Scanner
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 return (vid && vid.clientWidth > 100 && vid.clientHeight > 100);
//             });
//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame!`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) targetFrame = page.mainFrame();

//     // ⬛ Force Black Background & Hide Player UI
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black'; document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `
//             /* Hide all known player UIs */
//             .jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }
//             video::-webkit-media-controls { display: none !important; }
//             /* OPlayer Specific UI Hiding */
//             .oplayer-ui, oplayer-ui, [data-oplayer], #player > div > div:not(video) { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
//         `;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.removeAttribute('controls');
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//             await video.play().catch(e => {});
//         }
//     }).catch(()=>{});

//     // 📡 FFmpeg Broadcast
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, '-itsoffset', '1.2', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
//         '-f', 'pulse', '-i', 'default',
//         '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', '800k', '-maxrate', '850k', '-bufsize', '1700k',
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-ar', '44100',
//         '-af', 'aresample=async=1000', '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg]: ${data}`);
//     });

//     // 🧠 Watchdog
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
//             if (v.paused) {
//                 console.log("Video paused! Forcing play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_RECOVERED';
//             }
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'DEAD') throw new Error("Watchdog detected video dead."); 
//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
//     const workflowFileName = 'main.yml'; 

//     if (!repo || !token) return console.log("[!] GitHub Token (GH_PAT) missing. Skip auto-trigger.");

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFileName}/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow successfully triggered!");
//     } catch (err) { console.error("[-] Failed to trigger:", err); }
// }, 21000000); // 5 Hours & 50 Minutes

// mainLoop();
