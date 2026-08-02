import { IsString } from 'class-validator';

export class UpdateTimeClockDayDto {
  @IsString()
  value!: string;
}
