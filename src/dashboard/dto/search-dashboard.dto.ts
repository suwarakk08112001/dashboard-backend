import { IsOptional, IsNumber } from 'class-validator';
export class SearchDto{
    @IsOptional()
    @IsNumber()
    year?:number;

    @IsOptional()
    @IsNumber()
    month?:number;
}