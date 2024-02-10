const net = require('net');

class Server {
	host = '';
	port = '';
	socket;
	log;
	feed;
	handlers = {};
	_retryCount = 0;

	constructor(host, port) {
		this.host = host;
		this.port = port;

		// Should be updated by the consumer of this server
		this.log = null;
		this.retry = 0;
		this.protocol = 'json';
		this._retryCount = 0;

		// Local stuff
		this.socket = new net.Socket();
		this.feed = [];
		this.handlers = {};

		this.socket.setNoDelay(true);
		this.socket.setEncoding('UTF8');
		let buffer = '';

		this.socket.on('error', (e) => {
			if (this.log) {
				this.log.error(e);
			}

			// Clear feed
			this.feed = [];
			if (this.retry > 0) {
				// Actually retry connecting
			}
			this.emit('error', e);
		});

		this.socket.on('data', (data) => {
			if (this.protocol === 'http') {
				// JSON-RPC over http
				this.handleRawData(data, 'http');
			} else if (this.protocol === 'unknown') {
				// Do some protocol detection
				if (data.startsWith('GET') || data.startsWith('POST') ||
					data.startsWith('HEAD')) {
					this.protocol = 'http';
				} else {
					this.protocol = 'json';
				}
			} else {
				const chunk = data.toString();
				buffer += chunk;

				// Check if the buffer contains a newline character
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex !== -1) {
					// Extract the complete message
					const message = buffer.substring(0, newlineIndex).trim();
					buffer = buffer.substring(newlineIndex + 1); // Remove processed part from buffer

					this.handleRawData(message, 'json');
				}
				// Default to the JSON-RPC raw
				// data = data.replace(/\n|\r|\s/g, '');
				// this.handleRawData(data, 'json');
			}
			this.emit('data', data);
		});

		this.socket.on('close', (data) => {
			this.emit('close');
		});
	}

	handleRawData(data) {
		const messages = data.trim().split('\n');

		messages.forEach((message) => {
			if (message.trim() === '') {
				return;
			}
			try {
				this.feed.push(JSON.parse(message.trim()));
			} catch (e) {
				this.log.part('recv').error(e);
			}
		});
	}

	on(eventName, handler) {
		if (!(eventName in this.handlers)) {
			this.handlers[eventName] = [];
		}

		this.handlers[eventName].push(handler.bind(this));
	}

	emit(eventName, data) {
		if (Array.isArray(this.handlers[eventName])) {
			this.handlers[eventName].forEach((handler) => {
				handler(data);
			})
		}
	}

	connect() {
		this.socket.connect(this.port, this.host);
	}

	write(message) {
		if (this.socket.destroyed) {
			this.log.part.error(`Socket ${this.host}:${this.port} is closed.`);
			this.log.part('send').part('message').error(message);

			return;
		}

		if (this.protocol === 'http') {
			const msg = JSON.stringify(message);

			this.socket.write('HTTP/1.1 200 OK\r\n');
			this.socket.write('Server: stratumitm\r\n');
			this.socket.write('Content-Type: application/json;charset=UTF-8\r\n');
			this.socket.write('Content-Length: ' + msg.length + '\r\n\r\n');
			this.socket.write(msg);
		} else {
			this.socket.write(JSON.stringify(message) + '\n');
		}
	}
}

class Delegator {
	_remote = {};
	_local = {};

	constructor() {
		this._remote = {};
		this._local = {};
	}

	openConnection(host, port) {
		return new Server(host, port);
	}

	registerRemote(serverName = '', serverInstance) {
		this._remote[serverName] = serverInstance;
	}

	registerLocal(clientName = '', socket) {
		this._local[clientName] = socket;
	}

	sendRemote(serverName, message) {
		this._remote[serverName].write(message);
	}

	sendLocal(clientName, message) {
		this._local[clientName].write(message);
	}
}

exports.Delegator = Delegator;