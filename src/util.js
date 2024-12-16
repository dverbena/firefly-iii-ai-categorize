import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

class MissingEnvironmentVariableException extends Error {
    variableName;

    constructor(variableName) {
        super(`The required environment variable '${variableName}' is missing`);

        this.variableName = variableName;
    }
}

export function getConfigVariable(name, defaultValue = null) {
    if (!process.env.hasOwnProperty(name) || process.env[name] == null) {
        if (defaultValue == null) {
            throw new MissingEnvironmentVariableException(name)
        }

        return defaultValue;
    }

    return process.env[name];
}

export function getManualCategories() {
    // Get the current directory using import.meta.url
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);    
    
    // Define the file path relative to the current directory
    const filePath = path.join(__dirname, '../manual_categories/config.json');

    // Read the file synchronously and parse its content
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(rawData);

        console.log(`Read manual categories: ${rawData}`);

        return config;
    } 
    catch (err) {
        console.error('Error reading or parsing the JSON file:', err);
    }
}