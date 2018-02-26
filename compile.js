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
		let total = files.length;
		let i = 0;
		let pList = [];
		for (let file of files) {
			//console.log(`Processing file ${file} ${i} / ${total}`);
			pList.push(this._processFile.bind(this, file));
			//i++;
		}
		let results = await Promise.map(pList, (it) => {
			logger.info(`Processing ${i} / ${total}`);
			i++;
			return it();
		}, {
			concurrency: 50 
		});
		for (let result of results) {
			intermediaryResult.push(...result);
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
		let parts = [];
		let totalLength = 0;
		for (let part of data) {
			let str = JSON.stringify(part);
			parts.push(str);
			totalLength += str.length;
		}
		logger.debug(`${parts.length} parts, total ${totalLength} bytes`);
		return await fs.writeFileAsync(this.dir + '/../output.json', `[${parts.join(',')}]`);
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