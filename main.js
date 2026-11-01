const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

// مسار الأيقونة بصيغة ico
const appIconPath = path.join(__dirname, 'icon.ico');

// تعيين الاسم والمعرّف الرسمي في شريط مهام ويندوز
app.name = "نظام النداء لمركز الأمل الطبي";
if (process.platform === 'win32') {
  app.setAppUserModelId("com.alamal.queue.system");
}

let mainWindow;
let tvWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 850,
    title: "نظام النداء لمركز الأمل الطبي - لوحة الاستقبال",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  screen.on('display-added', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('screens-updated');
  });

  screen.on('display-removed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('screens-updated');
  });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// قراءة الشاشات
ipcMain.handle('get-screens', () => {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  return displays.map((display, index) => {
    const isPrimary = display.id === primaryDisplay.id;
    return {
      id: display.id,
      label: isPrimary 
        ? `شاشة اللابتوب الرئيسية (${display.bounds.width}×${display.bounds.height})`
        : `شاشة خارجية / HDMI ${index} (${display.bounds.width}×${display.bounds.height})`,
      bounds: display.bounds,
      isPrimary: isPrimary
    };
  });
});

// فتح شاشة التلفاز
ipcMain.on('open-tv-window', (event, displayId) => {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === Number(displayId)) || displays[0];

  if (tvWindow && !tvWindow.isDestroyed()) tvWindow.close();

  tvWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: true,
    autoHideMenuBar: true,
    title: "شاشة العرض العامة - مركز الأمل الطبي",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  tvWindow.loadFile('tv.html');
  tvWindow.on('closed', () => { tvWindow = null; });
});

// جلب الصوت العربي المباشر عبر الإنترنت مع إعادة المحاولة التلقائية
ipcMain.handle('fetch-online-audio', async (event, text) => {
  const getAudio = () => {
    return new Promise((resolve) => {
      const encodedText = encodeURIComponent(text);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=ar&client=tw-ob`;

      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        },
        timeout: 4000
      };

      const req = https.get(url, options, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(data);
          resolve(`data:audio/mp3;base64,${buffer.toString('base64')}`);
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  };

  let audioResult = await getAudio();
  if (!audioResult) {
    await new Promise(r => setTimeout(r, 300));
    audioResult = await getAudio();
  }

  return audioResult;
});