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
	constructor(input) {
		this.input = input;
	}
	async run() {
		this.intermediaryResults = JSON.parse((await fs.readFileAsync(this.input)).toString())
		let result = this._process();
		await this._write(result);
	}
	_process(data) {
		let matchStatusByTime = {};
		let matchesStartedByTime = {};
		let matchesRunningByTime = {};
		let matchesById = {};
		let allTimestamps = {};
		let allLocations = [];
		// 1st location
		// 2nd 
		console.log('Processing data', this.intermediaryResults.length);
		let i = 0;
		let last = +new Date();
		for (let item of this.intermediaryResults) {
			let id = item.id;
			i++;
			if (i%1000 == 0) {
				console.log(`Processed 1000 in ${+new Date() - last}ms ${i}/${this.intermediaryResults.length} `);
				last = +new Date();
			}
			matchesById[id] = item;
			if (item.location == null) {
				continue;
			}
			let roundedTimestamp = this._nearestPastMinutes(5, item.timestamp).toDate();
			if (allTimestamps[roundedTimestamp] == undefined) {
				allTimestamps[roundedTimestamp] = roundedTimestamp;
			}
			/*if (allTimestamps.indexOf(roundedTimestamp) == -1) {
				allTimestamps.push(roundedTimestamp);
			}*/
			if (allLocations.indexOf(item.location) == -1) {
				allLocations.push(item.location);
			}
			if (matchStatusByTime[id] == undefined) {
				matchStatusByTime[id] = {};
				matchStatusByTime[id][roundedTimestamp] = 'started';
				if (matchesStartedByTime[roundedTimestamp] == undefined) {
					matchesStartedByTime[roundedTimestamp] = [];
				}
				matchesStartedByTime[roundedTimestamp].push(id);
			} else {
				matchStatusByTime[id][roundedTimestamp] = 'running';
				if (matchesRunningByTime[roundedTimestamp] == undefined) {
					matchesRunningByTime[roundedTimestamp] = [];
				}
				matchesRunningByTime[roundedTimestamp].push(id);
			}
		}
		console.log('Processing data done');
		let result = [];
		for (let timestamp of Object.values(allTimestamps)) {
			console.log(timestamp);
			let amount_started_per_location = _.mapValues(_.groupBy(matchesStartedByTime[timestamp], id => matchesById[id].location), arr => arr.length);
			let amount_running_per_location = _.mapValues(_.groupBy(matchesRunningByTime[timestamp], id => matchesById[id].location), arr => arr.length);
			console.log(timestamp, amount_started_per_location, amount_running_per_location);
			for (let location of allLocations) {
				result.push({
					timestamp: new Date(timestamp),
					amount_started: amount_started_per_location[location],
					amount_running: amount_running_per_location[location],
					location: location
				})
			}
		}
		console.log('Returning');
		return result;
	}
	_nearestPastMinutes(interval, timestamp){
		let someMoment = moment(timestamp);
		let roundedMinutes = Math.floor(someMoment.minute() / interval) * interval;
		return someMoment.clone().minute(roundedMinutes).second(0).millisecond(0);
	}
	async _write(data) {
		return await fs.writeFileAsync(this.dir + '/../output_by_date.json', JSON.stringify(data));
	}
}

new Compiler(__dirname + '/output.json').run();