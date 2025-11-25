const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// pasta para salvar os vídeos temporários
const OUTPUT_DIR = path.join(__dirname, "videos");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// serve vídeos gerados
app.use("/videos", express.static(OUTPUT_DIR));

app.get("/", (req, res) => {
  res.send("Videx Maker API rodando ✅");
});

// 🔥 Rota de geração REAL de vídeo
app.post("/api/generate", async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url) {
      return res.json({ ok: false, message: "URL da Shopee obrigatória." });
    }

    // por enquanto, ignoramos o conteúdo do produto
    // e usamos um set fixo de imagens (que você pode trocar depois)
    // exemplo de imagens: /app/assets/produto1.jpg, produto2.jpg, etc
    const imagesDir = path.join(__dirname, "assets");
    const images = [
      path.join(imagesDir, "img1.jpg"),
      path.join(imagesDir, "img2.jpg"),
      path.join(imagesDir, "img3.jpg"),
    ];

    // checa se as imagens existem
    const allExist = images.every((p) => fs.existsSync(p));
    if (!allExist) {
      return res.json({
        ok: false,
        message:
          "Imagens de exemplo não encontradas. Crie a pasta /backend/assets com img1.jpg, img2.jpg, img3.jpg.",
      });
    }

    // arquivo de saída
    const id = Date.now().toString();
    const outputFile = path.join(OUTPUT_DIR, `${id}.mp4`);

    // 🎬 Comando FFMPEG simples:
    // - cria um slideshow: cada imagem 2s
    // - resolução 1080x1920
    // - codifica em H.264
    //
    // OBS: isso aqui é um exemplo simples. Depois dá pra adicionar
    // zoom, texto, música, transição, etc.
    //
    // Montamos um "concat" de imagens internamente:
    const inputListPath = path.join(OUTPUT_DIR, `${id}.txt`);
    const listLines = images
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'\nduration 2`)
      .join("\n");
    fs.writeFileSync(inputListPath, listLines, "utf-8");

    const ffmpegArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      inputListPath,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputFile,
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.stderr.on("data", (data) => {
      console.log("[FFMPEG]", data.toString());
    });

    ffmpeg.on("close", (code) => {
      fs.unlink(inputListPath, () => {});
      if (code !== 0) {
        console.error("FFMPEG saiu com código", code);
        return res.status(500).json({
          ok: false,
          message: "Erro ao gerar vídeo com FFMPEG.",
        });
      }

      const publicUrl = `/videos/${id}.mp4`;

      return res.json({
        ok: true,
        message: "Vídeo gerado com sucesso.",
        downloadUrl: publicUrl,
      });
    });
  } catch (err) {
    console.error("Erro /api/generate:", err);
    return res.status(500).json({
      ok: false,
      message: "Erro interno ao gerar vídeo.",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Videx Maker API ouvindo em http://localhost:${PORT}`)
);
