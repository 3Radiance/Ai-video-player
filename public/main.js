const form = document.getElementById("chats");
const inp = document.getElementById("input-chat");
const sendBtn = document.getElementById("chat-send");
const playBtn = document.getElementById("play-btn");
const cooldownEl = document.getElementById("chat-cooldown");
const list = document.getElementById("spisok");
const form_two = document.getElementById("form-two");
const inpe = document.getElementById("inpe");

const COOLDOWN_SEC = 90;
const MAX_HISTORY = 10;

let cues = [];
let currentVideoId = null;
let ytPlayer = null;
let chatHistory = [];
let cooldownLeft = 0;
let cooldownTimer = null;

function getVideoId(s) {
  const url = new URL(s);
  return url.searchParams.get("v");
}

function setChatLocked(locked) {
  inp.disabled = locked;
  sendBtn.disabled = locked;
}

function tickCooldown() {
  if (cooldownLeft <= 0) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    cooldownEl.hidden = true;
    setChatLocked(false);
    return;
  }
  cooldownEl.textContent = `Следующий вопрос через ${cooldownLeft} сек`;
}

function startCooldown(seconds = COOLDOWN_SEC) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownLeft = Math.max(seconds, COOLDOWN_SEC);
  cooldownEl.hidden = false;
  setChatLocked(true);
  tickCooldown();
  cooldownTimer = setInterval(() => {
    cooldownLeft--;
    tickCooldown();
  }, 1000);
}

function appendMessage(role, text) {
  const li = document.createElement("li");
  li.className = role === "user" ? "msg-user" : "msg-ai";
  const label = role === "user" ? "Ты" : "AI";
  li.textContent = `${label}: ${text}`;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
  return li;
}

function setPlayLoading(loading) {
  playBtn.disabled = loading;
  playBtn.textContent = loading ? "..." : "Play";
}

form_two.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = inpe.value;
  const id = getVideoId(value);
  if (!id) {
    alert("кривая ссылка");
    return;
  }

  currentVideoId = id;
  chatHistory = [];
  list.innerHTML = "";

  if (ytPlayer) {
    ytPlayer.loadVideoById(id);
  } else {
    ytPlayer = new YT.Player("vidosik", {
      videoId: id,
      width: 800,
      height: 450,
    });
  }
  inpe.value = "";

  setPlayLoading(true);
  try {
    const res = await fetch("/api/sub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "не удалось загрузить субтитры");
      return;
    }
    cues = data.cues;
    appendMessage("ai", `Видео загружено. Субтитров: ${cues.length}. Можешь спрашивать про ролик.`);
  } catch (err) {
    alert(err.message ?? err);
  } finally {
    setPlayLoading(false);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (cooldownLeft > 0) return;
  if (!ytPlayer) {
    alert("сначала открой видео");
    return;
  }
  if (!cues.length) {
    alert("субтитры ещё не загрузились — нажми Play и подожди");
    return;
  }

  const timestop = ytPlayer.getCurrentTime();
  const mes = inp.value.trim();
  if (!mes) return;

  startCooldown();
  appendMessage("user", mes);
  chatHistory.push({ role: "user", text: mes });
  inp.value = "";

  const thinking = appendMessage("ai", "думаю...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: mes,
        timestop,
        videoId: currentVideoId,
        history: chatHistory.slice(-MAX_HISTORY),
      }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok) {
      appendMessage("ai", `Ошибка: ${data.error ?? "чат недоступен"}`);
      if (data.retryAfter) startCooldown(data.retryAfter);
      return;
    }

    appendMessage("ai", data.text);
    chatHistory.push({ role: "ai", text: data.text });
    if (chatHistory.length > MAX_HISTORY * 2) {
      chatHistory = chatHistory.slice(-MAX_HISTORY * 2);
    }
  } catch (err) {
    thinking.remove();
    appendMessage("ai", `Ошибка: ${err.message ?? err}`);
  }
});
