const net = require('net');

const config = require('../config.sample.json');
const {setInterval} = require("timers");
class Worker {
    messages =  [];
    difficult = '';
    socket = new net.Socket();
    buffer = '';
    messageId = 950;
    notifyMessage;
    notifySubscriber;

    constructor() {
        this.messages = [];
    }

    setNotifySubscriber(callback) {
        this.notifySubscriber = callback;
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
                console.error('POOL: ', error);
            });

            this.socket.on('close', () => {
                this.socket = new net.Socket();
                this.start();
                console.log('POOL: close event. Restart socket.');
            });

            this.socket.on('end', () => {
                console.log('POOL: end event');
            });

            this.#configure();
        });
    }

    popMessage()
    {
        const message = this.notifyMessage;
        this.notifyMessage = undefined;

        return message;
        // return this.messages.shift();
    }

    getDifficulty()
    {
        return this.difficult;
    }

    submitMessage(message) {
        message.params[0] = config.params.credentials.user;
        console.log('POOL: отправили решение: ' + JSON.stringify(message));

        this.socket.write(JSON.stringify(message) + '\n');
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
        console.log('POOL: Текущая сложность: ', this.getDifficulty())
        const method = message?.method;

        if (method === 'mining.notify') {
            this.#handleNotifyMessage(message);
        } else if (method === 'mining.set_difficulty') {
            this.messages.length = 0;
            this.difficult = message.params[0];
            console.log('POOL: установили сложность: ', message.params[0]);
        } else {
            console.log('POOL: Сообщение: ', JSON.stringify(message));
        }
    }

    #handleNotifyMessage(message) {
        if (this.notifySubscriber)
        {
            this.notifySubscriber(message);
        }
        // this.notifyMessage = message;
        // console.log('POOL: notify:', JSON.stringify(message));
        //
        // const jobId = message.params[0];
        // const cleanJobs = message.params[message.params.length - 1];
        //
        // if (cleanJobs) {
        //     this.messages.length = 0;
        // }
        //
        // this.messages.push(message);
    }

    #subscribe() {
        const message = {
            method: 'mining.subscribe',
            params: ["cgminer 4.11"],
            id: ++this.messageId,
        }

        this.socket.write(JSON.stringify(message) + '\n');

        this.socket.once('data', (data) => {
            console.log('POOL: response for subscribe: ', data);
            const message = JSON.parse(data);

            if (!message.error) {
                this.#authorize();
            }
        });
    }

    #configure()
    {
        // const message = {
        //     "id": ++this.messageId,
        //     "method":"mining.configure",
        //     "params":[
        //         ["minimum-difficulty", "version-rolling","subscribe-extranonce"],
        //         {
        //             "minimum-difficulty.value": 524288,
        //             "version-rolling.mask":"1fffe000",
        //             "version-rolling.min-bit-count":16
        //         }]
        // }

        const message = {
            "id": ++this.messageId,
            "method":"mining.configure",
            "params":[
                ["version-rolling"],
                {
                    "version-rolling.mask":"1fffe000",
                    "version-rolling.min-bit-count":8
                }]
        }

        this.socket.write(JSON.stringify(message) + '\n');

        this.socket.once('data', (data) => {
            console.log('POOL: response for configure message: ', data);
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