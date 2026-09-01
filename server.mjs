import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const VOICE_ID = "oO7sLA3dWfQXsKeSAjpA";

/* ==========================================
   MODELOS GEMINI
========================================== */

const GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
];

const MAX_RETRIES = 3;

/* ==========================================
   CONFIGURAÇÃO
========================================== */

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({
    limit: "1mb"
}));

/* ==========================================
   FUNÇÃO DE ESPERA
========================================== */

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==========================================
   SYSTEM PROMPT
========================================== */

const SYSTEM_INSTRUCTION =
    "Você é a L.IA, uma assistente virtual inteligente, amigável e natural. " +
    "Seu nome é L.IA. " +
    "Responda em português brasileiro quando o usuário falar português. " +
    "Seja clara, útil e objetiva. " +
    "Não diga que você é o Gemini.";

/* ==========================================
   GEMINI STREAMING
========================================== */

async function chamarGeminiStreaming(message, res) {

    let ultimoErro = null;

    /*
     * Percorre os modelos.
     */
    for (
        let modelIndex = 0;
        modelIndex < GEMINI_MODELS.length;
        modelIndex++
    ) {

        const model = GEMINI_MODELS[modelIndex];

        /*
         * Tenta o modelo até 3 vezes.
         */
        for (
            let tentativa = 1;
            tentativa <= MAX_RETRIES;
            tentativa++
        ) {

            try {

                console.log(
                    `Gemini STREAM: ${model} | tentativa ${tentativa}/${MAX_RETRIES}`
                );

                /*
                 * Endpoint de STREAMING do Gemini.
                 */
                const url =
                    "https://generativelanguage.googleapis.com/v1beta/models/" +
                    model +
                    ":streamGenerateContent?alt=sse";

                const response = await fetch(
                    url,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": GEMINI_API_KEY
                        },

                        body: JSON.stringify({

                            systemInstruction: {
                                parts: [
                                    {
                                        text: SYSTEM_INSTRUCTION
                                    }
                                ]
                            },

                            contents: [
                                {
                                    role: "user",

                                    parts: [
                                        {
                                            text: message
                                        }
                                    ]
                                }
                            ]

                        })
                    }
                );

                /*
                 * Se a API retornou erro,
                 * ainda podemos tentar novamente/fallback.
                 */
                if (!response.ok) {

                    const data = await response.json().catch(
                        () => ({})
                    );

                    const mensagem =
                        data?.error?.message ||
                        `HTTP ${response.status}`;

                    ultimoErro = new Error(mensagem);

                    console.error(
                        `Gemini STREAM ${model}: HTTP ${response.status} - ${mensagem}`
                    );

                    /*
                     * Modelo não encontrado:
                     * pula para o próximo.
                     */
                    if (response.status === 404) {

                        console.log(
                            `Modelo ${model} indisponível. Indo para fallback.`
                        );

                        break;
                    }

                    const podeTentarNovamente =
                        response.status === 429 ||
                        response.status === 500 ||
                        response.status === 502 ||
                        response.status === 503 ||
                        response.status === 504;

                    if (!podeTentarNovamente) {
                        throw ultimoErro;
                    }

                } else {

                    /*
                     * ==========================================
                     * STREAM RECEBIDO
                     * ==========================================
                     */

                    if (!response.body) {

                        throw new Error(
                            "O Gemini não retornou um stream."
                        );

                    }

                    const reader =
                        response.body.getReader();

                    const decoder =
                        new TextDecoder("utf-8");

                    let buffer = "";
                    let recebeuTexto = false;

                    /*
                     * Lê o stream continuamente.
                     */
                    while (true) {

                        const {
                            value,
                            done
                        } = await reader.read();

                        if (done) {
                            break;
                        }

                        /*
                         * Converte os bytes em texto.
                         */
                        buffer += decoder.decode(
                            value,
                            {
                                stream: true
                            }
                        );

                        /*
                         * O Gemini envia eventos SSE.
                         */
                        const linhas =
                            buffer.split("\n");

                        /*
                         * Guarda a última linha incompleta
                         * para o próximo pedaço.
                         */
                        buffer =
                            linhas.pop() || "";

                        for (
                            const linha of linhas
                        ) {

                            const linhaLimpa =
                                linha.trim();

                            /*
                             * Ignora linhas vazias.
                             */
                            if (!linhaLimpa) {
                                continue;
                            }

                            /*
                             * SSE normalmente vem como:
                             *
                             * data: {...}
                             */
                            if (
                                !linhaLimpa.startsWith(
                                    "data:"
                                )
                            ) {
                                continue;
                            }

                            const jsonTexto =
                                linhaLimpa
                                    .slice(5)
                                    .trim();

                            if (
                                !jsonTexto ||
                                jsonTexto === "[DONE]"
                            ) {
                                continue;
                            }

                            try {

                                const data =
                                    JSON.parse(
                                        jsonTexto
                                    );

                                const partes =
                                    data
                                        ?.candidates?.[0]
                                        ?.content?.parts;

                                if (
                                    !Array.isArray(
                                        partes
                                    )
                                ) {
                                    continue;
                                }

                                for (
                                    const part of partes
                                ) {

                                    const texto =
                                        part?.text;

                                    if (
                                        !texto
                                    ) {
                                        continue;
                                    }

                                    recebeuTexto = true;

                                    /*
                                     * Envia imediatamente
                                     * para o aplicativo.
                                     */
                                    res.write(
                                        `data: ${JSON.stringify({
                                            text: texto
                                        })}\n\n`
                                    );

                                }

                            } catch (erroJSON) {

                                console.error(
                                    "Erro ao interpretar chunk Gemini:",
                                    erroJSON.message
                                );

                            }

                        }

                    }

                    /*
                     * Finaliza o stream.
                     */
                    if (recebeuTexto) {

                        console.log(
                            `Gemini STREAM respondeu usando ${model}`
                        );

                        res.write(
                            `data: ${JSON.stringify({
                                done: true
                            })}\n\n`
                        );

                        res.end();

                        return;
                    }

                    /*
                     * Stream terminou sem texto.
                     */
                    throw new Error(
                        "O Gemini encerrou o stream sem retornar texto."
                    );
                }

            } catch (error) {

                ultimoErro = error;

                console.error(
                    `Erro Gemini STREAM ${model}, tentativa ${tentativa}:`,
                    error.message
                );

            }

            /*
             * Espera antes de tentar novamente.
             */
            if (
                tentativa < MAX_RETRIES
            ) {

                const espera =
                    2000 * tentativa;

                console.log(
                    `Aguardando ${espera}ms antes de tentar novamente...`
                );

                await esperar(
                    espera
                );
            }

        }

        /*
         * Próximo modelo.
         */
        console.log(
            `Fallback STREAM: saindo de ${model}`
        );
    }

    /*
     * Todos falharam.
     */
    throw (
        ultimoErro ||
        new Error(
            "Todos os modelos Gemini falharam."
        )
    );
}

