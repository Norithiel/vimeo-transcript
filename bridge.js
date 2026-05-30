document.addEventListener("__vimeoTranscriptData", (e) => {
  chrome.storage.local.set({ vimeoTranscript: e.detail });
});
