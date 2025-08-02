// Per far funzionare questo codice su Vercel, è necessario creare un file
// `package.json` nella cartella principale del progetto eseguendo `npm init -y`
// e poi installare la dipendenza con `npm i @google/generative-ai`.

import { GoogleGenerativeAI } from "@google/generative-ai";

// Funzione helper per estrarre una stringa JSON da un testo che potrebbe contenerla.
function extractJson(text) {
  const match = text.match(/```(json)?\s*([\s\S]*?)\s*```/);
  if (match && match[2]) {
    return match[2];
  }
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    return text.substring(jsonStart, jsonEnd + 1);
  }
  return text;
}

// **NUOVA FUNZIONE**
// Sanifica la struttura della mappa per garantire che tutti i campi di testo siano stringhe.
function sanitizeMapStructure(mindMap) {
    if (!mindMap || typeof mindMap !== 'object') return null;

    const getString = (value, fallback) => {
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value !== null) {
            // Cerca una chiave comune o prendi il primo valore
            return String(value.text || value.title || value.topic || Object.values(value)[0] || fallback);
        }
        return String(value || fallback);
    };

    mindMap.centralTopic = getString(mindMap.centralTopic, 'Argomento Centrale');

    if (!Array.isArray(mindMap.mainBranches)) {
        mindMap.mainBranches = [];
    }

    mindMap.mainBranches = mindMap.mainBranches.map(branch => {
        if (!branch || typeof branch !== 'object') return null;
        branch.title = getString(branch.title, 'Ramo Principale');

        if (!Array.isArray(branch.subBranches)) {
            branch.subBranches = [];
        }

        branch.subBranches = branch.subBranches.map(sub => getString(sub, 'Sotto-ramo')).filter(Boolean);
        return branch;
    }).filter(Boolean);

    return mindMap;
}


// La funzione handler è il punto di ingresso per la Serverless Function di Vercel.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("La variabile d'ambiente GEMINI_API_KEY non è impostata.");
    return res.status(500).json({ error: "La chiave API non è stata configurata correttamente sul server." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

  try {
    const { promptType, text, concepts, graphics } = req.body;
    let prompt;
    let isJsonResponse = false;
    
    switch (promptType) {
      case 'summarize':
        prompt = `Fornisci un riassunto conciso e ben strutturato del seguente testo, mantenendo i punti chiave e le relazioni logiche. Il riassunto deve essere ideale per essere poi trasformato in una mappa concettuale. Testo:\n\n${text}`;
        break;
      
      case 'search':
        prompt = `Fornisci un testo completo e ben strutturato sull'argomento: "${text}". Il testo deve essere abbastanza dettagliato da poterci creare una mappa concettuale approfondita. Spiega i concetti principali, le definizioni, gli esempi e le eventuali connessioni con altri argomenti.`;
        break;

      case 'generateMap':
        isJsonResponse = true;
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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();

    if (isJsonResponse) {
        try {
            const cleanJsonString = extractJson(responseText);
            let parsedJson = JSON.parse(cleanJsonString);

            // **CONTROLLO E SANIFICAZIONE DELLA STRUTTURA**
            const sanitizedMap = sanitizeMapStructure(parsedJson.mindMap);

            if (!sanitizedMap || !sanitizedMap.centralTopic) {
                console.error("La struttura della mappa sanificata non è valida:", sanitizedMap);
                throw new Error("La struttura della mappa generata dall'IA non è valida o è vuota.");
            }
            
            const finalResponse = {
                structure: sanitizedMap,
                css: parsedJson.customCss || ''
            };
            res.status(200).json(finalResponse);

        } catch (e) {
            console.error("Errore nel parsing o nella validazione del JSON ricevuto dall'IA:", e.message);
            console.error("Testo problematico ricevuto:", responseText);
            res.status(500).json({ error: "La risposta dell'IA non era in un formato JSON valido e non è stato possibile analizzarla." });
        }
    } else {
        res.status(200).json(responseText);
    }

  } catch (error) {
    console.error("Errore generico nella funzione API di Vercel:", error);
    res.status(500).json({ error: "Si è verificato un errore interno durante l'elaborazione della richiesta." });
  }
}
