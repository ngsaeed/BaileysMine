import SimSpecModel from '../models/sim-spec.model';

const ExcelJS = require('exceljs')
import * as fs from 'node:fs'
import JoinConfig from '../models/join-config.model'

export default async function(sock: any, joinConfig: JoinConfig, currentSim: SimSpecModel) {
	const workbook = new ExcelJS.Workbook()
	const content = await workbook.xlsx.readFile(joinConfig.groupsFilePath)
	const worksheet = content.worksheets[0]
	const rowStartIndex = 1
	const numberOfRows = worksheet.rowCount
	const rows = worksheet.getRows(rowStartIndex, numberOfRows) ?? []
	let pureCode = ''
	let serverError = ''
	let report = {}
	if(fs.existsSync('report/report.json')){
		report = JSON.parse(fs.readFileSync('report/report.json').toString())
	}
	let tryCounter = 0
	let successCounter = 0
	let failCounter = 0
	if(!fs.existsSync('report/' + currentSim.number)) {
		fs.mkdirSync('report/' + currentSim.number)
	}

	for(let groupIndex = joinConfig.fromRow ; groupIndex <= joinConfig.toRow; groupIndex++) {
		const link = rows[groupIndex].getCell(1).value
		if(link !== null && link !== undefined) {
			const splitArray = link.toString().split('whatsapp.com/')
			if(splitArray?.[1]) {
				pureCode = splitArray[1]
				console.log('\ngroup index: ' + groupIndex)
				tryCounter++
				await sock.groupAcceptInvite(pureCode).then(() => {
					successCounter++
					fs.appendFileSync('report/' + currentSim.number + '/success.json', '\n"' + link + '",');
					let joinList = [];
					if(fs.existsSync('report/join-list.json')){
						joinList = JSON.parse(fs.readFileSync('report/join-list.json').toString())
					}
					fs.writeFileSync(
						'report/join-list.json',
						JSON.stringify([
							...joinList, {
								group: link,
								number: currentSim.number
								}
							])
						)
					fs.writeFileSync('report/report.json', JSON.stringify({
						...report,
						error: '',
						overLimitFlag: false,
						groupIndex
					}))
					console.log('success\n')
				}).catch((error: any) => {
					failCounter++
					if(error.data === 429) {
						console.error('fail-due-to-rate-over-limit \n')
						serverError = 'rate-over-limit'
					}

					if(error.data === 400) {
						console.error('fail-due-to-Bad-Request \n')
						serverError = 'bad-request'
					}

					if(error.data === 426) {
						console.error('fail-due-to-upgrade-required \n')
						serverError = 'upgrade-required'
					}

					fs.appendFileSync('report/' + currentSim.number + '/fail.json', '\n"' + link + '", ' + error.toString() + ',')
				})

				report = {
					groupIndex,
					serverError,
					current: { currentSim, tryCounter, successCounter, failCounter, joinConfig }
				}
				fs.writeFileSync('report/report.json', JSON.stringify(report))
				fs.writeFileSync('report/' + currentSim.number + '/report.json', JSON.stringify(report))
				if(failCounter > joinConfig.maxFailTry) {
					console.error('break from list: from ', joinConfig.fromRow, ' to ', joinConfig.toRow)
					break
				}

				await new Promise(f => setTimeout(f, joinConfig.sleepTimer))
			}
		}
	}
}
