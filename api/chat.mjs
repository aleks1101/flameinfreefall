
const MODEL = "gemini-3.5-flash-lite";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  MODEL + ":generateContent";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing"
    });
  }

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

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `
You are Flame Intelligence AI,
an educational scientific assistant
for the Flame in Freefall project.

Your topics:
- Microgravity combustion
- NASA FLEX experiment
- NASA BASS and BASS-II
- Oxygen concentration
- Ventilation and airflow
- Spacecraft fire safety
- Gravity on Earth, Moon and Mars

Answer in Russian, English or Kazakh,
matching the user's language.

Explain science clearly.
Never invent NASA measurements or citations.
Distinguish verified science from simulations.
`
          }]
        },
        contents: [{
          role: "user",
          parts: [{ text: question.trim() }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Gemini API request failed",
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
      return res.status(502).json({
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Gemini did not respond within 20 seconds"
      });
    }

    console.error("Gemini error:", error);

    return res.status(500).json({
      error: "Server error"
    });

  } finally {
    clearTimeout(timeout);
  }
}
