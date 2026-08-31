import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const VOICE_ID = "oO7sLA3dWfQXsKeSAjpA"; 

app.use(cors({
origin: "*",
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

/* =========================
STATUS
========================= */

app.get("/", (req, res) => {
res.json({
status: "online",
message: "Servidor da L.IA com Gemini + ElevenLabs está funcionando!",
services: {
gemini: !!GEMINI_API_KEY,
elevenlabs: !!ELEVENLABS_API_KEY
}
});
});

/* =========================
CHAT — GEMINI
========================= */

app.post("/api/chat", async (req, res) => {
try {

    const { message } = req.body;

    if (!message || typeof message !== "string") {
        return res.status(400).json({
            error: "Mensagem inválida."
        });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({
            error: "GEMINI_API_KEY não configurada no Render."
        });
    }

    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text:
                                    "Você é a L.IA, uma assistente virtual inteligente, amigável e natural. " +
                                    "Seu nome é L.IA. " +
                                    "Responda em português brasileiro quando o usuário falar português. " +
                                    "Seja clara, útil e objetiva.\n\n" +
                                    "Usuário:\n" +
                                    message
                            }
                        ]
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {

        console.error("Erro Gemini:", data);

        return res.status(response.status).json({
            error:
                data?.error?.message ||
                "Erro ao conectar com o Gemini."
        });
    }

    const reply =
        data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

    if (!reply) {
        return res.status(500).json({
            error: "O Gemini não retornou uma resposta."
        });
    }

    return res.json({
        reply
    });

} catch (error) {

    console.error("Erro /api/chat:", error);

    return res.status(500).json({
        error:
            error.message ||
            "Erro interno do servidor."
    });
}

});

/* =========================
VOZ — ELEVENLABS
========================= */

app.post("/api/speech", async (req, res) => {
try {

    const { text } = req.body;

    if (!text || typeof text !== "string") {
        return res.status(400).json({
            error: "Texto inválido."
        });
    }

    if (!ELEVENLABS_API_KEY) {
        return res.status(500).json({
            error:
                "ELEVENLABS_API_KEY não configurada no Render."
        });
    }

    const url =
        "https://api.elevenlabs.io/v1/text-to-speech/" +
        VOICE_ID +
        "?output_format=mp3_44100_128";

    const response = await fetch(url, {
        method: "POST",

        headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            text: text,

            model_id:
                "eleven_multilingual_v2",

            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0,
                use_speaker_boost: true
            }
        })
    });

    if (!response.ok) {

        const errorText =
            await response.text();

        console.error(
            "Erro ElevenLabs:",
            errorText
        );

        return res.status(response.status).json({
            error:
                "ElevenLabs: " +
                errorText
        });
    }

    const audio =
        await response.arrayBuffer();

    res.setHeader(
        "Content-Type",
        "audio/mpeg"
    );

    res.setHeader(
        "Content-Length",
        audio.byteLength
    );

    res.setHeader(
        "Cache-Control",
        "no-cache"
    );

    return res.send(
        Buffer.from(audio)
    );

} catch (error) {

    console.error(
        "Erro /api/speech:",
        error
    );

    return res.status(500).json({
        error:
            error.message ||
            "Erro interno ao gerar a voz."
    });
}

});

/* =========================
SERVIDOR
========================= */

app.listen(
PORT,
"0.0.0.0",
() => {

    console.log(
        `L.IA Server rodando na porta ${PORT}`
    );

    console.log(
        "Gemini:",
        GEMINI_API_KEY
            ? "OK"
            : "NÃO CONFIGURADO"
    );

    console.log(
        "ElevenLabs:",
        ELEVENLABS_API_KEY
            ? "OK"
            : "NÃO CONFIGURADO"
    );

    console.log(
        "Voice ID:",
        VOICE_ID
    );
}

);