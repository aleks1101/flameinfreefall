
const MODEL = "gemini-3.5-flash-lite";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  MODEL +
  ":generateContent";

const SYSTEM_PROMPT = `
You are Flame Intelligence AI, a scientific
educational assistant for the Flame in Freefall project.

Your topics include:
- Combustion in microgravity
- NASA FLEX experiments
- NASA BASS and BASS-II experiments
- Oxygen concentration
- Ventilation and airflow
- Gravity on Earth, Moon and Mars
- Spacecraft fire safety
- Flame behavior and extinguishment

Answer in the same language as the user:
Russian, English or Kazakh.

Explain scientific concepts clearly.
Never invent NASA experimental measurements.
Do not fabricate scientific citations.
Distinguish established science from
educational simulations and hypotheses.
Do not claim to have read files that
were not supplied to the API.
`;

function sendJSON(res, status, data) {
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  console.log("Chat request received:", req.method);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJSON(res, 405, {
      error: "Only POST requests are allowed"
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendJSON(res, 500, {
      error: "GEMINI_API_KEY is missing"
    });
  }

  const question =
    req.body?.question || req.body?.message;

  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 2000
  ) {
    return sendJSON(res, 400, {
      error: "Question must contain 1-2000 characters"
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  const started = Date.now();

  try {
    console.log("Starting Gemini request:", MODEL);

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: SYSTEM_PROMPT
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: question.trim()
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600
        }
      })
    });

    console.log(
      "Gemini HTTP:",
      response.status,
      "Duration:",
      Date.now() - started,
      "ms"
    );

    const data = await response.json();

    if (!response.ok) {
      const details =
        data.error?.message ||
        "Unknown Gemini API error";

      console.error(
        "Gemini API error:",
        response.status,
        details.slice(0, 300)
      );

      return sendJSON(res, 502, {
        error:
          response.status === 503
            ? "Gemini is temporarily unavailable"
            : response.status === 429
            ? "Gemini API quota or rate limit reached"
            : "Gemini API request failed",
        upstreamStatus: response.status
      });
    }

    const answer = data.candidates?.[0]
      ?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!answer) {
      return sendJSON(res, 502, {
        error: "Gemini returned an empty response"
      });
    }

    return sendJSON(res, 200, {
      answer,
      model: MODEL
    });

  } catch (error) {
    console.error(
      "Gemini request exception:",
      error?.name,
      error?.message
    );

    if (
      controller.signal.aborted ||
      error?.name === "AbortError"
    ) {
      return sendJSON(res, 504, {
        error: "Gemini did not respond within 20 seconds"
      });
    }

    return sendJSON(res, 500, {
      error: "Gemini request failed unexpectedly"
    });

  } finally {
    clearTimeout(timeout);
  }
}
