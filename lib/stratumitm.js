const crypto = require('crypto');

class Client {
	socket;
	logger;
	mode = '';
	name = '';

	constructor(socket, logger) {
		this.socket = socket;
		// Name self
		var hash = crypto.createHash('sha256');
		hash.update(socket.remoteAddress + ':' + socket.remotePort);
		this.name = 'CL+' + hash.digest('hex');

		this.mode = 'detect';
		this.logger = logger.part(this.name);
	}

	parseMessages(data, callback) {
		if (this.mode === 'http') {
			const request = data.split('\r\n\r\n', 2);

			if (request.length === 0) {
				this.logger.part('recv').error('Using protocol HTTP but no body found.');
				return;
			}
			const head = request[0], body = request[1];
			// Create the header lines
			const headerLines = head.trim().split('\r\n');
			if (headerLines[0].startsWith('GET ') ||
				headerLines[0].startsWith('HEAD ')) {
				// This would not be handled later so it must be handled NOW
				this.logger.part('handle').warn('Got HTTP read message. ' +
					'Responding with error.');
				this.write({
					'id': null,
					'error': 'Method not supported.'
				});
				return;
			}
			// Try to trim the message
			try {
				callback(JSON.parse(body));
			} catch (e) {
				this.logger.part('recv').error(e);
				this.logger.part('recv').part('raw').error(body);
			}
		} else {
			const messages = data.trim().split('\n');

			messages.forEach((message) => {
				if (message.trim() === '') {
					return;
				}

				try {
					callback(JSON.parse(messages[i].trim()));
				} catch (e) {
					this.logger.part('recv').error(e);
					this.logger.part('recv').part('raw').error(data.trim());
				}
			});
		}
	}

	write(message = '') {
		if (this.mode === 'http') {
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
class StratuMITM {
	delegator;
	rewriter;
	logger;

	constructor(delegator, rewriter, logger) {
		this.delegator = delegator;
		this.rewriter = rewriter;
		this.logger = logger;
	}

	createClient(socket, logger) {
		return new Client(socket, logger ? logger : this.logger);
	}

	getHandler(name) {
		const logger = this.logger.part(name);

		return (socket) => {
			socket.setNoDelay(true);
			socket.setEncoding('UTF8');

			const client = this.createClient(socket, logger);

			this.delegator.registerLocal(client.name, client);
			this.rewriter.clientConnect(client.name);

			socket.on('data', (data) => {
				this.logger.log('data: ' +  data);
				if (client.mode === 'detect') {
					if (data.startsWith('GET') || data.startsWith('POST') ||
						data.startsWith('HEAD')) {

						client.mode = 'http';
					} else {
						client.mode = 'json';
						data = data.replace(/\n|\r|\s/g, '');
					}
				}

				client.parseMessages(data, (message) => {
					this.rewriter.clientMessage(client.name, message);
				});
			})

			socket.on('close', () => {
				this.rewriter.clientDisconnect(client.name);
			});
		};
	}
}

exports.StratuMITM = StratuMITM;