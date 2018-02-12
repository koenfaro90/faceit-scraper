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
	
class Compiler {
	constructor(dir) {
		this.dir = dir;
	}
	async run() {
		let files = await this._index();
		let intermediaryResult = [];
		for (let file of files) {
			logger.info(`Processing file ${file}`);
			intermediaryResult.push(...(await this._processFile(file)));
		}
		await this._write(await this._transform(intermediaryResult));
	}
	async _transform(data) {
		// We want a record for every match at every point in time
		for (let record of data) {
			record.date = new Date(record.timestamp);
		}
		return data;
	}
	async _write(data) {
		return await fs.writeFileAsync(this.dir + '/../output.json', JSON.stringify(data));
	}
	async _index() {
		return fs.readdirAsync(this.dir);
	}
	async _processFile(filename) {
		let data = JSON.parse((await fs.readFileAsync(this.dir + filename)).toString());
		let result = [];
		for (let record of data) {
			let itm = {
				id: record.guid,
				game: record.game,
				state: record.state,
				team_size: record.team_size,
				region: record.region,
				timestamp: parseInt(filename.split('_')[0]),
				location: null
			}
			if (record.voted_entities && record.voted_entities.length > 0) {
				let first = record.voted_entities[0];
				if (first.location) {
					itm.location = first.location.name;
				}
			}
			result.push(itm);
		}
		return result;
	}
}

new Compiler(__dirname + '/data/').run();