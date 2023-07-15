export interface MinIOConfig {
	endPoint: string,
	port: number,
	useSSL: boolean,
	accessKey: string,
	secretKey: string,
	shouldUploadToMinIO: boolean,
}
