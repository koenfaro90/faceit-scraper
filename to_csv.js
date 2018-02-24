const config = {
	logLevel: 'info'
}

const Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs')),
	_ = require('lodash'),
	moment = require('moment'),
	{ createLogger, format, transports } = require('winston'),
	{ combine, timestamp, label, prettyPrint } = format,
	consoleFormat = format.printf(function (info) {
		return `[${info.level}] ${moment().format('YYYY-MM-DDTHH:mm:ss.SSSZZ')}: ${info.message} `;
	});
	logger = createLogger({
		level: config.logLevel,
		transports: [
			new transports.Console({ format: format.combine( format.colorize(), consoleFormat)  }),
			new transports.File({ filename: 'app.log' })
		]
	});
	
class Converter {
	constructor(input, output) {
		this.input = input;
		this.output = output;
	}
	async run() {
		let data = JSON.parse((await fs.readFileAsync(this.input)).toString());
		let csvLines = [];
		let keys = Object.keys(data[0]);
		csvLines.push(keys.join(','));
		for (let item of data) {
			let line = [];
			for (let key of keys) {
				line.push(item[key]);
			}
			csvLines.push(line.join(','));
		}
		await fs.writeFileAsync(this.output, csvLines.join('\r\n'));
	}
}

new Converter(__dirname + '/output.json', __dirname + '/output.csv').run();