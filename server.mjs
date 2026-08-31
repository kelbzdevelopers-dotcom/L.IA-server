import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const VOICE_ID = "oO7sLA3dWfQXsKeSAjpA";

/*

* Modelos usados pelo sistema.
* 
* O primeiro é o principal.
* Os seguintes são fallback.
  */
  const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite"
  ];

/*

* Quantidade máxima de tentativas por modelo.
  */
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

return new Promise(
    resolve => setTimeout(resolve, ms)
);

}

/* ==========================================
GEMINI
3 TENTATIVAS + FALLBACK
========================================== */

async function chamarGemini(message) {

let ultimoErro = null;


/*
 * Percorre os modelos.
 */
for (
    let modelIndex = 0;
    modelIndex < GEMINI_MODELS.length;
    modelIndex++
) {

    const model =
        GEMINI_MODELS[modelIndex];


    /*
     * Tenta o mesmo modelo até 3 vezes.
     */
    for (
        let tentativa = 1;
        tentativa <= MAX_RETRIES;
        tentativa++
    ) {

        try {

            console.log(
                `Gemini: ${model} | tentativa ${tentativa}/${MAX_RETRIES}`
            );


            const url =
                "https://generativelanguage.googleapis.com/v1beta/models/" +
                model +
                ":generateContent";


            const response =
                await fetch(
                    url,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "x-goog-api-key":
                                GEMINI_API_KEY
                        },

                        body: JSON.stringify({

                            systemInstruction: {

                                parts: [

                                    {
                                        text:
                                            "Você é a L.IA, uma assistente virtual inteligente, amigável e natural. " +
                                            "Seu nome é L.IA. " +
                                            "Responda em português brasileiro quando o usuário falar português. " +
                                            "Seja clara, útil e objetiva. " +
                                            "Não diga que você é o Gemini."
                                    }

                                ]

                            },

                            contents: [

                                {

                                    role: "user",

                                    parts: [

                                        {
                                            text:
                                                message
                                        }

                                    ]

                                }

                            ]

                        })
                    }
                );


            const data =
                await response.json();


            /*
             * SUCESSO
             */
            if (response.ok) {

                const reply =
                    data
                        ?.candidates?.[0]
                        ?.content?.parts
                        ?.map(
                            part =>
                                part.text || ""
                        )
                        .join("")
                        .trim();


                if (reply) {

                    console.log(
                        `Gemini respondeu usando ${model}`
                    );

                    return reply;

                }


                /*
                 * Resposta HTTP 200,
                 * mas sem texto.
                 */
                ultimoErro =
                    new Error(
                        "O Gemini não retornou texto."
                    );

            }


            /*
             * ERRO DA API
             */
            else {

                const mensagem =
                    data
                        ?.error
                        ?.message ||
                    `HTTP ${response.status}`;


                ultimoErro =
                    new Error(
                        mensagem
                    );


                console.error(
                    `Gemini ${model}: HTTP ${response.status} - ${mensagem}`
                );


                /*
                 * Erros que normalmente
                 * não são resolvidos
                 * repetindo imediatamente.
                 *
                 * 503 = servidor ocupado
                 * 429 = limite/quota
                 */
                const podeTentarNovamente =
                    response.status === 503 ||
                    response.status === 429 ||
                    response.status === 500 ||
                    response.status === 502 ||
                    response.status === 504;


                /*
                 * Se for erro de modelo,
                 * pula direto para o fallback.
                 */
                const modeloIndisponivel =
                    response.status === 404;


                if (modeloIndisponivel) {

                    console.log(
                        `Modelo ${model} indisponível. Indo para fallback.`
                    );

                    break;

                }


                if (!podeTentarNovamente) {

                    throw ultimoErro;

                }

            }


        } catch (error) {

            ultimoErro =
                error;


            console.error(
                `Erro Gemini ${model}, tentativa ${tentativa}:`,
                error.message
            );

        }


        /*
         * Se ainda não chegou à última
         * tentativa, espera antes de tentar novamente.
         *
         * 1ª espera: 2 segundos
         * 2ª espera: 4 segundos
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
     * Se falhou nas 3 tentativas,
     * passa para o próximo modelo.
     */
    console.log(
        `Fallback: saindo de ${model}`
    );

}


/*
 * Todos os modelos falharam.
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
        "Servidor da L.IA com Gemini + ElevenLabs está funcionando!",

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
CHAT
========================================== */

app.post("/api/chat", async (req, res) => {

try {

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


    const reply =
        await chamarGemini(
            message
        );


    return res.json({

        reply

    });


} catch (error) {

    console.error(
        "Erro final /api/chat:",
        error
    );


    return res.status(503).json({

        error:
            "O Gemini está temporariamente indisponível. " +
            "A L.IA tentou os modelos disponíveis, mas nenhum respondeu agora. " +
            "Tente novamente em alguns segundos.",

        details:
            error.message

    });

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


    console.log(
        "Modelos:",
        GEMINI_MODELS.join(
            ", "
        )
    );

}

);