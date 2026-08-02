import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

@Injectable()
export class EmployeeFilesService {
  constructor(private readonly config: ConfigService) {}

  async store(file: { originalname: string; buffer: Buffer }) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      return new Promise<{ storageUrl: string; storageKey: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'bhm-v2/employee-lists',
              resource_type: 'raw',
              use_filename: true,
              unique_filename: true,
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({
                storageUrl: result.secure_url,
                storageKey: result.public_id,
              });
            },
          );
          stream.end(file.buffer);
        },
      );
    }

    const directory = join(process.cwd(), 'uploads', 'employee-lists');
    await mkdir(directory, { recursive: true });
    const storedName = `${Date.now()}-${crypto.randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(directory, storedName), file.buffer);
    return {
      storageUrl: null,
      storageKey: `employee-lists/${storedName}`,
    };
  }
}
