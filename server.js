const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3456;
const DB_FILE = path.join(__dirname, "data.json");
const USE_KV = !!process.env.KV_REST_API_URL;

const IMAGES = [
  "2001.jpg",
  "Aliens.jpg",
  "BigTroubleInLittleChina.jpg",
  "BladeRunner.jpg",
  "Jaws.webp",
  "PinkPanther.jpg",
  "PrincessBride.jpg",
  "ReturnOfTheJedi.jpg",
];

const MAX_PER_IMAGE = 3;

async function loadData() {
  if (USE_KV) {
    const { kv } = require("@vercel/kv");
    const raw = await kv.hgetall("assignments");
    if (!raw) return {};
    const data = {};
    for (const [k, v] of Object.entries(raw)) {
      data[k] = typeof v === "string" ? JSON.parse(v) : v;
    }
    return data;
  }
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  return {};
}

async function addEntry(key, entry) {
  if (USE_KV) {
    const { kv } = require("@vercel/kv");
    await kv.hset("assignments", { [key]: JSON.stringify(entry) });
    return;
  }
  const data = await loadData();
  data[key] = entry;
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function resetData() {
  if (USE_KV) {
    const { kv } = require("@vercel/kv");
    await kv.del("assignments");
    return;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "public/images")));

app.get("/", async (req, res) => {
  const data = await loadData();
  const spotsLeft = MAX_PER_IMAGE * IMAGES.length - Object.keys(data).length;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plakatu</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; background: #111111; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .container { text-align: center; max-width: 500px; padding: 2rem; }
    form { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
    input[type="text"] { flex: 1; padding: 0.75rem 1rem; border: 2px solid #333; background: #1a1a1a; color: #e0e0e0; font-size: 1rem; outline: none; transition: border-color 0.2s; font-family: inherit; }
    input[type="text"]:focus { border-color: #555555; }
    button { padding: 0.75rem 1.5rem; background: #555555; color: white; border: none; font-size: 1rem; cursor: pointer; transition: background 0.2s; font-family: inherit; }
    button:hover { background: #444444; }
    .spots { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .gallery-link { color: #999; text-decoration: none; font-size: 0.9rem; }
    .gallery-link:hover { color: #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <form action="/assign" method="POST">
      <input type="text" name="name" placeholder="Your name" required maxlength="50" autofocus>
      <button type="submit">Go</button>
    </form>
    <p class="spots">${spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} remaining` : "All spots taken!"}</p>
    <a href="/gallery" class="gallery-link">View the gallery &rarr;</a>
  </div>
</body>
</html>`);
});

app.post("/assign", async (req, res) => {
  const rawName = (req.body.name || "").trim();
  if (!rawName) return res.redirect("/");

  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const key = name.toLowerCase();
  const data = await loadData();

  if (data[key]) {
    return res.redirect(`/poster/${encodeURIComponent(key)}`);
  }

  const counts = {};
  IMAGES.forEach((img) => (counts[img] = 0));
  Object.values(data).forEach((entry) => counts[entry.image]++);

  const available = IMAGES.filter((img) => counts[img] < MAX_PER_IMAGE);
  if (available.length === 0) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plakatu - Full</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; background: #111111; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #e0e0e0; margin-bottom: 1rem; }
    a { color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>All Posters Claimed!</h1>
    <p>All 24 spots have been taken.</p>
    <p style="margin-top:1rem"><a href="/">Back</a> &middot; <a href="/gallery">Gallery</a></p>
  </div>
</body>
</html>`);
  }

  const image = available[Math.floor(Math.random() * available.length)];
  await addEntry(key, { name, image });

  res.redirect(`/poster/${encodeURIComponent(key)}`);
});

app.get("/poster/:key", async (req, res) => {
  const data = await loadData();
  const entry = data[req.params.key];

  if (!entry) return res.redirect("/");

  const title = entry.image.replace(/\.(jpg|webp|png)$/, "").replace(/([A-Z])/g, " $1").trim();

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; background: #111111; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
    h1 { color: #e0e0e0; margin-bottom: 1.5rem; font-size: 1.5rem; font-weight: 500; letter-spacing: 0.05em; }
    img { max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .links { margin-top: 1.5rem; }
    a { color: #999; text-decoration: none; margin: 0 0.75rem; }
    a:hover { color: #e0e0e0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <img src="/images/${entry.image}" alt="${title}">
  <div class="links">
    <a href="/">&larr; Home</a>
    <a href="/gallery">Gallery &rarr;</a>
  </div>
</body>
</html>`);
});

app.get("/gallery", async (req, res) => {
  const data = await loadData();

  const imageNames = {};
  IMAGES.forEach((img) => (imageNames[img] = []));
  Object.values(data).forEach((entry) => imageNames[entry.image].push(entry.name));

  const cards = IMAGES.map((img) => {
    const title = img.replace(/\.(jpg|webp|png)$/, "").replace(/([A-Z])/g, " $1").trim();
    const names = imageNames[img];
    const nameSlots = Array.from({ length: MAX_PER_IMAGE }, (_, i) =>
      names[i] ? `<span class="name filled">${names[i]}</span>` : `<span class="name empty">???</span>`
    ).join("");

    return `
      <div class="card">
        <img src="/images/${img}" alt="${title}">
        <h3>${title}</h3>
        <div class="names">${nameSlots}</div>
      </div>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plakatu - Gallery</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; background: #111111; color: #e0e0e0; min-height: 100vh; padding: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; max-width: 1100px; margin: 0 auto; }
    .card { background: #1a1a1a; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
    .card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; }
    .card h3 { padding: 0.75rem 1rem 0.25rem; color: #e0e0e0; font-size: 0.95rem; font-weight: 500; }
    .names { padding: 0.25rem 1rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .name { font-size: 0.85rem; }
    .name.filled { color: #aaa; }
    .name.empty { color: #333; }
    .back { display: block; text-align: center; margin-top: 2rem; color: #999; text-decoration: none; }
    .back:hover { color: #e0e0e0; }
  </style>
</head>
<body>
  <div class="grid">${cards}</div>
  <a href="/" class="back">&larr; Back to home</a>
</body>
</html>`);
});

app.get("/admin", async (req, res) => {
  const data = await loadData();
  const total = Object.keys(data).length;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plakatu - Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; background: #111111; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { color: #e0e0e0; margin-bottom: 0.5rem; letter-spacing: 0.1em; }
    .count { color: #666; margin-bottom: 2rem; }
    form button { padding: 0.75rem 2rem; background: #555555; color: white; border: none; font-size: 1rem; cursor: pointer; transition: background 0.2s; font-family: inherit; }
    form button:hover { background: #444444; }
    .links { margin-top: 1.5rem; }
    a { color: #999; text-decoration: none; margin: 0 0.75rem; font-size: 0.9rem; }
    a:hover { color: #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ADMIN</h1>
    <p class="count">${total} name${total === 1 ? "" : "s"} assigned</p>
    <form action="/admin/reset" method="POST">
      <button type="submit">Reset the Slate</button>
    </form>
    <div class="links">
      <a href="/">&larr; Home</a>
      <a href="/gallery">Gallery</a>
    </div>
  </div>
</body>
</html>`);
});

app.post("/admin/reset", async (req, res) => {
  await resetData();
  res.redirect("/admin");
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Plakatu running at http://localhost:${PORT}`);
  });
}

module.exports = app;
