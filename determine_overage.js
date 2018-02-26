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
	
class DetermineOverage {
	constructor(outputByDateFile, commitmentFile) {
		this.outputByDateFile = outputByDateFile;
		this.commitmentFile = commitmentFile;
	}
	async run() {
		let outputByDate = JSON.parse((await fs.readFileAsync(this.outputByDateFile)).toString());
		let commitment = JSON.parse((await fs.readFileAsync(this.commitmentFile)).toString());
		
		let outputByLocation = _.groupBy(outputByDate, 'location');
		let commitmentByZone = _.keyBy(commitment, 'zone');
		let total = [];
		for (let location in outputByLocation) {
			total.push(await this.processLocation(location, outputByLocation[location], commitmentByZone[location]));
		}
		await this._write('overage_total', total);
	}
	async processLocation(location, output, commitment) {
		logger.info(`Process location: ${location}`, { commitment: commitment });
		try {
			let totalOverage = 0;
			let overageByDate = {};
			let overageByTimestamp = {};
			for (let item of output) {
				let total = item.amount_started + item.amount_running;
				if (total > commitment.committed_ccm) {
					let overage = total - commitment.committed_ccm;
					totalOverage += overage;
					overageByTimestamp[item.timestamp] = overage;
					let date = moment(item.timestamp).format('YYYY-MM-DD');
					if (overageByDate[date] == undefined) {
						overageByDate[date] = 0;
					}
					overageByDate[date] += overage;
				} else {
					overageByTimestamp[item.timestamp] = 0;
				}
			}
			let result = {
				location: location,
				totalOverage: totalOverage,
				overageByDate: overageByDate
			}
			await this._write('overage_' + location, {
				location: location,
				totalOverage: totalOverage,
				overageByDate: overageByDate,
				overageByTimestamp: overageByTimestamp
			});
			return result;
		} catch (e) {
			logger.error(`Error processing location: ${location}: ${e.message}`);
		}
	}
	async _write(filename, data) {
		return await fs.writeFileAsync(filename + '.json', JSON.stringify(data, 0, "\t"));
	}
}

new DetermineOverage(__dirname + '/output_by_date.json', __dirname + '/commitment.json').run();