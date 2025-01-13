import express from "express";
import {getConfigVariable} from "./util.js";
import {getManualCategories} from "./util.js";
import FireflyService from "./FireflyService.js";
import OpenAiService from "./OpenAiService.js";
import {Server} from "socket.io";
import * as http from "http";
import Queue from "queue";
import JobList from "./JobList.js";

export default class App {
    #PORT;
    #ENABLE_UI;

    #firefly;
    #openAi;

    #server;
    #io;
    #express;

    #queue;
    #jobList;

    #manualCategories;

    constructor() {
        this.#PORT = getConfigVariable("PORT", '3000');
        this.#ENABLE_UI = getConfigVariable("ENABLE_UI", 'false') === 'true';
    }

    async run() {
        this.#firefly = new FireflyService();
        this.#openAi = new OpenAiService();

        this.#queue = new Queue({
            timeout: 30 * 1000,
            concurrency: 1,
            autostart: true
        });

        this.#queue.addEventListener('start', job => console.log('Job started', job))
        this.#queue.addEventListener('success', event => console.log('Job success', event.job))
        this.#queue.addEventListener('error', event => console.error('Job error', event.job, event.err, event))
        this.#queue.addEventListener('timeout', event => console.log('Job timeout', event.job))

        this.#express = express();
        this.#server = http.createServer(this.#express)
        this.#io = new Server(this.#server)

        this.#jobList = new JobList();
        this.#jobList.on('job created', data => this.#io.emit('job created', data));
        this.#jobList.on('job updated', data => this.#io.emit('job updated', data));

        this.#express.use(express.json());

        if (this.#ENABLE_UI) {
            this.#express.use('/', express.static('public'))
        }

        this.#express.post('/webhook', this.#onWebhook.bind(this))

        this.#server.listen(this.#PORT, async () => {
            console.log(`Application running on port ${this.#PORT}`);
        });

        this.#io.on('connection', socket => {
            console.log('connected');
            socket.emit('jobs', Array.from(this.#jobList.getJobs().values()));
        });
    }

    #onWebhook(req, res) {
        try {
            console.info("Webhook triggered");
        
            this.#manualCategories = getManualCategories();
            this.#handleWebhook(req, res);
            res.send("Queued");
        } catch (e) {
            console.error(e)
            res.status(400).send(e.message);
        }
    }

    findCategory(description) {        
        for (const category of this.#manualCategories.categories) {// Loop through each category in manualCategories            
            if (description.toLowerCase().includes(category.transaction_contains.toLowerCase())) {// Check if the description contains the transaction_contains value
                return category.category; // Return the category if a match is found
            }
        }

        // Return null if no match is found
        return null;
    }

    extractDate(input) {
        const regex = /del (\d{2}\/\d{2}\/\d{4})/; // Matches "del dd/MM/yyyy"
        const match = input.match(regex);
    
        if (match) {
            const [day, month, year] = match[1].split('/'); // Extract day, month, year
            const formattedDate = `${year}-${month}-${day}00:00:00+01:00`; // Reformat
            return formattedDate;
        }
    
        return null; // Return null if no match
    }

    #handleWebhook(req, res) {
        // TODO: validate auth

        if (req.body?.trigger !== "STORE_TRANSACTION") {
            throw new WebhookException("trigger is not STORE_TRANSACTION. Request will not be processed");
        }

        if (req.body?.response !== "TRANSACTIONS") {
            throw new WebhookException("trigger is not TRANSACTION. Request will not be processed");
        }

        if (!req.body?.content?.id) {
            throw new WebhookException("Missing content.id");
        }

        if (req.body?.content?.transactions?.length === 0) {
            throw new WebhookException("No transactions are available in content.transactions");
        }

        if (req.body.content.transactions[0].type !== "withdrawal") {
            throw new WebhookException("content.transactions[0].type has to be 'withdrawal'. Transaction will be ignored.");
        }

        if (req.body.content.transactions[0].category_id !== null) {
            throw new WebhookException("content.transactions[0].category_id is already set. Transaction will be ignored.");
        }

        if (!req.body.content.transactions[0].description) {
            throw new WebhookException("Missing content.transactions[0].description");
        }

        if (!req.body.content.transactions[0].destination_name) {
            throw new WebhookException("Missing content.transactions[0].destination_name");
        }

        const destinationName = req.body.content.transactions[0].destination_name;
        const description = req.body.content.transactions[0].description

        const job = this.#jobList.createJob({
            destinationName,
            description
        });

        this.#queue.push(async () => {
            this.#jobList.setJobInProgress(job.id);

            const categories = await this.#firefly.getCategories();
            const catKeys = Array.from(categories.keys());

            const newData = Object.assign({}, job.data);

            //first check if it's a manual defined category
            const manualCategory = this.findCategory(description);

            if(manualCategory && catKeys.map(key => key.toLowerCase()).includes(manualCategory.toLowerCase())) {
                console.log(`Category found in manual configuration: ${manualCategory}`);

                newData.category = manualCategory;
                newData.prompt = 'Fetched from manual categories configuration';
                newData.response = manualCategory;
            }
            else {
                //try OpenAI
                const {category, prompt, response} = await this.#openAi.classify(Array.from(catKeys), destinationName, description);

                newData.category = category;
                newData.prompt = prompt;
                newData.response = response;
            }

            this.#jobList.updateJobData(job.id, newData);

            if (newData.category) {
                await this.#firefly.setCategory(req.body.content.id, req.body.content.transactions, categories.get(newData.category));
            }

            // try {
            //     console.info("Trying to update payment date");
            //     await this.#firefly.setDate(req.body.content.id, req.body.content.transactions, this.extractDate(description));
            // } catch (e) {
            //     console.error(`Error updating payment date: ${e}`);
            // }

            this.#jobList.setJobFinished(job.id);
        });
    }
}

class WebhookException extends Error {

    constructor(message) {
        super(message);
    }
}