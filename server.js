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

// Pasta onde os vídeos gerados serão salvos
const OUTPUT_DIR = path.join(process.cwd(), "videos");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// URL do Worker Cloudflare (já com seu endereço)
const WORKER_URL = "https://achados.rdgtsg966.workers.dev/";

// Função que chama o Worker para pegar imagens da Shopee
async function fetchImagesViaWorker(productUrl) {
  try {
    const base = WORKER_URL.replace(/\/+$/, ""); // remove barra extra no final
    const scrapeURL = `${base}?url=${encodeURIComponent(productUrl)}`;

    const resp = await fetch(scrapeURL, {
      headers: {
        "User-Agent": "VidexMaker-Backend/1.0"
      }
    });

    if (!resp.ok) {
      console.error("Resposta não OK do Worker:", resp.status);
      return null;
    }

    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.images) || data.images.length === 0) {
      console.error("Worker não retornou imagens válidas:", data);
      return null;
    }

    // retorna as URLs das imagens e, se tiver, o título
    return {
      images: data.images,
      title: data.title || "Produto Shopee"
    };
  } catch (err) {
    console.error("Erro ao chamar Worker:", err);
    return null;
  }
}

// Baixa uma imagem e salva em disco
async function downloadImage(url, filepath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar imagem: ${url}`);
  const buffer = await resp.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
}

// Rota principal de geração de vídeo
app.post("/api/generate", async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url) {
      return res.json({ ok: false, message: "URL obrigatória" });
    }

    console.log("👉 Gerando vídeo para:", url);

    // 1) Buscar imagens via Worker
    const info = await fetchImagesViaWorker(url);

    if (!info || !info.images || info.images.length === 0) {
      return res.json({
        ok: false,
        message: "Não foi possível obter as imagens (Worker não retornou nada)."
      });
    }

    const imageUrls = info.images;

    // 2) Preparar diretório temporário
    const id = Date.now().toString();
    const tempDir = path.join(process.cwd(), "temp", id);
    fs.mkdirSync(tempDir, { recursive: true });

    // 3) Baixar até 3 imagens
    const imgPaths = [];
    for (let i = 0; i < Math.min(3, imageUrls.length); i++) {
      const imgPath = path.join(tempDir, `img${i}.jpg`);
      await downloadImage(imageUrls[i], imgPath);
      imgPaths.push(imgPath);
    }

    if (imgPaths.length === 0) {
      return res.json({
        ok: false,
        message: "Nenhuma imagem foi baixada com sucesso."
      });
    }

    // 4) Criar arquivo de lista para o FFMPEG (slideshow simples)
    const listFile = path.join(tempDir, "list.txt");
    fs.writeFileSync(
      listFile,
      imgPaths
        .map(p => `file '${p.replace(/'/g, "'\\''")}'\nduration 2`)
        .join("\n"),
      "utf-8"
    );

    // 5) Arquivo final de saída
    const outputFile = path.join(OUTPUT_DIR, `${id}.mp4`);

    // 6) Comando FFMPEG (vídeo 1080x1920, sem áudio ainda)
    const ffmpegArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease," +
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      outputFile
    ];

    console.log("🎬 Rodando FFMPEG...");
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.stderr.on("data", d => console.log("[FFMPEG]", d.toString()));

    ffmpeg.on("close", code => {
      if (code !== 0) {
        console.error("FFMPEG saiu com código", code);
        return res.json({ ok: false, message: "Erro ao gerar vídeo" });
      }

      console.log("✅ Vídeo gerado:", outputFile);
      return res.json({
        ok: true,
        downloadUrl: `/videos/${id}.mp4`,
        title: info.title || "Vídeo gerado"
      });
    });
  } catch (err) {
    console.error("Erro interno /api/generate:", err);
    return res.json({ ok: false, message: "Erro interno" });
  }
});

// Servir os vídeos gerados
app.use("/videos", express.static("./videos"));

// Rota simples de status
app.get("/", (req, res) => {
  res.send("Videx Maker API integrada ao Worker ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🔥 API rodando na porta ${PORT} com Worker Cloudflare`)
);