/* ==========================================
   STATUS
========================================== */

app.get("/", (req, res) => {

    res.json({

        status: "online",

        message:
            "Servidor da L.IA v1.0.2 com Gemini Streaming + ElevenLabs está funcionando!",

        services: {

            gemini:
                !!GEMINI_API_KEY,

            elevenlabs:
                !!ELEVENLABS_API_KEY

        },

        models:
            GEMINI_MODELS

    });

});

/* ==========================================
   CHAT — STREAMING
========================================== */

app.post("/api/chat", async (req, res) => {

    const {
        message
    } = req.body;

    if (
        !message ||
        typeof message !== "string"
    ) {

        return res.status(400).json({

            error:
                "Mensagem inválida."

        });

    }

    if (!GEMINI_API_KEY) {

        return res.status(500).json({

            error:
                "GEMINI_API_KEY não configurada no Render."

        });

    }

    /*
     * Configuração SSE.
     */
    res.status(200);

    res.setHeader(
        "Content-Type",
        "text/event-stream; charset=utf-8"
    );

    res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
    );

    res.setHeader(
        "Connection",
        "keep-alive"
    );

    res.setHeader(
        "X-Accel-Buffering",
        "no"
    );

    /*
     * Libera os headers imediatamente.
     */
    if (
        typeof res.flushHeaders === "function"
    ) {
        res.flushHeaders();
    }

    try {

        await chamarGeminiStreaming(
            message,
            res
        );

    } catch (error) {

        console.error(
            "Erro final /api/chat:",
            error
        );

        /*
         * Envia erro pelo próprio stream.
         */
        try {

            res.write(
                `data: ${JSON.stringify({
                    error:
                        "O Gemini está temporariamente indisponível. " +
                        "A L.IA tentou os modelos disponíveis, mas nenhum respondeu agora.",
                    details:
                        error.message
                })}\n\n`
            );

        } catch {}

        res.end();
    }

});

/* ==========================================
   ELEVENLABS
========================================== */

app.post("/api/speech", async (req, res) => {

    try {

        const {
            text
        } = req.body;

        if (
            !text ||
            typeof text !== "string"
        ) {

            return res.status(400).json({

                error:
                    "Texto inválido."

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

        const response =
            await fetch(
                url,
                {

                    method: "POST",

                    headers: {

                        "xi-api-key":
                            ELEVENLABS_API_KEY,

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        text,

                        model_id:
                            "eleven_multilingual_v2",

                        voice_settings: {

                            stability:
                                0.5,

                            similarity_boost:
                                0.75,

                            style:
                                0,

                            use_speaker_boost:
                                true

                        }

                    })

                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                "Erro ElevenLabs:",
                errorText
            );

            return res.status(
                response.status
            ).json({

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
                "Erro interno ao gerar voz."

        });

    }

});

/* ==========================================
   INICIAR SERVIDOR
========================================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `L.IA Server v1.0.2 rodando na porta ${PORT}`
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

        console.log(
            "Modelos:",
            GEMINI_MODELS.join(", ")
        );

    }
);