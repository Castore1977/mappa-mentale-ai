// File: /api/generate.js

export default async function handler(req, res) {
    // 1. Controlla che la richiesta sia di tipo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. Recupera la chiave API segreta dalle variabili d'ambiente di Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("La chiave API non è configurata sul server.");
        }

        const { text, query } = req.body;
        let modelResponse;

        // 3. Determina quale prompt usare (ricerca o analisi testo)
        if (query) {
            // Logica per la RICERCA WEB
            const prompt = `Fornisci un testo dettagliato e ben strutturato sull'argomento: "${query}". Il testo deve essere di alta qualità, accurato e adatto per essere trasformato in una mappa mentale complessa. Includi definizioni, concetti chiave, principi fondamentali, regole, esempi pratici e possibili applicazioni o implicazioni.`;
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`La ricerca per "${query}" non ha prodotto risultati.`);
            modelResponse = await response.json();

        } else if (text) {
            // Logica per l'ANALISI DEL TESTO
            const schema = { type: "OBJECT", properties: { centralTopic: { type: "STRING" }, mainBranches: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, subBranches: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title"] } } }, required: ["centralTopic", "mainBranches"] };
            const prompt = `Analizza il seguente testo e strutturalo in una gerarchia per una mappa mentale. Estrai il concetto centrale, 5-6 rami principali e per ognuno 2-4 sotto-rami molto concisi. Sii breve e vai dritto al punto. Testo: "${text}"`;
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

             const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Errore API (struttura): ${response.status}`);
            modelResponse = await response.json();

        } else {
            return res.status(400).json({ error: "Nessun testo o query fornita." });
        }

        // 4. Invia la risposta al frontend
        const responseText = modelResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            throw new Error("L'API di Gemini non ha restituito un contenuto valido.");
        }
        
        // Invia direttamente il testo JSON o il testo semplice
        res.status(200).send(responseText);

    } catch (error) {
        console.error("Errore nella funzione serverless:", error);
        res.status(500).json({ error: error.message });
    }
}