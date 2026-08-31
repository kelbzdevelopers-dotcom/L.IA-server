import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY =
process.env.GEMINI_API_KEY;

const ELEVENLABS_API_KEY =
process.env.ELEVENLABS_API_KEY;

const ELEVENLABS_VOICE_ID =
"c6bExSiHfx47LERqW2VK";

/* =========================
CONFIGURAÇÃO
========================= */

app.use(cors({
origin: "*",
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type"]
}));

app.use(express.json({
limit: "1mb"
}));

/* =========================
STATUS
========================= */

app.get("/", (req, res) => {

res.json({
    status: "online",
    message: "Servidor da L.IA com Gemini + ElevenLabs está funcionando!"
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


    const geminiResponse = await fetch(
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
                                    "Responda em português brasileiro sempre que o usuário falar português. " +
                                    "Seja útil, clara e não diga que você é o Gemini. " +
                                    "Seu nome é L.IA.\n\n" +
                                    "Mensagem do usuário:\n" +
                                    message
                            }
                        ]
                    }
                ]

            })
        }
    );


    const geminiData =
        await geminiResponse.json();


    if (!geminiResponse.ok) {

        console.error(
            "Erro Gemini:",
            geminiData
        );

        return res.status(
            geminiResponse.status
        ).json({

            error:
                geminiData?.error?.message ||
                "Erro ao conectar com o Gemini."

        });

    }


    const reply =
        geminiData
            ?.candidates?.[0]
            ?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();


    if (!reply) {

        return res.status(500).json({
            error:
                "O Gemini não retornou uma resposta."
        });

    }


    res.json({
        reply
    });


} catch (error) {

    console.error(
        "Erro interno /api/chat:",
        error
    );

    res.status(500).json({
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


    const elevenResponse =
        await fetch(

            "https://api.elevenlabs.io/v1/text-to-speech/" +
            ELEVENLABS_VOICE_ID +
            "?output_format=mp3_44100_128",

            {

                method: "POST",

                headers: {

                    "xi-api-key":
                        ELEVENLABS_API_KEY,

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify({

                    text: text,

                    model_id:
                        "eleven_multilingual_v2"

                })

            }

        );


    if (!elevenResponse.ok) {

        const errorText =
            await elevenResponse.text();

        console.error(
            "Erro ElevenLabs:",
            errorText
        );

        return res.status(
            elevenResponse.status
        ).json({

            error:
                "Erro da ElevenLabs: " +
                errorText

        });

    }


    const audioBuffer =
        await elevenResponse.arrayBuffer();


    res.setHeader(
        "Content-Type",
        "audio/mpeg"
    );

    res.setHeader(
        "Content-Length",
        audioBuffer.byteLength
    );

    res.setHeader(
        "Cache-Control",
        "no-cache"
    );


    res.send(
        Buffer.from(audioBuffer)
    );


} catch (error) {

    console.error(
        "Erro interno /api/speech:",
        error
    );

    res.status(500).json({

        error:
            error.message ||
            "Erro interno ao gerar voz."

    });

}

});

/* =========================
INICIAR SERVIDOR
========================= */

app.listen(
PORT,
"0.0.0.0",
() => {

    console.log(
        `L.IA Server rodando na porta ${PORT}`
    );

    console.log(
        "Gemini: " +
        (GEMINI_API_KEY
            ? "configurado"
            : "NÃO configurado")
    );

    console.log(
        "ElevenLabs: " +
        (ELEVENLABS_API_KEY
            ? "configurado"
            : "NÃO configurado")
    );

}

);