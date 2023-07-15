import { GroupMetadata, WAMessage } from '../../lib'
import { generateExpectedIpmPostStr } from '../scripts/helpers'

export class QueueConfig{
  producer: any
  sendMsgToKafkaTopics: (msg: WAMessage, groupInfo: GroupMetadata, filePath?: string) => void
  topics: string[] = []
  shouldConnectToKafka = true

  constructor(producer: any, topics: string[], shouldConnectToKafka: boolean) {
    this.producer = producer;
    this.topics = topics;
    this.shouldConnectToKafka = shouldConnectToKafka;
    this.sendMsgToKafkaTopics = async(msg: WAMessage, groupInfo: GroupMetadata, filePath?: string) => {
      let ipmPost = '';
      if(filePath){
        ipmPost = generateExpectedIpmPostStr(msg, groupInfo, filePath)
      } else {
        ipmPost = generateExpectedIpmPostStr(msg, groupInfo)
      }
      for (const topic of topics) {
        if (topic === 'whatsapp-raw-data') {
          await producer.send({
            topic,
            messages: [
              {value: ipmPost}
            ],
          })
        }
      }
    };
  }
}
