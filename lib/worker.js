const net = require('net');

const config = require('../config.sample.json');
class Worker {
    messages =  [];
    socket = new net.Socket();
    buffer = '';

    constructor() {
        this.messages = [];
    }

    start()
    {
        this.socket.connect({
            host: config.params.remote.host,
            port: config.params.remote.port,
        });

        this.socket.on('connect', () => {
            console.log('Connection established');
            this.#subscribe();
        });

        this.socket.setEncoding('utf-8');
        this.socket.setNoDelay(true);

        this.socket.on('data', this.#handleDataEvent.bind(this));
        this.socket.on('error', (error) => {
            console.error(error);
        });

        this.socket.on('close', () => {
            console.log('close event');
        });
    }

    popMessage()
    {
        return this.messages.unshift();
    }

    #handleDataEvent(data) {
        const chunk = data.toString();
        this.buffer += chunk;

        // Check if the buffer contains a newline character
        const newlineIndex = this.buffer.indexOf('\n');
        if (newlineIndex !== -1) {
            // Extract the complete message
            const message = this.buffer.substring(0, newlineIndex).trim();
            this.buffer = this.buffer.substring(newlineIndex + 1); // Remove processed part from buffer

            console.log('message from pull', message);
            // this.#handleMessage(JSON.stringify(message));
        }
    }

    #handleMessage(message) {
        const method = message.method;
    }

    #subscribe() {
        const message = {
            method: 'subscribe',
            params: [],
            id: 1,
        }

        this.socket.write(JSON.stringify(message));

        this.socket.once('data', (data) => {
            console.log('handle subscribe message', data);
            const message = JSON.stringify(data);

            console.log(message);
        });
    }

    #sendSubscribeMessage()
    {
        const message = {
            method: 'subscribe',
            params: [],
            id: 1,
        }

        this.socket.write(JSON.stringify(message));
    }
}

const worker = new Worker();

worker.start();