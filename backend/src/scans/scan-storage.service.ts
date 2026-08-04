import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

interface ScanFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

interface StoredScan {
  fileName: string;
  mimeType: string;
  storageUrl: string | null;
  storageKey: string | null;
}

@Injectable()
export class ScanStorageService {
  constructor(private readonly config: ConfigService) {}

  async store(file: ScanFile, folder = 'time-sheets') {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      return new Promise<{ storageUrl: string; storageKey: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `bhm-v2/${folder}`,
              resource_type: file.mimetype.startsWith('image/') ? 'image' : 'raw',
              use_filename: true,
              unique_filename: true,
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({ storageUrl: result.secure_url, storageKey: result.public_id });
            },
          );
          stream.end(file.buffer);
        },
      );
    }

    const directory = join(process.cwd(), 'uploads', folder);
    await mkdir(directory, { recursive: true });
    const storedName = `${Date.now()}-${crypto.randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(directory, storedName), file.buffer);
    return { storageUrl: null, storageKey: `${folder}/${storedName}` };
  }

  async read(file: StoredScan): Promise<ScanFile> {
    if (file.storageUrl) {
      const response = await fetch(file.storageUrl);
      if (!response.ok) {
        throw new Error(`Fichier stocke indisponible (${response.status}).`);
      }
      return {
        originalname: file.fileName,
        mimetype: file.mimeType,
        buffer: Buffer.from(await response.arrayBuffer()),
      };
    }

    if (!file.storageKey) {
      throw new Error('Reference de stockage manquante.');
    }
    return {
      originalname: file.fileName,
      mimetype: file.mimeType,
      buffer: await readFile(join(process.cwd(), 'uploads', file.storageKey)),
    };
  }
}
