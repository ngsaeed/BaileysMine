import { GroupMetadata, proto, WAMessage } from '../../lib'
import * as fs from 'node:fs';
import {IpmPost} from '../models/ipm-post.model';
import { MinIOConfig } from '../models/min-i-o-config'
import IWebMessageInfo = proto.IWebMessageInfo
const moment = require('moment')
const Minio = require('minio')
import { unlinkSync } from 'fs'

export const makeFileName = (msg: IWebMessageInfo): string => {
  return msg.key.id + '.' + msg.message!.imageMessage!.mimetype!.substring(6)
}

export const makefilePathInBucket = (groupName: string, filename: string): string => {
  return `/${moment.utc().format('YYYY/MM/DD')}/${groupName}/${filename}`
}

export const generateExpectedIpmPostStr = (msg: WAMessage, groupInfo: GroupMetadata, filePath?: string): string => {
  const publishTimeInSeconds = msg.messageTimestamp ? msg.messageTimestamp : 0
  if(filePath){
    return JSON.stringify(new IpmPost(+publishTimeInSeconds, +publishTimeInSeconds ,msg.key.participant + '',JSON.stringify({msg, groupInfo, filePath})))
  } else {
    return JSON.stringify(new IpmPost(+publishTimeInSeconds, +publishTimeInSeconds ,msg.key.participant + '',JSON.stringify({msg, groupInfo})))
  }
}

export const listConnectionsState = (actives, intervalBetweenStateLogs) => {
  setInterval(() => {
    console.log('\n\nconnections list:\n')
    actives.forEach(active => {
      console.log(active.key, ', ', active.number, ', connected: ', active.connection, ', chatsLength: ' , active.chatsLength , active.connection ? '' : '*****')
    })
  }, intervalBetweenStateLogs * 1000)
}

export const preparePartialJoinConfig = (lastGroupIndex, iteration, numberOfGroups) => {
  const fromRow = lastGroupIndex + (iteration * numberOfGroups) + 1
  const toRow = fromRow + numberOfGroups - 1
  console.log('\n\nfrom Row: ', fromRow, ' to Row: ', toRow, '\n\n')
  fs.writeFileSync('report/lastGroupIndex.json', JSON.stringify({lastGroupIndex: toRow}))
  return {fromRow, toRow, numberOfGroups}
}

export const sendToMinIOBucket = (objectToSent: {fileName: string, mimeType?: string | null}, minIOConfig: MinIOConfig, filePathInBucket: string) => {
  const minioClient = new Minio.Client(minIOConfig)

  const metaData = {
    'Mime-Type': objectToSent.mimeType,
  }

  // Using fPutObject API upload your file to the bucket europetrip.
  minioClient.fPutObject('whatsapp', filePathInBucket, objectToSent.fileName, metaData, function (err, etag) {
    if (err) return console.log(err)
    try {
      unlinkSync('./' + objectToSent.fileName)
    } catch(e) {
      console.error('remove file error. ', e)
    }
  })
}
