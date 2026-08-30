import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Servidor da L.IA com Gemini está funcionando!"
    });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                error: "Mensagem vazia."
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
                            parts: [
                                {
                                    text:
                                        "Você é L.IA, uma assistente virtual amigável. " +
                                        "Responda sempre em português brasileiro.\n\n" +
                                        "Usuário: " + message
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
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
            return res.status(500).json({
                error: "O Gemini não retornou uma resposta."
            });
        }

        res.json({
            reply
        });

    } catch (error) {
        console.error("Erro no servidor:", error);

        res.status(500).json({
            error: error.message ||
                "Erro interno do servidor."
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `L.IA Server rodando na porta ${PORT}`
    );
});
