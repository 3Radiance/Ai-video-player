import express from "express";
import dotenv from "dotenv";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";
import { YoutubeTranscript } from "youtube-transcript";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const cuesByVideo = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHistory(history) {
  if (!Array.isArray(history) || !history.length) return "";
  const lines = history.slice(-10).map((h) => {
    const who = h.role === "user" ? "Пользователь" : "Ассистент";
    return `${who}: ${h.text}`;
  });
  return `\nНедавний диалог (для контекста):\n${lines.join("\n")}\n`;
}

function buildPrompt(cues, timestop, message, history) {
  const time = Number(timestop) || 0;
  const list = Array.isArray(cues) ? cues : [];
  const windowSec = 30;

  const active = list.find((c) => time >= c.start && time < c.end);
  const nearby = list.filter(
    (c) => c.end >= time - windowSec && c.start <= time + windowSec,
  );

  const lines = nearby
    .slice(0, 15)
    .map((c) => `[${formatTime(c.start)}-${formatTime(c.end)}] ${c.text}`);

  const nowLine = active
    ? `Сейчас в субтитрах: "${active.text}"`
    : "Сейчас в субтитрах тишина (скорее визуал или музыка без речи).";

  return `Ты дружелюбный собеседник, который смотрит видео вместе с пользователем. Общайся по-русски, живо и по-человечески — как в чате, не как сухая справка.

Правила:
- Субтитры ниже — только подсказка о том, что сказали в звуке. НЕ цитируй их дословно и НЕ отвечай одними фразами из субтитров.
- Обсуждай видео целиком: тему, смысл, что могло происходить в кадре, задавай уточняющие вопросы, если уместно.
- Если в субтитрах нет ответа на деталь (картинка, жест) — честно скажи, что по тексту это не видно, но всё равно помоги по смыслу ролика.
- Не выдумывай конкретные факты «я видел на экране X», если этого нет в субтитрах.
- Ответ 2–5 предложений, если пользователь не просит подробнее.
${formatHistory(history)}
Таймкод пользователя: ${formatTime(time)} (${time.toFixed(1)} сек)
${nowLine}

Фрагмент субтитров рядом (±${windowSec} сек) — для контекста, не для пересказа:
${lines.length ? lines.join("\n") : "(в этом отрезке речи в субтитрах нет)"}

Сообщение пользователя: ${message}`;
}

function errText(err) {
  return JSON.stringify(err?.message ?? err);
}

function isQuotaError(err) {
  return err?.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(errText(err));
}

function isOverloaded(err) {
  return err?.status === 503 || /UNAVAILABLE|high demand/i.test(errText(err));
}

function friendlyApiError(err) {
  if (isQuotaError(err)) {
    return `Лимит Gemini (429). Проверь https://ai.dev/rate-limit. Модель: ${GEMINI_MODEL}`;
  }
  if (isOverloaded(err)) {
    return "Gemini перегружен (503). Это сервер Google, не твой таймер. Подожди 2–3 минуты и отправь снова.";
  }
  return err?.message ?? "ошибка API";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 503 у Google — временный; пробуем ещё раз с паузой, не спамим с фронта */
async function askGemini(prompt) {
  const waits = [0, 8_000, 16_000];
  let lastError;

  for (let i = 0; i < waits.length; i++) {
    if (waits[i]) await sleep(waits[i]);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      return response.text ?? "";
    } catch (err) {
      lastError = err;
      if (isQuotaError(err)) throw err;
      if (!isOverloaded(err)) throw err;
      console.warn(`Gemini 503, попытка ${i + 1}/${waits.length}`);
    }
  }

  throw lastError;
}

app.post("/api/chat", async (req, res) => {
  const { message, timestop, videoId, history, cues: cuesFromBody } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "нет сообщения" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "нет GEMINI_API_KEY в .env" });
  }

  const cues =
    (videoId && cuesByVideo.get(videoId)) || cuesFromBody || [];

  if (!cues.length) {
    return res.status(400).json({
      error: "нет субтитров — сначала Play по видео",
    });
  }

  try {
    const prompt = buildPrompt(
      cues,
      timestop,
      message.trim(),
      history,
    );
    const text = await askGemini(prompt);
    res.json({ text: text || "пустой ответ" });
  } catch (err) {
    console.error(err);
    const status = isQuotaError(err) ? 429 : isOverloaded(err) ? 503 : 500;
    const retryAfter = isQuotaError(err) ? 120 : isOverloaded(err) ? 90 : 0;
    res.status(status).json({
      error: friendlyApiError(err),
      retryAfter,
    });
  }
});

app.post("/api/sub", async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: "нет videoId" });
  }
  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    const cues = raw.map((item) => ({
      start: item.offset / 1000,
      end: (item.offset + item.duration) / 1000,
      text: item.text,
    }));
    cuesByVideo.set(videoId, cues);
    res.json({ cues, count: cues.length });
  } catch (err) {
    console.error(err);
    res.status(404).json({
      error: "субтитры недоступны для этого видео",
    });
  }
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
