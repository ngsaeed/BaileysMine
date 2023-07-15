export class IpmPost {
  publish_ts: number
  fetch_ts: number
  user_id: string
  raw_data = ''
  platform = 'whatsapp'
  country = 'ir'
  sub_platform = 'post'
  fetch_info = 'ts'

  constructor(publish_ts: number, fetch_ts: number, user_id: string, raw_data: any) {
    this.publish_ts = publish_ts;
    this.fetch_ts = fetch_ts;
    this.user_id = user_id;
    this.raw_data = raw_data;
  }
}
