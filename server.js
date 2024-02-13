const net = require('net');
// const cluster = require('cluster');
// const os = require('os');

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

const portsAmount = config.ports.length;

// if (cluster.isMaster) {
// 	// Get the number of CPU cores
// 	const numCPUs = os.cpus().length;
//
// 	// Fork a worker process for each CPU core
// 	for (let i = 0; i < Math.min(numCPUs,portsAmount); i++) {
// 		cluster.fork();
// 	}
//
// 	// Listen for exiting worker processes and fork a new one
// 	cluster.on('exit', (worker, code, signal) => {
// 		console.log(`Worker ${worker.process.pid} died`);
// 		cluster.fork();
// 	});
// } else {
// 	// Assign ports based on the process ID
// 	const port = config.ports[cluster.worker.id - 1];
// 		const name = 'Port=' + port;
//
// 	const socket = net.createServer();
// 	const logger = log.part(name);
//
// 	socket.on('connection', stratumitm.getHandler(name));
//
// 	socket.on('error', (e) => {
// 		logger.error(e);
// 	});
//
// 	socket.on('listening', () => {
// 		logger.log('Listening on ' + socket.address().port);
// 		console.log(`Server running on port ${port} in CPU core ${cluster.worker.id}`);
// 	});
//
// 	socket.listen(port);
// }

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
