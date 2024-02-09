const net = require('net');

const config = require('../config.sample.json');
class Worker {
    messages =  [];
    socket = new net.Socket();
    buffer = '';
    messageId = 1;

    constructor() {
        this.messages = [];
    }

    start()
    {
        const host = config.params.remote.host;
        const port = config.params.remote.port;

        console.log(host, port);
        this.socket.connect(port, host);

        this.socket.on('connect', () => {
            console.log('Connection established');
            console.log(this.socket.localAddress, this.socket.remoteAddress);
            this.#configure();
        });

        this.socket.setEncoding('utf8');
        this.socket.setNoDelay(true);

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
            params: ['xminer-1.2.1'],
            id: 2,
        }

        this.socket.write(JSON.stringify(message));
        console.log('Sent subscribe message');

        this.socket.once('data', (data) => {
            console.log('POOL: response for subscribe: ', data);
            const message = JSON.stringify(data);

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

        this.socket.write(JSON.stringify(message));
        console.log('Send configure message');

        this.socket.once('data', (data) => {
            console.log('POOL: response for configure message:', data);
            const message = JSON.stringify(data);
            if (!message.error) {
                this.#subscribe();
            }
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