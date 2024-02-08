const net = require('net');

// My libraries
const sm = require('./lib/stratumitm.js');
const delegatorRequire = require('./lib/delegator');
const logger = require('./lib/logger');

const config = require('./config.sample.json');


const log = new logger.Logger([], config.logger ? config.logger.params : null);
const rewriterClass = require('./lib/rewrite/rewrite.credentials');

// Load the rewriter
const delegator = new delegatorRequire.Delegator();
const rewriter = new rewriterClass.Rewriter(config.params, delegator, log);

// Set up servers on each port
const stratumitm = new sm.StratuMITM(delegator, rewriter, log);

config.ports.forEach((port) => {
	const name = 'Port=' + port;
	const socket = net.createServer();
	const logger = log.part(name);

	socket.on('connection', stratumitm.getHandler(name));

	socket.on('error', (e) => {
		logger.error(e);
	});

	socket.on('listening', () => {
		logger.log('Listening on ' + socket.address().port);
	});

	socket.listen(port);
});
