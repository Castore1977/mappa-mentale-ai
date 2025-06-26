// File: /api/generate.js (Versione FINALE con Errori Dettagliati)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("La chiave API non è configurata correttamente sul server (variabile d'ambiente mancante).");
        }

        const { text, query } = req.body;
        let modelResponse;
        let apiUrl;
        let payload;

        // Ho unificato il modello a gemini-1.5-flash per coerenza
        const model = "gemini-1.5-flash";
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        if (query) {
            const prompt = `Fornisci un testo dettagliato e ben strutturato sull'argomento: "${query}". Il testo deve essere di alta qualità, accurato e adatto per essere trasformato in una mappa mentale complessa. Includi definizioni, concetti chiave, principi fondamentali, regole, esempi pratici e possibili applicazioni o implicazioni.`;
            payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        } else if (text) {
            const schema = { type: "OBJECT", properties: { centralTopic: { type: "STRING" }, mainBranches: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, subBranches: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title"] } } }, required: ["centralTopic", "mainBranches"] };
            const prompt = `Analizza il seguente testo e strutturalo in una gerarchia per una mappa mentale. Estrai il concetto centrale, 5-6 rami principali e per ognuno 2-4 sotto-rami molto concisi. Sii breve e vai dritto al punto. Testo: "${text}"`;
            payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
        } else {
            return res.status(400).json({ error: "Nessun testo o query fornita." });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // --- GESTIONE ERRORI DETTAGLIATA ---
        if (!response.ok) {
            // Leggiamo il corpo dell'errore restituito da Google
            const errorDetails = await response.json();
            // Lo stampiamo nei log di Vercel per poterlo vedere
            console.error('Dettagli errore da Google:', JSON.stringify(errorDetails, null, 2));
            // Prepariamo un messaggio di errore chiaro per il frontend
            const errorMessage = errorDetails?.error?.message || "L'API di Google ha restituito un errore sconosciuto.";
            throw new Error(`Errore da Google: ${errorMessage}`);
        }
        // --- FINE GESTIONE ERRORI ---

        modelResponse = await response.json();
        
        const responseText = modelResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            console.error("Risposta da Google senza contenuto:", JSON.stringify(modelResponse, null, 2));
            throw new Error("L'API di Gemini ha restituito una risposta vuota, forse a causa dei filtri di sicurezza.");
        }
        
        res.status(200).send(responseText);

    } catch (error) {
        console.error("ERRORE FINALE NELLA FUNZIONE:", error);
        res.status(500).json({ error: error.message });
    }
}