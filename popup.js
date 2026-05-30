"use strict";

const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const retryBtn = document.getElementById("retry-btn");
const controlsEl = document.getElementById("controls");
const loadingEl = document.getElementById("loading");
const trackSelectorRow = document.getElementById("track-selector-row");
const trackSelect = document.getElementById("track-select");
const previewEl = document.getElementById("preview");
const downloadBtn = document.getElementById("download-btn");

let segments = [];
let videoTitle = "transcript";

function showStatus(msg, type = "info", showRetry = false) {
  statusText.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
  retryBtn.classList.toggle("hidden", !showRetry);
  controlsEl.classList.add("hidden");
}

function parseVtt(vttText) {
  const result = [];
  const blocks = vttText.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[\.,](\d{3})\s*-->/
    );
    if (!timeMatch) continue;

    const startSec =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const timeLineIdx = lines.indexOf(timeLine);
    const textLines = lines.slice(timeLineIdx + 1).filter((l) => l.trim());
    if (!textLines.length) continue;

    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (text) result.push({ startSec, text });
  }

  return result;
}

function toHHMMSS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatClean(segs) {
  let result = "";
  for (let i = 0; i < segs.length; i++) {
    if (i > 0) {
      const pause = segs[i].startSec - segs[i - 1].startSec;
      const prevEndsWithStop = /[.!?…]\s*$/.test(segs[i - 1].text);
      const isParagraphBreak = pause >= 5 && prevEndsWithStop;
      result += isParagraphBreak ? "\n\n" : " ";
    }
    result += segs[i].text;
  }
  return result;
}

function formatTimestamps(segs) {
  return segs.map((s) => `[${toHHMMSS(s.startSec)}] ${s.text}`).join("\n");
}

function getFormat() {
  return document.querySelector('input[name="format"]:checked').value;
}

function renderPreview() {
  const text =
    getFormat() === "clean"
      ? formatClean(segments)
      : formatTimestamps(segments);
  previewEl.textContent = text;
}

function download() {
  const text =
    getFormat() === "clean"
      ? formatClean(segments)
      : formatTimestamps(segments);

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${videoTitle}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadVtt(vttUrl) {
  loadingEl.classList.remove("hidden");
  try {
    const resp = await fetch(vttUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    return parseVtt(text);
  } finally {
    loadingEl.classList.add("hidden");
  }
}

function readPlayerConfig() {
  const cfg = window.playerConfig;
  if (!cfg?.request?.text_tracks?.length) return null;
  return {
    videoId: cfg.video?.id,
    title: cfg.video?.title || "transcript",
    tracks: cfg.request.text_tracks.map((t) => ({
      label: t.label,
      url: t.url,
      lang: t.lang,
    })),
    savedAt: Date.now(),
  };
}

async function rejectScript() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showStatus("Не удалось получить активную вкладку.", "error", true);
    return;
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN",
      func: readPlayerConfig,
    });
  } catch (e) {
    showStatus(
      "Не удалось подключиться к странице.\nУбедитесь что страница с видео открыта, затем обновите страницу (F5) и попробуйте снова.",
      "error",
      true
    );
    return;
  }
  const data = results?.find((r) => r.result)?.result;
  if (data) {
    await chrome.storage.local.set({ vimeoTranscript: data });
    await renderTranscript(data);
  } else {
    showStatus(
      "Видео Vimeo не найдено на странице.\n\n1. Убедитесь, что урок с видео открыт.\n2. Дождитесь загрузки плеера.\n3. Нажмите «Обновить» снова.",
      "info",
      true
    );
  }
}

async function renderTranscript(data) {
  if (!data.tracks || !data.tracks.length) {
    showStatus(
      "Субтитры для этого видео недоступны.\nВозможно, автор курса не добавил субтитры к этому уроку.",
      "error",
      false
    );
    return;
  }

  videoTitle = data.title || "transcript";
  statusEl.classList.add("hidden");

  if (data.tracks.length > 1) {
    trackSelectorRow.classList.remove("hidden");
    trackSelect.innerHTML = "";
    data.tracks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.url;
      opt.textContent = t.label;
      trackSelect.appendChild(opt);
    });
  }

  const getUrl = () =>
    data.tracks.length > 1 ? trackSelect.value : data.tracks[0].url;

  try {
    segments = await loadVtt(getUrl());
  } catch (e) {
    const expired = e.message.includes("403") || e.message.includes("401");
    showStatus(
      expired
        ? "Ссылка на субтитры устарела.\nПерезагрузите страницу с видео (F5) и нажмите «Обновить»."
        : `Ошибка загрузки транскрипта: ${e.message}`,
      "error",
      expired
    );
    return;
  }

  if (!segments.length) {
    showStatus("Транскрипт пуст или не удалось распарсить.", "error", false);
    return;
  }

  controlsEl.classList.remove("hidden");
  renderPreview();

  document.querySelectorAll('input[name="format"]').forEach((r) => {
    r.addEventListener("change", renderPreview);
  });

  trackSelect.addEventListener("change", async () => {
    try {
      segments = await loadVtt(trackSelect.value);
      renderPreview();
    } catch (e) {
      showStatus(`Ошибка: ${e.message}`, "error", true);
    }
  });

  downloadBtn.addEventListener("click", download);
}

async function init() {
  const result = await chrome.storage.local.get("vimeoTranscript");
  const data = result.vimeoTranscript;

  if (!data) {
    showStatus(
      "Видео Vimeo не найдено.\n\n1. Убедитесь, что урок с видео открыт в браузере.\n2. Дождитесь полной загрузки плеера.\n3. Нажмите «Обновить».",
      "info",
      true
    );
    return;
  }

  await renderTranscript(data);
}

// Auto-refresh when content script writes data while popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.vimeoTranscript?.newValue) {
    renderTranscript(changes.vimeoTranscript.newValue);
  }
});

retryBtn.addEventListener("click", async () => {
  statusText.textContent = "Подключаюсь к плееру...";
  retryBtn.classList.add("hidden");
  await rejectScript();
});

init();
