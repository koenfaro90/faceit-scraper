const config = {
	interval: 300 * 1000, // every five minutes
	games: [
		{name: 'csgo', regions: ['EU', 'US', 'SEA', 'Oceania', 'SA']},
		{name: 'tf2', regions: ['EU', 'US'] }
	],
	maxPerPage: 100,
	logLevel: 'info'
}

const Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs')),
 	request = require('request'),
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





class Indexer {
	constructor(interval, games, maxPerPage) {
		this.interval = interval;
		this.games = games;
		this.maxPerPage = maxPerPage
	}
	async start() {
		logger.info(`Starting FaceIT scraper`);
		try {
			await fs.mkdirAsync(__dirname + '/data/');
		} catch (e) {
			if (e.message.indexOf('EEXIST') == -1) {
				logger.info(`Error creating data directory: ${e.message}`);
			}
		}
		setInterval(this.cycle.bind(this), this.interval);
		this.cycle();
	}
	async cycle() {
		logger.info(`Starting cycle`);
		let items = this._buildItems();
		try {
			await Promise.all(_.map(items, i => i.execute()))
			logger.info(`Cycle done`);
		} catch (e) {
			logger.error(`Error in cycle: ${e.message}`, {
				stack: e.stack
			})
		}
	}
	_buildItems() {
		let items = [];
		let date = +new Date()
		for (let game of this.games) {
			items.push(new IndexItem(game, date, this.maxPerPage))
		}
		return items;
	}
}

class IndexItem {
	constructor(game, timestamp, limit) {
		this.game = game;
		this.timestamp = timestamp;
		this.limit = limit;
	}
	async execute() {
		let start = +new Date();
		logger.info(`Executing cycle for ${this.game.name}`);
		let data = [];
		for (let region of this.game.regions) {
			let pageResults = null;
			let retryCount = 0;
			this.currentPage = 0;
			while (pageResults == null || pageResults.length > 0) {
				try {
					pageResults = await this._getData(this.currentPage, region);
					data.push(...pageResults);
					this.currentPage++;
				} catch (e) {
					logger.warn(`Caught error performing cycle for ${this.game.name} page ${this.currentPage} in ${region}: ${e.message}`)
					if (retryCount < 3) {
						logger.info(`Retrying`);
						retryCount++;
					} else {
						logger.info(`Aborting`);
					}
				}
			}
		}
		await this._writeResults(data);
		logger.info(`Finished cycle for ${this.game.name}, took ${+new Date() - start}ms and retrieved ${data.length} matches`);
	}
	async _writeResults(data) {
		try {
			await fs.writeFileAsync(this._generateFilename(), JSON.stringify(data, 0, "\t"));
		} catch (e) {
			logger.error(`Error writing results to file: ${e.message}`);
		}
	}
	_generateFilename() {
		return `./data/${this.timestamp}_${this.game.name}.json`;
	}
	_getOffset() {
		return this.currentPage * this.limit;
	}
	async _getData(page, region) {
		logger.info(`Retrieving page ${page} for ${this.game.name} - ${region}`);
		let data = await this._retrievePage(page, region);
		logger.debug(`${this.game.name} - ${page} - ${region} -> ${data.payload.length}`)
		return data.payload;
	}
	async _retrievePage(page, region) {
		let url = `https://api.faceit.com/core/v1/matches?game=${this.game.name}&limit=${this.limit}&offset=${this._getOffset()}&region=${region}&state=voting,configuring,ready,ongoing`;
		logger.debug(`URL: ${url}`);
		let result = await this._request(url);
		return result;
	}
	_request(url) {
		return new Promise((resolve, reject) => {
			request({
				url: url,
				method: 'GET',
				json: true
			}, (err, response, body) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(body);
				}
			})
		})
	}
}

new Indexer(config.interval, config.games, config.maxPerPage).start();
