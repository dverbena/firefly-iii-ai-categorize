import OpenAI from "openai";
import {getConfigVariable} from "./util.js";

export default class OpenAiService {
    #openAi;
    #model = "gpt-4o-mini";

    constructor() {
        const apiKey = getConfigVariable("OPENAI_API_KEY")


        this.#openAi = new OpenAI({
            apiKey
        })
    }

    async classify(categories, destinationName, description) {
        try {            
            console.log("#openAi.classify started");

            const prompt = this.#generatePrompt(categories, destinationName, description);

            const response = await this.#openAi.chat.completions.create({
                model: this.#model,
                messages: [{"role": "user", "content": prompt}],
            });

            console.log(response.choices[0].message);
            let guess = response.choices[0].message.content;
            guess = guess.replace("\n", "");
            guess = guess.trim();

            console.log(`OpenAIs guess: ${guess}`);

            let guessIndex = -1;
            categories.forEach(function(cat, index, array)
                { 
                    if(guess.toLowerCase().includes(cat.toLowerCase().trim()))
                        guessIndex = index;
                }
            )

            if (guessIndex === -1) {
                console.warn(`OpenAI could not classify the transaction. 
                Categories in firefly III: ${categories.join(", ")}`)

                return {
                    prompt,
                    response: response.choices[0].message.content,
                    category: null
                };
            }

            console.log("#openAi.classify completed");
            
            return {
                prompt,
                response: response.choices[0].message.content,
                category: categories[guessIndex]
            };

        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                console.error(error.status);
                console.error(error.response.data);
                throw new OpenAiException(error.status, error.response, error.response.data);
            } else {
                console.error(error.message);
                throw new OpenAiException(null, null, error.message);
            }
        }
    }

    #generatePrompt(categories, destinationName, description) {
        return `Ho la seguente lista di categorie di spese con cui classificare le mie entrate ed uscite casalinghe: ${categories.join(", ")}.
In quale delle suddette categorie potrebbe cadere una transazione originata da "${destinationName}" e avente la seguente descrizione "${description}"?
Potresti rispondermi scrivendo solo il nome della categoria (esclusivamente fra quelle che ti ho fornito) senza formare una frase?`;
    }
}

class OpenAiException extends Error {
    code;
    response;
    body;

    constructor(statusCode, response, body) {
        super(`Error while communicating with OpenAI: ${statusCode} - ${body}`);

        this.code = statusCode;
        this.response = response;
        this.body = body;
    }
}