# ديوانية الورق

ألعاب ورق أونلاين (تركس، تركس كمبلكس، طرنيب ٤١، طرنيب ٦١) مع بوتات ومحادثة صوتية.

- `src/server.js` — سيرفر Bun (HTTP + WebSocket + Postgres)
- `src/engine.js` — قوانين الألعاب والبوتات
- `public/index.html` — واجهة اللعبة
- `assets/` — الأصوات

تشغيل محلي: `bun src/server.js` ثم افتح http://localhost:3000
اختبار المحركات: `bun test_sim.js`
