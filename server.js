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

// função puxa imagens da Shopee
async function fetchShopeeImages(url) {
  try {
    // extrai itemid e shopid do link
    const match = url.match(/i\.(\\d+)\.(\\d+)/);
    if (!match) return null;

    const shopid = match[1];
    const itemid = match[2];

    const apiURL = `https://shopee.com.br/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`;
    
    const resp = await fetch(apiURL, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const data = await resp.json();
    if (!data?.data?.images) return null;

    // as imagens vêm em formato "hash", exemplo: 123abc456
    const hashes = data.data.images;

    // monta os links reais das imagens em HD:
    const imageUrls = hashes.map(
      h => `https://down-br.img.susercontent.com/file/${h}`
    );

    return imageUrls;
  } catch (err) {
    console.error("Erro Shopee:", err);
    return null;
  }
}

// baixa uma imagem e retorna caminho local
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
      return res.json({ ok: false, message: "Não foi possível obter as imagens." });
    }

    // baixa as 3 primeiras imagens
    const id = Date.now().toString();
    const tempDir = path.join(process.cwd(), "temp", id);
    fs.mkdirSync(tempDir, { recursive: true });

    const imgPaths = [];

    for (let i = 0; i < Math.min(3, imageUrls.length); i++) {
      const imgPath = path.join(tempDir, `img${i}.jpg`);
      await downloadImage(imageUrls[i], imgPath);
      imgPaths.push(imgPath);
    }

    // monta arquivo de concat
    const listFile = path.join(tempDir, "list.txt");
    fs.writeFileSync(
      listFile,
      imgPaths
        .map(p => `file '${p}'\nduration 2`)
        .join("\n")
    );

    // arquivo final
    const outputFile = path.join(OUTPUT_DIR, `${id}.mp4`);

    const ffmpegArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
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
    return res.json({ ok: false, message: "Erro interno" });
  }
});

app.use("/videos", express.static("./videos"));
app.listen(3000, () => console.log("API rodando com Shopee Images!"));
