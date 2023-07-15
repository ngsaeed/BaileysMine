import { Boom } from '@hapi/boom'

import JoinConfig from '../models/join-config.model'
import joinToGroups from './join-to-groups'
import makeWASocket, {
	DisconnectReason, downloadMediaMessage,
	fetchLatestBaileysVersion, makeCacheableSignalKeyStore,
	makeInMemoryStore, proto,
	useMultiFileAuthState
} from '../../lib'
import * as readline from 'readline'
import { PHONENUMBER_MCC, WAMessageContent, WAMessageKey } from '../../src'
import { QueueConfig } from '../models/queue-config.model'
import { StartSocketConfig } from '../models/start-socket-config.model'
import logger from '../logger'
import { writeFile, unlink } from 'fs/promises'
import { MinIOConfig } from '../models/min-i-o-config'
import { makeFileName, makefilePathInBucket, sendToMinIOBucket } from './helpers'
import {HttpsProxyAgent} from "https-proxy-agent";
//http://hamedshp-rotate:13adce13adce@p.webshare.io:80

const agent  = new HttpsProxyAgent('http://sanay:Sr4Pe*@144.76.147.50:443');
export const startSock = async(
	joinToGroupsConfig: JoinConfig = {
		joinGroupsFlag: false,
		fromRow: 0,
		toRow: 0,
		sleepTimer: 60000,
		maxFailTry: 0,
		groupsFilePath: ''
	},
	// queueConfig: QueueConfig,
	startSocketConfig: StartSocketConfig,
	minIOConfig: MinIOConfig
) => {
	const dataFile = './data/' + startSocketConfig.currentSim.key + '.json'
	// the store maintains the data of the WA connection in memory
	// can be written out to a file & read from it
	const store = startSocketConfig.useStore ? makeInMemoryStore({ logger: startSocketConfig.logger }) : undefined
	store?.readFromFile(dataFile)

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if(store) {
			const msg = await store.loadMessage(key.remoteJid!, key.id!)
			return msg?.message || undefined
		}

		// only if store is present
		return proto.Message.fromObject({})
	}

	// save every ... seconds
	setInterval(() => {
		store?.writeToFile(dataFile)
		startSocketConfig.currentSim.chatsLength = store ? store.chats.length : 0
	}, 60_000)


	const { state, saveCreds } = await useMultiFileAuthState('auth/' + startSocketConfig.currentSim.number)
	// fetch the latest version of WA Web
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)
	// if(queueConfig.shouldConnectToKafka) {
	// 	await queueConfig.producer.connect()
	// }
	const sock = makeWASocket({
		version,
		logger: startSocketConfig.logger,
		printQRInTerminal: true,
		// agent: agent,
		// fetchAgent: agent,
		mobile: startSocketConfig.useMobile,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, startSocketConfig.logger),
		},
		msgRetryCounterCache: startSocketConfig.msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		// shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries & poll updates
		getMessage
	})

	// If mobile was chosen, ask for the code
	if(startSocketConfig.useMobile && startSocketConfig.singleMode && !sock.authState.creds.registered) {
		const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

		const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
		const { registration } = sock.authState.creds || { registration: {} }

		if(!registration.phoneNumber) {
			// registration.phoneNumber = await question('Please enter your mobile phone number:\n')
			registration.phoneNumber = startSocketConfig.currentSim.universalNumber
		}
		const libPhonenumber = await import('libphonenumber-js')
		const phoneNumber = libPhonenumber.parsePhoneNumber(registration!.phoneNumber)
		if(!phoneNumber?.isValid()) {
			throw new Error('Invalid phone number: ' + registration!.phoneNumber)
		}

		registration.phoneNumber = phoneNumber.format('E.164')
		registration.phoneNumberCountryCode = phoneNumber.countryCallingCode
		registration.phoneNumberNationalNumber = phoneNumber.nationalNumber
		const mcc = PHONENUMBER_MCC[phoneNumber.countryCallingCode]
		if(!mcc) {
			throw new Error('Could not find MCC for phone number: ' + registration!.phoneNumber + '\nPlease specify the MCC manually.')
		}

		registration.phoneNumberMobileCountryCode = mcc

		// eslint-disable-next-line no-inner-declarations
		async function enterCode() {
			try {
				const code = await question('Please enter the one time code:\n')
				const response = await sock.register(code.replace(/["']/g, '').trim().toLowerCase())
				console.log('Successfully registered your phone number.')
				console.log(response)
				rl.close()
			} catch(error) {
				console.error('Failed to register your phone number. Please try again.\n', error)
				await askForOTP()
			}
		}

		// eslint-disable-next-line no-inner-declarations
		async function askForOTP() {
			registration.method = 'sms'
			try {
				await sock.requestRegistrationCode(registration)
				await enterCode()
			} catch(error) {
				console.error('Failed to request registration code. Please try again.\n', error)
				// await askForOTP()
			}
		}

		askForOTP()
	}

	store?.bind(sock.ev)

	// the process function lets you process all events that just occurred
	// efficiently in a batch
	sock.ev.process(
		// events is a map for event name => event data
		async(events) => {

			// something about the connection changed
			// maybe it closed, or we received all offline message or connection opened
			if(events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update
				console.log(startSocketConfig.currentSim.key, startSocketConfig.currentSim.number, 'connection update', update)
				if(connection === 'close') {
					startSocketConfig.currentSim.connection = false
					// reconnect if not logged out
					if((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut && !startSocketConfig.useMobile) {
						startSock(joinToGroupsConfig,  startSocketConfig, minIOConfig)
					} else {
						console.log('Connection closed. You are logged out.')
					}
				}

				if(connection === 'open') {
					startSocketConfig.currentSim.connection = true
					if(joinToGroupsConfig.joinGroupsFlag) {
						await joinToGroups(sock, joinToGroupsConfig, startSocketConfig.currentSim)
					}
				}
			}

			// credentials updated -- save them
			if(events['creds.update']) {
				await saveCreds()
			}

			if(events.call) {
				console.log('recv call event', events.call)
			}

			// history received
			if(events['messaging-history.set']) {
				const { chats, contacts, messages, isLatest } = events['messaging-history.set']
				console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`)
				console.log('chatsLength: ', store?.chats.length)
				startSocketConfig.currentSim.chatsLength = store ? store.chats.length : 0
			}

			// received a new message
			if(events['messages.upsert']) {
				const upsert = events['messages.upsert']
				// console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

				if(upsert.type === 'notify') {
					for(const msg of upsert.messages) {
						if(!msg.key.fromMe && startSocketConfig.doReplies) {
							await sock!.readMessages([msg.key])
							const groupMetaData = await store?.fetchGroupMetadata(msg.key.remoteJid ? msg.key.remoteJid : '', sock)
							//temporarily just text messages is sent to kafka
							if(msg.message?.conversation) {
								// if(groupMetaData && queueConfig.shouldConnectToKafka) {
								// 	queueConfig.sendMsgToKafkaTopics(msg, groupMetaData)
								// }
							} else if(msg.message?.imageMessage) {
								if(groupMetaData && minIOConfig.shouldUploadToMinIO) {
									const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
										logger,
										reuploadRequest: sock.updateMediaMessage
									})
									const fileName = makeFileName(msg)
									const filePathInBucket = makefilePathInBucket(groupMetaData.subject, fileName)
									await writeFile('./' + fileName, buffer)
									sendToMinIOBucket({ fileName, mimeType: msg.message!.imageMessage!.mimetype }, minIOConfig, filePathInBucket)
									// if(queueConfig.shouldConnectToKafka) {
									// 	queueConfig.sendMsgToKafkaTopics(msg, groupMetaData, '/whatsapp' + filePathInBucket)
									// }
								}
							} else if(msg.message?.videoMessage) {
								console.log('skipping videoMessage')
							} else {
								console.log('skipping otherTypeMessage')
							}
						}
					}
				}
			}
		}
	)
	return sock
}
