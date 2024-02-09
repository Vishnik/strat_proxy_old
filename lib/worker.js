const net = require('net');

const config = require('../config.sample.json');
const {setInterval} = require("timers");
class Worker {
    messages =  [];
    difficult = '';
    socket = new net.Socket();
    buffer = '';
    messageId = 950;

    constructor() {
        this.messages = [];
    }

    start()
    {
        const host = config.params.remote.host;
        const port = config.params.remote.port;

        this.socket.setEncoding('utf8');
        this.socket.setNoDelay(true);

        this.socket.connect(port, host);

        this.socket.on('connect', () => {
            console.log('Connection established');
            console.log(this.socket.localAddress, this.socket.remoteAddress);
            this.socket.on('data', this.#handleDataEvent.bind(this));
            this.socket.on('error', (error) => {
                console.error(error);
            });

            this.socket.on('close', () => {
                console.log('close event');
            });

            this.socket.on('end', () => {
                console.log('end event');
            });

            this.#subscribe();
        });
    }

    popMessage()
    {
        return this.messages.shift();
    }

    getDifficulty()
    {
        return this.difficult;
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

            this.#handleMessage(JSON.parse(message));
        }
    }

    #handleMessage(message) {
        console.log('POOL: Get message: ', JSON.stringify(message));
        const method = message.method;

        if (method === 'mining.notify') {
            this.messages.push(message);
        } else if (method === 'mining.set_difficulty') {
            this.messages = [];
            this.difficult = message.params[0];
            console.log('POOL: установили сложность = ', message.params[0]);
        }
    }

    #subscribe() {
        const message = {
            method: 'mining.subscribe',
            params: ["StratuMITM/Rewrite 0.1"],
            id: ++this.messageId,
        }

        this.socket.write(JSON.stringify(message) + '\n');
        console.log('Sent subscribe message');

        this.socket.once('data', (data) => {
            console.log('POOL: response for subscribe: ', data);
            const message = JSON.parse(data);

            if (!message.error) {
                this.#authorize();
            }

            console.log(message);
        });
    }

    #configure()
    {
        const message = {
            "id": 1,
            "method":"mining.configure",
            "params":[
                ["version-rolling","subscribe-extranonce"],
                {
                    "version-rolling.mask":"1fffe000",
                    "version-rolling.min-bit-count":16
                }]
        }

        this.socket.write(JSON.stringify(message) + '\n');
        console.log('Send configure message');

        this.socket.once('data', (data) => {
            console.log('POOL: response for configure message:', data);
            const message = JSON.stringify(data);
            if (!message.error) {
                this.#subscribe();
            }
        });
    }

    #authorize()
    {
        const message = {
            method: 'mining.authorize',
            params: [config.params.credentials.user, config.params.credentials.pass],
            id: ++this.messageId,
        }
        this.socket.write(JSON.stringify(message) + '\n');

        this.socket.once('data', (data) => {
            console.log('POOL: response from authorize: ', data);
        });
    }
}

exports.Worker = Worker;