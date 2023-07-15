import { Kafka, KafkaConfig } from 'kafkajs'
import * as fs from 'node:fs'
import NodeCache from 'node-cache'
import { jActives } from './numbers/active-numbers'
import MAIN_LOGGER from './logger'
import { numbersForJoin } from './numbers/numbers-for-join'
import { startSock } from './scripts/start-socket'
import {
	listConnectionsState,
	preparePartialJoinConfig,
} from './scripts/helpers'
import { QueueConfig } from './models/queue-config.model'
import { MinIOConfig } from './models/min-i-o-config'

const maxFailTry = 5 // maximum number of errors that can occur during join to groups
const sleepTimer = 30_000 // the time to sleep between each join request
const numberOfGroups = 10 // total number of groups to join with each account
const intervalBetweenAccounts = 1 // seconds to sleep between accounts
const intervalBetweenStateLogs = 60 // seconds to sleep between connections State logs
// const brokers = ['kafka301:9092'] // kafka brokers
const loggerLevel: 'trace' | 'silent' | 'debug' | 'error' | 'fatal' | 'warn' | 'info' = 'silent'
const GROUPS_FILE_PATH = 'groups/wa_groups_5967.xlsx'
const useStore = !process.argv.includes('--no-store')
const doReplies = !process.argv.includes('--no-reply')
const singleMode = process.argv.includes('--single')
const useMobile = !process.argv.includes('--no-mobile')
const joinGroupsFlag = process.argv.includes('--join-groups')
const shouldConnectToKafka = !process.argv.includes('--no-kafka') // if for any reason not going to connect to kafka set this arg
const shouldUploadToMinIO = !process.argv.includes('--no-minio') // if for any reason not going to connect to kafka set this arg
const topics =  ['whatsapp-raw-data'] // multiple kafka topics names to send messages

const simsList = joinGroupsFlag ? numbersForJoin : jActives
// const kafkaConfig: KafkaConfig = { brokers }
// const producer = new Kafka(kafkaConfig).producer()
const logger = MAIN_LOGGER.child({})
logger.level = loggerLevel
let lastGroupIndexObj = { lastGroupIndex: 0 }
if(fs.existsSync('report/lastGroupIndex.json')) {
	lastGroupIndexObj = JSON.parse(fs.readFileSync('report/lastGroupIndex.json').toString())
}
const lastGroupIndex = lastGroupIndexObj.lastGroupIndex
let secondsCounter = 0
let iteration = 0

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache()

// const queueConfig: QueueConfig = new QueueConfig(producer, topics, shouldConnectToKafka)
const minIOConfig: MinIOConfig = {endPoint: '10.1.41.34', port: 9000, secretKey: "oaXVm3Q47QIy7T44Qw1mzjP2X2m5QeI4XwrG5yfG", accessKey: "Zzu8IQBd7yn4UmMbY1J6", useSSL: false, shouldUploadToMinIO}
const startSockConfig = { singleMode, useMobile, useStore, doReplies, logger, msgRetryCounterCache }
const part1JoinConfig = { maxFailTry, joinGroupsFlag, sleepTimer, groupsFilePath: GROUPS_FILE_PATH }
let partialJoinConfig: any = {}

listConnectionsState(jActives, intervalBetweenStateLogs)
simsList.forEach(currentSim => {
	setTimeout(() => {
		if(joinGroupsFlag) {
			partialJoinConfig = preparePartialJoinConfig(lastGroupIndex, iteration, numberOfGroups)
		}
		startSock(
			{ ...partialJoinConfig, ...part1JoinConfig },
			// queueConfig,
			{ ...startSockConfig, currentSim },
			minIOConfig
		)
		iteration++
	}, intervalBetweenAccounts * 1000 * secondsCounter++)
})
