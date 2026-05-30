"use strict";

const statusEl = document.getElementById("status");
const controlsEl = document.getElementById("controls");
const loadingEl = document.getElementById("loading");
const trackSelectorRow = document.getElementById("track-selector-row");
const trackSelect = document.getElementById("track-select");
const previewEl = document.getElementById("preview");
const downloadBtn = document.getElementById("download-btn");

let segments = [];
let videoTitle = "transcript";

function showStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
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
    if (i > 0 && segs[i].startSec - segs[i - 1].startSec > 3) {
      result += "\n\n";
    } else if (i > 0) {
      result += " ";
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

async function init() {
  const result = await chrome.storage.local.get("vimeoTranscript");
  const data = result.vimeoTranscript;

  if (!data) {
    showStatus(
      "Видео Vimeo не найдено.\nОткройте страницу урока и дождитесь загрузки видео.",
      "info"
    );
    return;
  }

  if (!data.tracks || !data.tracks.length) {
    showStatus("Субтитры для этого видео недоступны.", "error");
    return;
  }

  videoTitle = data.title || "transcript";

  if (data.tracks.length > 1) {
    trackSelectorRow.classList.remove("hidden");
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
    showStatus(`Ошибка загрузки транскрипта: ${e.message}`, "error");
    return;
  }

  if (!segments.length) {
    showStatus("Транскрипт пуст или не удалось распарсить.", "error");
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
      showStatus(`Ошибка: ${e.message}`, "error");
    }
  });

  downloadBtn.addEventListener("click", download);
}

init();
