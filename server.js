import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OUTPUT_DIR = path.join(process.cwd(), "videos");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Função NOVA — pega imagens direto do HTML da Shopee (SEM bloqueio)
async function fetchShopeeImages(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept": "text/html"
      }
    });

    const html = await resp.text();

    // extrai bloco "images": [...]
    const match = html.match(/"images":\s*\[(.*?)\]/s);
    if (!match) {
      console.log("❌ Não achou images[] no HTML");
      return null;
    }

    const raw = match[1]
      .replace(/"/g, "")
      .split(",")
      .map(x => x.trim());

    const imagens = raw.map(
      h => `https://down-br.img.susercontent.com/file/${h}`
    );

    return imagens;

  } catch (err) {
    console.error("❌ Erro no scraper Shopee:", err);
    return null;
  }
}

async function downloadImage(url, filepath) {
  const resp = await fetch(url);
  const buffer = await resp.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
}

app.post("/api/generate", async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url) return res.json({ ok: false, message: "URL obrigatória" });

    const imageUrls = await fetchShopeeImages(url);

    if (!imageUrls || imageUrls.length === 0) {
      return res.json({
        ok: false,
        message: "Não foi possível obter as imagens."
      });
    }

    const id = Date.now().toString();
    const tempDir = path.join(process.cwd(), "temp", id);
    fs.mkdirSync(tempDir, { recursive: true });

    const imgPaths = [];

    for (let i = 0; i < Math.min(3, imageUrls.length); i++) {
      const imgPath = path.join(tempDir, `img${i}.jpg`);
      await downloadImage(imageUrls[i], imgPath);
      imgPaths.push(imgPath);
    }

    const listFile = path.join(tempDir, "list.txt");
    fs.writeFileSync(
      listFile,
      imgPaths.map(p => `file '${p}'\nduration 2`).join("\n")
    );

    const outputFile = path.join(OUTPUT_DIR, `${id}.mp4`);

    const ffmpegArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      outputFile
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.stderr.on("data", d => console.log("[FFMPEG]", d.toString()));

    ffmpeg.on("close", code => {
      if (code !== 0) {
        return res.json({ ok: false, message: "Erro ao gerar vídeo" });
      }

      return res.json({
        ok: true,
        downloadUrl: `/videos/${id}.mp4`
      });
    });

  } catch (err) {
    console.error("Erro interno:", err);
    return res.json({ ok: false, message: "Erro interno" });
  }
});

app.use("/videos", express.static("./videos"));
app.listen(3000, () =>
  console.log("🔥 API rodando com scraper Shopee (ESM puro)!")
);
