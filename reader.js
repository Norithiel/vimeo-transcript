(function () {
  const cfg = window.playerConfig;
  if (!cfg?.request?.text_tracks?.length) return;

  const data = {
    videoId: cfg.video?.id,
    title: cfg.video?.title || "transcript",
    tracks: cfg.request.text_tracks.map((t) => ({
      label: t.label,
      url: t.url,
      lang: t.lang,
    })),
    savedAt: Date.now(),
  };

  document.dispatchEvent(
    new CustomEvent("__vimeoTranscriptData", { detail: data })
  );
})();
