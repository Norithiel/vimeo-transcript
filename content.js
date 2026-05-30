(function () {
  const config = window.playerConfig;
  if (!config?.request?.text_tracks?.length) return;

  const tracks = config.request.text_tracks.map((t) => ({
    label: t.label,
    url: t.url,
    lang: t.lang,
  }));

  const data = {
    videoId: config.video?.id,
    title: config.video?.title || "transcript",
    tracks,
    savedAt: Date.now(),
  };

  chrome.storage.local.set({ vimeoTranscript: data });
})();
