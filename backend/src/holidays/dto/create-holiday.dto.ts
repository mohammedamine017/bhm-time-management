import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateHolidayDto {
  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;
}
