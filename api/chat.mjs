
const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const SYSTEM_PROMPT = `
You are Flame Intelligence, a scientific AI assistant
for the Flame in Freefall educational project.

Your topics:
- Combustion in microgravity
- NASA FLEX experiments
- NASA BASS and BASS-II experiments
- Oxygen concentration
- Ventilation and airflow
- Spacecraft fire safety
- Gravity on Earth, Moon and Mars

Answer in the user's language:
Russian, English or Kazakh.

Explain science clearly.
Do not invent NASA experimental data or citations.
Distinguish scientific evidence from simulations.
Do not claim to have read files not supplied to you.
`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured"
    });
  }

  try {
    const question = req.body?.question;

    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 2000
    ) {
      return res.status(400).json({
        error: "Invalid question"
      });
    }

    // Discover available text-generation models.
    const modelsResponse = await fetch(
      API_BASE + "/models?pageSize=100",
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY
        }
      }
    );

    if (!modelsResponse.ok) {
      return res.status(502).json({
        error: "Could not retrieve Gemini models",
        upstreamStatus: modelsResponse.status
      });
    }

    const modelsData = await modelsResponse.json();

    const models = (modelsData.models || []).filter(
      model =>
        model.supportedGenerationMethods
          ?.includes("generateContent") &&
        /^models\/gemini-/i.test(model.name) &&
        /flash/i.test(model.name) &&
        !/image|tts|live|embedding/i.test(model.name)
    );

    models.sort((a, b) => {
      const version = name => {
        const match = name.match(
          /gemini-(\d+)(?:\.(\d+))?/
        );

        return match
          ? Number(match[1]) * 100 +
            Number(match[2] || 0)
          : 0;
      };

      return version(b.name) - version(a.name);
    });

    const model = models[0]?.name;

    if (!model) {
      return res.status(502).json({
        error: "No Gemini Flash model available"
      });
    }

    const response = await fetch(
      API_BASE + "/" + model + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [{
            role: "user",
            parts: [{ text: question.trim() }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 700
          }
        })
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Gemini API request failed",
        upstreamStatus: response.status
      });
    }

    const data = await response.json();

    const answer = data.candidates?.[0]
      ?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!answer) {
      return res.status(502).json({
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      answer,
      model
    });

  } catch (error) {
    console.error("Chat error:", error);

    return res.status(500).json({
      error: "Unable to process request"
    });
  }
}
