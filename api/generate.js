// Per far funzionare questo codice su Vercel, è necessario creare un file
// `package.json` nella cartella principale del progetto eseguendo `npm init -y`
// e poi installare la dipendenza con `npm i @google/generative-ai`.

import { GoogleGenerativeAI } from "@google/generative-ai";

// La funzione handler è il punto di ingresso per la Serverless Function di Vercel.
// Riceve la richiesta (req) dal frontend e l'oggetto risposta (res) da popolare.
export default async function handler(req, res) {
  // Per sicurezza, accettiamo solo richieste di tipo POST.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Recuperiamo la chiave API segreta dalle variabili d'ambiente di Vercel.
  // Questa chiave NON è visibile nel codice del frontend.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("La variabile d'ambiente GEMINI_API_KEY non è impostata.");
    return res.status(500).json({ error: "La chiave API non è stata configurata correttamente sul server." });
  }

  // Inizializziamo il client dell'API di Google.
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

  try {
    // Estraiamo i dati inviati dal corpo della richiesta del frontend.
    const { promptType, text, concepts, graphics } = req.body;

    let prompt;
    let isJsonResponse = false;
    
    // Costruiamo il prompt specifico per l'IA in base all'azione richiesta dal frontend.
    switch (promptType) {
      case 'summarize':
        prompt = `Fornisci un riassunto conciso e ben strutturato del seguente testo, mantenendo i punti chiave e le relazioni logiche. Il riassunto deve essere ideale per essere poi trasformato in una mappa concettuale. Testo:\n\n${text}`;
        break;
      
      case 'search':
        prompt = `Fornisci un testo completo e ben strutturato sull'argomento: "${text}". Il testo deve essere abbastanza dettagliato da poterci creare una mappa concettuale approfondita. Spiega i concetti principali, le definizioni, gli esempi e le eventuali connessioni con altri argomenti.`;
        break;

      case 'generateMap':
        isJsonResponse = true; // Indichiamo che ci aspettiamo una risposta JSON dall'IA.
        prompt = `Analizza il seguente testo e crea una struttura per una mappa concettuale in formato JSON. Inoltre, genera del codice CSS per personalizzare lo stile della mappa in base alle istruzioni grafiche fornite.

        Testo da analizzare:
        ---
        ${text}
        ---
        `;

        if (concepts) {
            prompt += `\nIstruzioni sui concetti: Dai particolare importanza e, se possibile, crea rami principali per i seguenti concetti: "${concepts}".\n`;
        }

        if (graphics) {
             prompt += `\nIstruzioni grafiche: Applica le seguenti regole di stile: "${graphics}". Genera codice CSS valido che possa essere applicato a classi come .central-topic, .main-branch-title, .sub-branch, etc. per realizzare queste istruzioni.\n`;
        } else {
            prompt += `\nIstruzioni grafiche: Nessuna istruzione specifica, non generare CSS personalizzato.\n`;
        }
        
        prompt += `\nFornisci una risposta JSON con due chiavi: "mindMap" (contenente l'oggetto della mappa concettuale con "centralTopic" e "mainBranches") e "customCss" (una stringa contenente il CSS generato, o una stringa vuota se non ci sono istruzioni grafiche).`;
        break;

      default:
        return res.status(400).json({ error: 'Tipo di prompt non valido.' });
    }

    // Eseguiamo la chiamata effettiva all'API di Google Generative AI.
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();

    // Inviamo la risposta ottenuta dall'IA di nuovo al frontend.
    if (isJsonResponse) {
        // Se la risposta è una stringa JSON, la analizziamo e la inviamo come oggetto JSON.
        res.status(200).json(JSON.parse(responseText));
    } else {
        // Altrimenti (per sintesi e ricerca), inviamo il testo come JSON per coerenza.
        res.status(200).json(responseText);
    }

  } catch (error) {
    console.error("Errore nella funzione API di Vercel:", error);
    res.status(500).json({ error: "Si è verificato un errore interno durante l'elaborazione della richiesta." });
  }
}