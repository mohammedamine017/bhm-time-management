import { IsString, MaxLength } from 'class-validator';

export class UpdateExtractedDayDto {
  @IsString()
  @MaxLength(5)
  value!: string;
}
