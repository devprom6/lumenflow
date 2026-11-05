export interface KmsService {
  sign(keyId: string, data: Buffer): Promise<Buffer>;
  verify(keyId: string, data: Buffer, signature: Buffer): Promise<boolean>;
  getPublicKey(keyId: string): Promise<string>;
}

export const KMS_SERVICE = Symbol('KMS_SERVICE');
