# AI Video Player

Плеер «как YouTube», но с чатом: вставляешь ссылку, смотришь ролик, спрашиваешь ИИ про то, что происходит на текущем таймкоде (субтитры — как подсказка, не как единственный источник правды).

> **Дисклеймер:** проект сделан **из скуки**, без претензий на продакшен. Большую часть кода помогала писать **ИИ** — поэтому тут вполне могут быть косяки, странные баги и «а зачем так». Если что-то сломалось — не удивляйся.

---

## RU — как запустить

1. Клонируй / открой папку, установи зависимости:

```bash
npm install
```

2. Создай `.env` (можно скопировать `.env.example`):

```env
GEMINI_API_KEY=твой_ключ_из_Google_AI_Studio
GEMINI_MODEL=gemini-1.5-flash
```

Ключ: https://aistudio.google.com/apikey

3. Запуск:

```bash
npm start
```

4. Открой http://localhost:3000 → вставь ссылку YouTube → **Play** → пиши в чат.

Между сообщениями — пауза **90 сек**. При 503/429 сервер сам продлит ожидание; Google free tier часто лагает независимо от твоего таймера.

---

## RU — стек

- Node.js + Express  
- Фронт: HTML / CSS / JS  
- YouTube IFrame Player API  
- Субтитры: `youtube-transcript`  
- ИИ: Google Gemini (`@google/genai`)

---

## EN — what is this

A weekend-style **AI video sidekick**: paste a YouTube URL, watch in an embedded player, chat with Gemini about what’s going on around the current timestamp. Subtitles are context hints, not a script to quote verbatim.

> **Disclaimer:** built **for fun**, not for production. **AI-assisted** development — expect quirks, bugs, and questionable life choices in the codebase.

---

## EN — quick start

```bash
npm install
cp .env.example .env   # add GEMINI_API_KEY
npm start
```

Open http://localhost:3000

---

## EN — stack

Node, Express, vanilla frontend, YouTube IFrame API, `youtube-transcript`, Gemini API.

---

## License

ISC — do whatever, no warranties, good luck.
