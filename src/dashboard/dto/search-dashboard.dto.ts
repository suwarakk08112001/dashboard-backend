import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  financialYear?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  month?: number;
}
