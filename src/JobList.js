import {v4 as uuid} from "uuid";
import EventEmitter from "events";

export default class JobList {
    #jobs = new Map();
    #eventEmitter = new EventEmitter();

    constructor() {
    }

    on(event, listener) {
        this.#eventEmitter.on(event, listener);
    }

    getJobs() {
        return this.#jobs;
    }

    createJob(data) {
        const id = uuid()
        const created = new Date();

        const job = {
            id,
            created,
            status: "queued",
            data,
        }

        this.#jobs.set(id, job);
        this.#eventEmitter.emit('job created', {job, jobs: Array.from(this.#jobs.values())})

        return job;
    }

    updateJobData(id, data) {        
        console.log("#jobList.updateJobData started");

        const job = this.#jobs.get(id);
        job.data = data;
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
        
        console.log("#jobList.updateJobData completed");
    }

    setJobInProgress(id) {
        const job = this.#jobs.get(id);
        job.status = "in_progress";
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
    }

    setJobFinished(id) {
        const job = this.#jobs.get(id);
        job.status = "finished";
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
    }
}