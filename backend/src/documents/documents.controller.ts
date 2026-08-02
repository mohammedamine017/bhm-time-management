import { Controller, Get } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('archive')
  archive() {
    return this.documents.archive();
  }
}
