const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.removeAllListeners('external:control');

contextBridge.exposeInMainWorld('petWindow', {
  resizeBy: (deltaWidth, deltaHeight) => ipcRenderer.send('window:resize-by', {
    deltaWidth,
    deltaHeight
  })
});

contextBridge.exposeInMainWorld('petAI', {
  chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  getMode: () => ipcRenderer.invoke('ai:get-mode')
});

contextBridge.exposeInMainWorld('petMemory', {
  loadChatHistory: () => ipcRenderer.invoke('memory:load-chat-history'),
  saveChatHistory: (history) => ipcRenderer.invoke('memory:save-chat-history', history)
});

contextBridge.exposeInMainWorld('petExternal', {
  onControl: (handler) => {
    ipcRenderer.removeAllListeners('external:control');
    ipcRenderer.on('external:control', (_event, payload) => handler(payload));
  }
});

contextBridge.exposeInMainWorld('petInput', {
  touch: (event) => ipcRenderer.invoke('pet:touch', event),
  sendMessage: (text) => ipcRenderer.invoke('pet:send-message', text)
});

contextBridge.exposeInMainWorld('electronDrag', {
  move: (dx, dy) => ipcRenderer.send('window:move-by', { dx, dy })
});

// TTS voice preference from env
const ttsVoice = process.env.TTS_VOICE || '';
if (ttsVoice) {
  contextBridge.exposeInMainWorld('petTtsVoice', ttsVoice);
}
